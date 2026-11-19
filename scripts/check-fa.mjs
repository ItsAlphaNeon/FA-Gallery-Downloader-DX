// Live canary: loads a few real FA pages with your saved login and runs the same checks as the fixture
// tests, so you find out FA changed its markup BEFORE a download silently saves bad data.
//
//   npm run check:fa [username]
//
// Close the downloader first (it holds the browser profile). Only makes a handful of read-only GET
// requests: home, the user's profile, gallery, scraps, favorites, and one submission.
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import path from 'node:path';
import fs from 'fs-extra';
import * as db from '../js/database-interface.js';
import { getBrowserPath } from '../js/setup-browsers.js';
import { BROWSER_DIR } from '../js/constants.js';
import { processUserHTML, processSubmissionHTML, parseGalleryLinks, parseFavoritesNextPage, parseComments } from '../js/scrape-data.js';
import { parseLoggedInUsername, isClassicTheme } from '../js/login.js';
import { checkLoggedIn, checkUser, checkGalleryLinks, checkSubmission, checkComments } from '../test/structure-checks.js';

const FA = 'https://www.furaffinity.net';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
function report(label, problems, note = '') {
  results.push(...problems);
  console.log(`${problems.length ? '✖' : '✔'} ${label}${note ? ` (${note})` : ''}`);
  problems.forEach(p => console.log(`    - ${p}`));
}

await db.init(); // remembers which downloaded browser to use
const { chromePath } = await getBrowserPath();
const userDataDir = path.resolve(BROWSER_DIR + 'chrome');
fs.ensureDirSync(userDataDir);
let browser;
try {
  browser = await puppeteer.launch({
    headless: false, executablePath: chromePath, userDataDir, defaultViewport: null,
    args: ['--disable-blink-features=AutomationControlled', '--window-size=1100,700'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
} catch (e) {
  console.error(`Could not start the browser (is the downloader still open?): ${e.message}`);
  process.exit(2);
}
const page = (await browser.pages())[0];
async function load(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  return cheerio.load(await page.content());
}

try {
  let $ = await load(FA + '/');
  const me = parseLoggedInUsername($);
  report('logged in', checkLoggedIn(me), me || 'not logged in - log in with the downloader first');
  if (!me) throw new Error('Not logged in');
  report('modern theme', isClassicTheme($) ? ['theme: FA is using the classic theme, which is not supported'] : []);

  const name = process.argv[2] || me;
  $ = await load(`${FA}/user/${name}/`);
  report('user profile + UUID', checkUser(processUserHTML($)), name);

  $ = await load(`${FA}/gallery/${name}/1/`);
  const gallery = parseGalleryLinks($);
  report('gallery', gallery.length ? checkGalleryLinks(gallery) : [], gallery.length ? `${gallery.length} submissions` : 'empty gallery, skipped');

  $ = await load(`${FA}/scraps/${name}/1/`);
  const scraps = parseGalleryLinks($);
  report('scraps', scraps.length ? checkGalleryLinks(scraps, 'scraps') : [], scraps.length ? `${scraps.length} submissions` : 'none, skipped');

  const favUrl = `${FA}/favorites/${name}/`;
  $ = await load(favUrl);
  const favs = parseGalleryLinks($);
  const next = parseFavoritesNextPage($, favUrl);
  report('favorites', favs.length ? checkGalleryLinks(favs, 'favorites') : [], favs.length ? `${favs.length} submissions, next page: ${next ? 'yes' : 'no'}` : 'none, skipped');

  const link = gallery[0] || scraps[0] || favs[0];
  if (link) {
    $ = await load(link);
    const data = processSubmissionHTML($, link);
    report('submission', checkSubmission(data, { requireTags: false }), link);
    const comments = parseComments($, data.id);
    report('comments', checkComments(comments), `${comments.length} on that submission`);
  } else {
    console.log('- no submission to check (nothing in gallery, scraps or favorites)');
  }
} catch (e) {
  results.push(`script error: ${e.message}`);
  console.error(e.message);
}
// Don't use browser.close() politely forever if something hangs
await browser.close().catch(() => {});
await db.close();
console.log(results.length ? `\n${results.length} problem(s): FA's markup may have changed. See the lines marked ✖.` : '\nAll good: FA still looks the way the parsers expect.');
process.exit(results.length ? 1 : 0);
