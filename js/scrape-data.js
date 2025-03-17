import random from 'random';
import { FA_URL_BASE } from './constants.js';
import * as db from './database-interface.js';
import { logProgress, waitFor, getHTML, stop, sendStartupInfo, saveDebugFile } from './utils.js';

const scrapeID = 'scrape-div';
const progressID = 'data';
const maxRetries = 6;

/**
 * Walks the user's gallery in order to gather all submission links for future download.
 * @param {String} url Gallery URL
 * @param {Boolean} isScraps Is this the scraps folder or not?
 */
export async function getSubmissionLinks({ url, username, isScraps = false, isFavorites = false }) {
  let dirName = (isFavorites) ? 'favorites': (isScraps) ? 'scraps' : 'gallery';
  const divID = `${scrapeID}${isScraps ? '-scraps':''}`;
  let currPageCount = 1;
  let currLinks = 0;
  let stopLoop = false;
  let nextPage = ''; // Only valid if in favorites!
  console.log(`[Data] Searching user ${dirName} for submission links...`, divID);
  logProgress.busy(progressID);
  let retryCount = 0;
  while(!stopLoop && !stop.now) {
    const pageUrl = (!nextPage) ? url + currPageCount : nextPage;
    let $ =  await getHTML(pageUrl).catch(() => false);
    if (!$) {
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`[Warn] FA might be down, retrying in ${30 * retryCount} seconds`);
        await waitFor(30 * retryCount * 1000);
        continue;
      } else {
        stop.now = true;
        return console.log(`[Warn] FA might be down, please try again later`);
      }
    }
    retryCount = 0;
    // Check for content
    let newLinks = Array.from($('figcaption a[href^="/view"]'))
      .map((div) => FA_URL_BASE + div.attribs.href);
    if (!newLinks.length) {
      // console.log(`[Data] Found ${currPageCount} pages of submissions!`, divID);
      break;
    }
    await db.saveLinks(newLinks, isScraps, username).catch(() => stopLoop = true);
    if (stopLoop || stop.now) {
      console.log('[Data] Stopped early!');
      logProgress.reset(progressID);
      break;
    }
    if (isFavorites && username) await db.saveFavorites(username, newLinks);
    currLinks = currLinks += newLinks.length;
    currPageCount++;
    if (isFavorites) {
      nextPage = $(`form[action$="next"]`).attr('action');
      if (nextPage) nextPage = url.split('/favorite')[0] + nextPage;
      else break;
    }
    await waitFor(random.int(1000, 2500));
  }
  if (!stop.now) console.log(`[Data] ${currLinks} submissions found!`);
  logProgress.reset(progressID);
  await sendStartupInfo();
}
/**
 * Gathers and saves the comments from given HTML or url.
 * @param {Cheerio} $ 
 * @param {String} submission_id 
 * @param {String} url 
 */
export async function scrapeComments($, submission_id, url) {
  if (stop.now) return logProgress.reset(progressID);
  let retryCount = 0;
  do {
    $ = $ || await getHTML(url).catch(() => false);
    if (!$) {
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`[Warn] FA might be down, retrying in ${30 * retryCount} seconds`);
        await waitFor(30 * retryCount * 1000);
        continue;
      } else {
        return console.log(`[Data] Comment page not found: ${url}`);
      }
    }
    break;
  } while (!$);
  const comments = Array.from($('#comments-submission .comment_container'))
    .map((val) => {
      const $div = $(val);
      const isDeleted = $div.find('comment-container').hasClass('deleted-comment-container');
      let date = '';
      if (!isDeleted) {
        date = $div.find('comment-date > span').attr('title').trim();
        if (/ago/i.test(date)) date = $div.find('comment-date > span').text().trim();
      }
      const username = isDeleted ? '' : $div.find('comment-username').text().trim();
      return {
        id: $div.find('.comment_anchor').attr('id'),
        submission_id,
        width: $div.attr('style'),
        username,
        account_name: username.replace(/_/gi, ''),
        desc: isDeleted ? '' : $div.find('comment-user-text .user-submitted-links').html().trim(),
        subtitle: isDeleted ? '' : $div.find('comment-title').text().trim(),
        date,
      }
    });
  if(!comments.length) return;
  return db.saveComments(comments);
}
const metadataID = 'scrape-metadata';
/**
 * Gathers all of the relevant metadata from all uncrawled submission pages.
 * @returns 
 */
