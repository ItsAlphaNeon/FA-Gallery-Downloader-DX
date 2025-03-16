import { __dirname } from './utils.js';
import * as db from './database-interface.js';
import { join, resolve } from 'path';
import { scrapeComments } from './scrape-data.js';
import { downloadSpecificContent } from './download-content.js';
import { handleLogin, username } from './login.js';
import open from 'open';
import { pathToFileURL } from 'url';

const galleryLink = pathToFileURL(resolve(__dirname, './html/gallery.html')).href;
const contentPath = pathToFileURL(resolve('file://', '../fa_gallery_downloader/downloaded_content')).href;

let page = null;

async function sendData() {
  const data = {
    favUsernames: await db.getAllFavUsernames(),
    usernames: await db.getAllUsernames(),
  };
  await page.evaluate(`window.setPageInfo?.(${JSON.stringify(data)})`);
}
export async function initGallery(browser) {
  if (page) return;
  page = await browser.newPage();
  await page.bringToFront();
  page.on('close', () => page = null);
  await page.exposeFunction('getGalleryPage', async ({ offset, count, query, sortOrder } = {}) => {
    // Get all data for given gallery page using offset
    const data = await db.getGalleryPage(offset, count, query, sortOrder);
    return data;
  });
  await page.exposeFunction('getSubmissionPage', async (id) => {
    // Get all data for given submission page
    const data = await db.getSubmissionPage(id);
    return data;
  });
  await page.exposeFunction('downloadComments', async (id, url) => {
    if (!username) await handleLogin(browser);
    if (!username) return false;
    const isComplete = await scrapeComments(null, id, url);
    return !!isComplete;
  });
  await page.exposeFunction('downloadContent', async (contentInfo) => {
    if (!username) await handleLogin(browser);
    if (!username) return false;
    const isComplete = await downloadSpecificContent(contentInfo);
    return !!isComplete;
  });
  await page.exposeFunction('openUrl', (url) => {
    if (url) open(url);
  });
  await page.exposeFunction('getContentPath', () => contentPath);
  page.on('domcontentloaded', sendData);
  await page.goto(galleryLink);
  page.on('console', msg => {
    const text = msg.text();
    if(/you are running/i.test(text)) return;
    if (msg.type() === 'error'){
      let errorLoc = Object.values(msg.location()).toString().split('fa_gallery_downloader').pop();
      console.error(`[Gallery] ${text}:\n.../fa_gallery_downloader${errorLoc}`);
    } else console.log(`[Gallery] ${text}`)
  });
}
