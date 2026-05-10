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
    const data = processSubmissionHTML($, links[index].url);
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
/**
 * Processes the HTML of a submission page to process all data fields. Returns an object with all relevant data.
 * @param {Cheerio} $
 * @returns {Object} An object containing all relevant data from the submission page.
 */
export function processSubmissionHTML($, url) { // Seperated from scrapeSubmissionInfo for better readability and workability (FA keeps changing UI all the time now)
  let date = '';
  try {
    date = $('.popup_date').attr('title').trim();
    if (/ago$/i.test(date)) date = $('.popup_date').text().trim();
  } catch (e) {
    console.log('[Warn] Could not parse date, FA UI may have changed');
  }

  let prettyUsername = '';
  try {
    prettyUsername = $('.c-usernameBlockSimple__displayName').first().text().trim();
  } catch (e) {
    console.log('[Warn] Could not parse display name, FA UI may have changed');
  }

  let username = '';
  try {
    username = $('.c-usernameBlockSimple a').first().attr('href')?.split('/user/')[1]?.replace(/\/$/, '') ?? '';
  } catch (e) {
    console.log('[Warn] Could not parse username, FA UI may have changed');
  }

  let tags = '';
  try {
    tags = Array.from($('.submission-tags a[data-tag-name]'))
      .map((el) => $(el).attr('data-tag-name')).filter(Boolean).join(',');
  } catch (e) {
    console.log('[Warn] Could not parse tags, FA UI may have changed');
  }

  let title = '';
  try {
    title = $('.submission-title').text().trim();
  } catch (e) {
    console.log('[Warn] Could not parse title, FA UI may have changed');
  }

  let desc = '';
  try {
    desc = $('.submission-description-text').html()?.trim() ?? '';
  } catch (e) {
    console.log('[Warn] Could not parse description, FA UI may have changed');
  }

  let content_url = '';
  try {
    content_url = $('#submission-options a[href*="d.furaffinity.net"]').attr('href') ?? '';
    if (content_url && !/^https/i.test(content_url)) content_url = 'https:' + content_url;
  } catch (e) {
    console.log('[Warn] Could not parse content URL, FA UI may have changed');
  }

  let content_name = '';
  try {
    content_name = content_url.split('/').pop() ?? '';
  } catch (e) {
    console.log('[Warn] Could not parse content name');
  }

  let thumbnail_url = '';
  try {
    thumbnail_url = $('.page-content-type-text, .page-content-type-music').find('#submissionImg').attr('src') || '';
    if (thumbnail_url && !/^https/i.test(thumbnail_url)) thumbnail_url = 'https:' + thumbnail_url;
  } catch (e) {
    console.log('[Warn] Could not parse thumbnail URL, FA UI may have changed');
  }

  let rating = '';
  try {
    const ratingBlock = $('.submission-page-stats .highlight')
      .filter((_, el) => $(el).text().trim().toLowerCase() === 'rating')
      .first()
      .parent();

    rating = ratingBlock.find('div').first().text().trim();
  } catch (e) {
    console.log('[Warn] Could not parse rating, FA UI may have changed');
  }

  let category = '';
  try {
    category = $('.submission-content-stats > span:not(.highlight) > span:first-child').text().trim();
  } catch (e) {
    console.log('[Warn] Could not parse category, FA UI may have changed');
  }

  return {
    id: url.split('view/')[1].split('/')[0],
    title,
    username,
    account_name: username.replace(/_/gi, ''),
    pretty_username: prettyUsername,
    desc,
    tags,
    content_name,
    content_url,
    date_uploaded: date,
    thumbnail_url,
    rating,
    category,
  };
}