import { init as initUtils, __dirname, getHTML, stop, sendStartupInfo, releaseCheck, isSiteActive, setActive, waitFor, setup } from './js/utils.js';
import * as db from './js/database-interface.js';
import { FA_DOWN, FA_URL_BASE, FA_USER_BASE } from './js/constants.js';
import { checkIfLoggedIn, handleLogin, forceNewLogin, username, checkForOldTheme } from './js/login.js';
import { getSubmissionLinks, scrapeSubmissionInfo, saveUserProfile, ensureUserProfile } from './js/scrape-data.js';
import { initDownloads } from './js/download-content.js';
import { initGallery } from './js/view-gallery.js';
import { isSafeExternalUrl, normalizeSubmissionUrl, parseUsernameList } from './js/sanitize.js';
import { resolve } from 'node:path';
import open from 'open';
import random from 'random';
import fs from 'fs-extra';
import { setupBrowser } from './js/setup-browsers.js';
import { spawn } from 'node:child_process';
import {  default as process } from 'node:process';

const startupLink = `file://${resolve(__dirname, './html/startup.html')}`;

let inProgress = false;
// handles single submission downloads, useful for not downloading an entire gallery
async function startSubmissionDownload(url) { 
  if (inProgress) return console.log('[Data] Program already running!');
  const submissionUrl = normalizeSubmissionUrl(url);
  if (!submissionUrl) return console.log('[Warn] Not a valid FurAffinity submission link!');
  inProgress = true;
  console.log(`[Data] Downloading single submission: ${submissionUrl}`);
  await db.saveLinks([submissionUrl]).catch((e) => {
    if (!e?.message?.includes('UNIQUE constraint failed')) throw e;
    console.log('[Data] Submission already in database, re-downloading...');
  });
  Promise.all([
    scrapeSubmissionInfo({ data: [{ url: submissionUrl }], downloadComments: true }),
    initDownloads(),
  ]).then(() => {
    if (!stop.now) console.log('Submission download complete! ♥');
  }).finally(() => {
    inProgress = false;
    setActive(false);
  });
}

async function startDataScraping(uName = username, scrapeGallery = true, scrapeComments = true, scrapeFavorites) {
  if (inProgress) return console.log('[Data] Program already running!');
  if (uName) {
    // Only well-formed FA usernames may be turned into URLs and folder names
    const { valid: allNames, invalid } = parseUsernameList(uName);
    if (invalid.length) console.log(`[Warn] Ignoring invalid username(s): ${invalid.join(', ')}`);
    if (!allNames.length) return console.log('[Warn] No valid usernames given!');
    inProgress = true;
    let name = allNames.shift();
    while (name && !stop.now) {
      const FA_GALLERY_URL = `${FA_URL_BASE}/gallery/${name}/`;
      const FA_SCRAPS_URL = `${FA_URL_BASE}/scraps/${name}/`;
      const FA_FAVORITES_URL = `${FA_URL_BASE}/favorites/${name}/`;

      // Check if valid username
      const $ = await getHTML(FA_USER_BASE + name).catch(() => false);
      if (!$ || /system.error/i.test($('title').text())) {
        console.log(`[Warn] Invalid username: ${name}`);
        break;
      }
      // Record the account's permanent UUID and link any existing data to it
      const user = await saveUserProfile($).catch((e) => console.log(`[Warn] Could not save user profile: ${e.message}`));
      if (user) console.log(`[Data] Tracking ${user.username} by UUID ${user.uuid}`);
      // Scrape data from gallery pages
      if (scrapeGallery) {
        await getSubmissionLinks({ url: FA_GALLERY_URL, username: name });
        await getSubmissionLinks({ url: FA_SCRAPS_URL, isScraps: true, username: name });
      }
      if (scrapeFavorites)
        await getSubmissionLinks({ url: FA_FAVORITES_URL, isFavorites: true, username: name, userUuid: user?.uuid });
      name = allNames.shift();
    }
    if (stop.now) console.log('[Data] Process halted!');
  } else {
    console.log('[Data] Continuing previous download...');
  }
  // Scrape data from collected submission pages
  Promise.all([
    scrapeSubmissionInfo({ downloadComments: scrapeComments }),
    initDownloads(),
  ]).then(() => {
    if(!stop.now) console.log('Requested downloads complete! ♥');
  }).finally(() => {
    inProgress = false;
    setActive(false);
  });
}

async function checkDBRepair() {
  const needsRepair = await db.needsRepair();
  if (needsRepair.length)
    console.log(`[Data] Database in need of repair:  ${needsRepair.length} submissions have incomplete data.`);
}