export async function scrapeSubmissionInfo({ data = null, downloadComments }) {
  let links = data || await db.getSubmissionLinks();
  if (!links.length || stop.now) return logProgress.reset(progressID);
  console.log(`[Data] Saving data for ${links.length} submissions...`, metadataID);
  let index = 0;
  let retryCount = 0;
  while (index < links.length && !stop.now) {
    logProgress({transferred: index+1, total: links.length}, progressID);
    let $ = await getHTML(links[index].url)
    .then(_$ => {
      if (!_$ || !_$('.submission-title').length) {
        if(_$('.section-body').text().includes('The submission you are trying to find is not in our database.')) {
          console.log(`[Error] Confirmed deleted, removing: ${links[index].url}`);
          db.deleteSubmission(links[index].url);
        } else {
          console.log(`[Error] Not found/deleted: ${links[index].url}`);
        }
        return false;
      } else {
        return _$;
      }
    })
    .catch(() => {
      return false;
    });
    if (!$) {
      retryCount++;
      if (retryCount < maxRetries / 2) {
        console.log(`[Warn] FA might be down, retrying in ${30 * retryCount} seconds`);
        await waitFor(30 * retryCount * 1000);
        continue;
      } else {
        retryCount = 0;
        index++;
        await waitFor(random.int(2000, 3500));
        continue;
      }
    }
    retryCount = 0;
    // Get data if page exists
    let date = $('.submission-id-sub-container .popup_date').attr('title').trim();
    if (/ago$/i.test(date)) date = $('.submission-id-sub-container .popup_date').text().trim();
    // Updated selector to match the raw HTML structure
    let prettyUsername = $('.section-header .c-usernameBlockSimple__displayName')
      .first()
      .text()
      .trim();
    // Fix for username weirdness sometimes
    // TODO: Fix this, as it is a hacky solution to a problem that should not exist
    // if (prettyUsername.toString().endsWith("'s")) {
    //   prettyUsername = prettyUsername.toString().slice(0, -2);
    // } else if (prettyUsername.toString().endsWith("'")) {
    //   prettyUsername = prettyUsername.toString().slice(0, -1);
    // }
    // https://www.furaffinity.net/user/felisrandomis/
    let username = $('.section-header .c-usernameBlockSimple__displayName')
      .attr('title').trim();
    const data = {
      id: links[index].url.split('view/')[1].split('/')[0],
      title: $('.submission-title').text().trim(),
      username,
      account_name: username.replace(/_/gi, ''),
      pretty_username: prettyUsername,
      desc: $('.submission-description').html().trim(),
      tags: $('.tags-row').text().match(/([A-Z])\w+/gmi)?.join(','),
      content_name: $('.download > a').attr('href').split('/').pop(),
      content_url: $('.download > a').attr('href'),
      date_uploaded: date,
      thumbnail_url: $('.page-content-type-text, .page-content-type-music').find('#submissionImg').attr('src') || '',
      rating: $('.rating .rating-box').first().text().trim(),
      category: $('.info.text > div > div').text().trim(),
    };
    // Test to fix FA url weirdness
    if (!/^https/i.test(data.content_url)) data.content_url = 'https:' + data.content_url;
    if (data.thumbnail_url && !/^https/i.test(data.thumbnail_url))
      data.thumbnail_url = 'https:' + data.thumbnail_url;
    // Save data to db
    await db.saveMetaData(links[index].url, data);
    // Save comments 
    if (downloadComments) await scrapeComments($, data.id);
    index++;
    if (index % 2) await waitFor(random.int(1000, 2500));
  }
  if (!stop.now) console.log('[Data] All submission metadata saved!');
  logProgress.reset(progressID);
}
