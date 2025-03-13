import { faRequestHeaders, username } from './login.js';
import * as cheerio from 'cheerio';
import got from 'got';
import { dirname, join, } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import * as db from './database-interface.js';
import { exitCode, default as process, platform } from 'node:process';
import { FA_URL_BASE, RELEASE_CHECK, LOG_DIR as logDir } from './constants.js';
/** @import { CheerioAPI } from 'cheerio' */

export const isWindows = platform === 'win32';
const maxRetries = 5;

export const stop = {
  should: false,
  get now() {
    return this.should || !!exitCode;
  },
  set now(shouldStop) {
    this.should = shouldStop;
  },
  reset() {
    this.should = false;
  }
};

// Get the main folder directory name
export const __dirname = join(dirname(fileURLToPath(import.meta.url)), '../');
// Page used to display messages to user
let page = null;
let version = '';

export function getVersion() {
  if (!version) {
    version = JSON.parse(fs.readFileSync(join(__dirname, './package.json'), 'utf8'))?.version;
  }
  return version;
}

/**
 * Creates a Promise from a non-async function. Useful for error catching
 * outside of try/catch blocks.
 * 
 * @param {Function} method 
 * @returns 
 */
export function getPromise(method) {
  return new Promise((resolve, reject) => {
    const results = method();
    (results) ? resolve(results) : reject();
  });
}
// Create debug log
const fileOptions = { mode: 0o770 };
const logFileName = join(logDir, `debug-${new Date().toJSON().slice(0, 10)}.log`);
let logFile = null;
let unhookErr, unhookLog;

export function setup() {
  fs.ensureFileSync(logFileName);
  logFile = fs.createWriteStream(logFileName, { flags: 'as', encoding: 'utf8', ...fileOptions });
  // Thanks to: https://gist.github.com/pguillory/729616 and https://stackoverflow.com/a/41135457
  function hook_stdout(stream, callback) {
    var old_write = stream.write;

    stream.write = (function (write) {
      return function (string, encoding, fd) {
        write.apply(stream, arguments);
        callback(string, encoding, fd);
      }
    })(stream.write);
    return () => stream.write = old_write;
  }
  async function saveToLog(string, encoding) {
    await logFile.write(`[${new Date().toISOString()}] ${string}`, encoding);

    if (page && !page?.isClosed()) {
      page?.evaluate(`window.logMsg?.(${JSON.stringify({ text: string })})`);
    }
  }
  unhookLog = hook_stdout(process.stdout, saveToLog);
  unhookErr = hook_stdout(process.stderr, saveToLog);
  logFile.write('---\n');

  process.on('uncaughtException', async function (err) {
    //logFile.write(`${err.stack}`);
    stop.now = true;
    console.error(err);
    await db.close();
    process.exit(2);
  });
  // Clean up log files
  fs.readdir(logDir, (_err, files) => {
    files.reverse().slice(5).forEach(val => {
      fs.remove(join(logDir, val));
    });
  });
}
export async function teardown() {
  unhookErr();
  unhookLog();
  await logFile?.end();
  process.removeAllListeners('uncaughtException');
}

/**
 * Creates a Promise that auto-resolves after the specified duration.
 * @param {Number} t 
 * @returns A timed Promise
 */
export async function waitFor(t = 1000) {
  return new Promise(r => setTimeout(r, t));
}
/**
 * Updates the current display of download progress for content.
 * @param {Object} data 
 * @param {String} id 
 */
export async function logProgress(progress = {}, bar = 'file') {
  const { transferred: value, total: max, filename } = progress;
  let reset = !max;
  if (!page?.isClosed()) {
    const data = { value, max, reset, bar, filename };
    await page.evaluate(`window.logProgress?.(${JSON.stringify(data)})`);
  }
}
logProgress.reset = (id) => {
  if (id) logProgress({ transferred: 0, total: 1 }, id);
}
logProgress.busy = (id) => {
  if (id) logProgress({ transferred: 0, total: 0 }, id);
}

/**
 * Retrieves the HTML from the given URL and loads it into a Cheerio object.
 * @param {String} url 
 * @returns {CheerioAPI}
 */
export function getHTML(url, sendHeaders = true) {
  const headers = sendHeaders ? faRequestHeaders : {};
  headers.timeout = { response: 3000 };
  return got(url, {
    ...headers, ...{
      timeout: { response: 3000 },
      retry: {
        limit: maxRetries,
      },
    }
  }).text()
    .then((result) => {
      console.log(`Loaded: ${url}`);
      return cheerio.load(result);
    }).catch((e) => {
      console.log(`[Warn] Cannot get HTML for: ${url}`);
      // console.error(e);
      return Promise.reject(e);
    });
}
/**
 * Checks Github for the latest version.
 * @returns {Object}
 */
export async function releaseCheck() {
  const data = { current: getVersion() };
  let $ = await getHTML(RELEASE_CHECK, false).catch(() => false);
  if ($) {
    const latest = $('a.Link--primary').first().text().replace('v', '');
    data.latest = latest;
  }
  return data;
}
export async function urlExists(url, sendHeaders = true) {
  let headers = sendHeaders ? faRequestHeaders : {};
  headers = {
    ...headers,
    method: 'HEAD',
    timeout: { response: 3000 },
    retry: {
      limit: maxRetries,
    },
  };
  return got(url, headers).then(() => true).catch(() => false);
}

export async function isSiteActive() {
  const isSiteUp = urlExists(FA_URL_BASE);
  const title = await getHTML(FA_URL_BASE).then($ => $('title').text()).catch(() => '');
  const isMaintenance = !title || /fa.is.temporarily.offline/i.test(title);
  return isSiteUp && !isMaintenance;
}
export async function sendStartupInfo(data = {}) {
  data.username = data.username || username;
  data.accounts = data.accounts || await db.getOwnedAccounts();
  data.downloadAccounts = data.downloadAccounts || await db.getAllUsernames();
  return page.evaluate(`window.setPageInfo?.(${JSON.stringify(data)})`);
}
export async function setActive(val = true) {
  if (stop.now) return;
  return page.evaluate(`window.setActive?.(${val})`);
}
/**
 * Binds the given Page object for future log messages.
 * @param {Puppeteer.Page} newPage 
 */
export async function init(newPage) {
  page = newPage;
  if (isWindows) {
    await import('node-hide-console-window')
      .then((hc) => { hc.hideConsole(); })
      .catch(() => () => { });
  }
}
/**
 * Saves the given data to a file on the local system for debugging.
 * @param {String} filename
 */
export function saveDebugFile(filename, data) {
  let dirPath = join(logDir, 'SavedObjects');
  fs.ensureDirSync(dirPath);
  let filePath = join(dirPath, filename);
  fs.writeFile(filePath, data, (err) => {
    if (err) console.error('Error writing debug file:', err);
  });
}