async function init() {
  // Setup utils
  setup();
  // Init database
  await db.init();
  const { page, browser } = await setupBrowser();
  // Setup user logging
  await initUtils(page);
  
  // Rebrowser-puppeteer compatibility: Use CDP binding instead of exposeFunction
  const cdpSession = await page.createCDPSession();
  await cdpSession.send('Runtime.enable');
  
  cdpSession.on('Runtime.bindingCalled', async ({ name, payload }) => {
    if (name !== '__userPathBinding') return;
    const data = JSON.parse(payload);
    const { choice } = data;
    stop.reset();
    if (choice === 'login') {
      if (!await isSiteActive()) return console.log(FA_DOWN);
      if (!await checkIfLoggedIn(browser)) await handleLogin();
      else await forceNewLogin(browser);
      await checkForOldTheme();
      await sendStartupInfo({ queryName: username});
    } else if (choice === 'start-download') {
      if (!await isSiteActive()) return console.log(FA_DOWN);
      if (!await checkIfLoggedIn(browser)) await handleLogin();
      await checkForOldTheme();
      if (data.submissionUrl) {
        startSubmissionDownload(data.submissionUrl);
      } else {
        const { name, scrapeGallery, scrapeComments, scrapeFavorites } = data;
        startDataScraping(name, scrapeGallery, scrapeComments, scrapeFavorites);
      }
      await waitFor(3000);
      await sendStartupInfo();
    } else if (choice === 'view-gallery') {
      console.log(`[Data] Opening gallery viewer...`);
      await initGallery(browser);
    } else if (choice === 'stop-all') {
      stop.now = true;
      console.log('Stopping data scraping...');
    } else if (choice === 'open') {
      if (isSafeExternalUrl(data.url)) open(data.url);
    } else if (choice === 'repair') {
      if (inProgress)
        return console.log(`[Data] Please stop data scraping before restarting!`);
      console.log('[Data] Checking database...');
      inProgress = true;
      setActive(true);
      await db.deleteBlankSubmissionInfo();
      // Backfill UUIDs for users already in the database (one profile request per unknown user)
      const missingUuid = await db.getUsernamesMissingUuid();
      if (missingUuid.length) console.log(`[Data] Looking up UUIDs for ${missingUuid.length} users...`);
      for (const name of missingUuid) {
        if (stop.now) break;
        await ensureUserProfile(name).catch(() => {});
        await waitFor(random.int(1000, 2000));
      }
      const inNeedOfRepair = await db.needsRepair();
      if (inNeedOfRepair.length) {
        console.log('Database incomplete! Working on that now...');
        await scrapeSubmissionInfo({ data: inNeedOfRepair, downloadComments: true })
          .finally(() => {
            inProgress = false;
            setActive(false);
          });
        if (!stop.now) console.log(`Database repaired!`);
      } else {
        inProgress = false;
        setActive(false);
        console.log(`[Data] Database OK!`);
      }
    } else if (choice === 'release-check') {
      sendStartupInfo(await releaseCheck());
    } else if (choice === 'delete-account') {
      stop.now = true;
      if (typeof data.name === 'string') await db.deleteOwnedAccount(data.name);
      sendStartupInfo();
    } else if(choice === 'delete-user-account') {
      stop.now = true;
      if (typeof data.name === 'string') await db.deleteAccount(data.name);
      sendStartupInfo();
    } else if (choice === 'import-old-data') {
      // Check for old folder
      const pathStr = '../fa_gallery_downloader';
      let pathCheck = resolve(pathStr);
      let exists = await fs.pathExists(pathCheck);
      // Check one more folder up, just in case
      if (!exists) {
        pathCheck = resolve(`../${pathStr}`);
        exists = await fs.pathExists(pathCheck);
      }
      // if exists, move
      if (exists) {
        console.log('Data found, shutting down...');
        await waitFor(2000);
        await page.close();
        await waitFor(2000);
        // We need to close browser to move data properly
        await fs.emptyDir(resolve('./fa_gallery_downloader')).catch(console.error);
        await fs.move(pathCheck, resolve('./fa_gallery_downloader'), { overwrite: true })
          .catch(console.error);
        // Restart process
        spawn(process.argv.shift(), process.argv, {
          cwd: process.cwd(),
          detached : true,
          stdio: "inherit"
        });
        console.log('Restarting...');
      } else {
        console.log('[Warn] Old data not found! Is the program in the same folder as older version?');
      }
    }
  });
  
  await cdpSession.send('Runtime.addBinding', { name: '__userPathBinding' });

  await page.evaluateOnNewDocument(() => {
    window.userPath = (data) => {
      window.__userPathBinding(JSON.stringify(data));
    };
  });
  
  page.on('domcontentloaded', async () => {
    await sendStartupInfo(await releaseCheck());
  });
  await page.goto(startupLink);
  const isFAUp = await isSiteActive();
  if (isFAUp && await checkIfLoggedIn(browser)) await sendStartupInfo();
  if (!isFAUp) console.log(FA_DOWN);
  // Repair DB if needed
  await checkDBRepair();
}

init();
