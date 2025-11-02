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
  
  // Rebrowser-puppeteer compatibility: use CDP bindings instead of exposeFunction
  // TODO: This is a mess, refactor later (chatgpt shitass code for complex binding testing)
  const cdpSession = await page.createCDPSession();
  await cdpSession.send('Runtime.enable');
  
  // Set up all binding listeners
  cdpSession.on('Runtime.bindingCalled', async ({ name, payload }) => {
    const { callId, data } = JSON.parse(payload);
    let result;
    
    if (name === '__getGalleryPageBinding') {
      result = await db.getGalleryPage(data.offset, data.count, data.query, data.sortOrder);
    } else if (name === '__getSubmissionPageBinding') {
      result = await db.getSubmissionPage(data);
    } else if (name === '__downloadCommentsBinding') {
      if (!username) await handleLogin(browser);
      if (!username) result = false;
      else {
        const isComplete = await scrapeComments(null, data.id, data.url);
        result = !!isComplete;
      }
    } else if (name === '__downloadContentBinding') {
      if (!username) await handleLogin(browser);
      if (!username) result = false;
      else {
        const isComplete = await downloadSpecificContent(data);
        result = !!isComplete;
      }
    } else if (name === '__openUrlBinding') {
      if (data) open(data);
      return;
    } else if (name === '__getContentPathBinding') {
      result = contentPath;
    }
        await page.evaluate((callId, result) => {
      if (window.__bindingCallbacks && window.__bindingCallbacks[callId]) {
        window.__bindingCallbacks[callId](result);
        delete window.__bindingCallbacks[callId];
      }
    }, callId, result);
  });
  
  // Create all CDP bindings
  await cdpSession.send('Runtime.addBinding', { name: '__getGalleryPageBinding' });
  await cdpSession.send('Runtime.addBinding', { name: '__getSubmissionPageBinding' });
  await cdpSession.send('Runtime.addBinding', { name: '__downloadCommentsBinding' });
  await cdpSession.send('Runtime.addBinding', { name: '__downloadContentBinding' });
  await cdpSession.send('Runtime.addBinding', { name: '__openUrlBinding' });
  await cdpSession.send('Runtime.addBinding', { name: '__getContentPathBinding' });
  
  // Inject wrapper functions
  await page.evaluateOnNewDocument(() => {
    let callIdCounter = 0;
    window.__bindingCallbacks = {};
    
    // Helper to create async wrapper functions
    const createAsyncWrapper = (bindingName) => {
      return (data) => {
        return new Promise((resolve) => {
          const callId = callIdCounter++;
          window.__bindingCallbacks[callId] = resolve;
          window[bindingName](JSON.stringify({ callId, data }));
        });
      };
    };
    
    // Create wrapper functions for each binding
    window.getGalleryPage = (params = {}) => createAsyncWrapper('__getGalleryPageBinding')(params);
    window.getSubmissionPage = (id) => createAsyncWrapper('__getSubmissionPageBinding')(id);
    window.downloadComments = (id, url) => createAsyncWrapper('__downloadCommentsBinding')({ id, url });
    window.downloadContent = (contentInfo) => createAsyncWrapper('__downloadContentBinding')(contentInfo);
    window.openUrl = (url) => {
      window.__openUrlBinding(JSON.stringify({ callId: -1, data: url }));
    };
    window.getContentPath = () => createAsyncWrapper('__getContentPathBinding')(null);
  });
  
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
