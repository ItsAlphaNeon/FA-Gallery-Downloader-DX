import random from 'random';
import { FA_URL_BASE, FA_USER_BASE } from './constants.js';
import * as db from './database-interface.js';
import { logProgress, waitFor, getHTML, stop, sendStartupInfo } from './utils.js';

const scrapeID = 'scrape-div';
const progressID = 'data';
const maxRetries = 6;
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Parses the profile header of a user/gallery/scraps page for the account's identity.
 * Returns null if no UUID could be found (e.g. page layout changed, or not a profile page).
 * @param {Cheerio} $
 * @returns {Object|null}
 */
export function processUserHTML($) {
  const idLink = $('a[href^="/user/id:"]').first().attr('href') || '';
  const uuid = (idLink.match(UUID_REGEX) || $('.user-title').text().match(UUID_REGEX) || [])[0];
  if (!uuid) return null;
  const username = $('.c-usernameBlock__userName').first().attr('href')?.split('/user/')[1]?.replace(/\/$/, '')
    || $('meta[property="og:url"]').attr('content')?.split('/user/')[1]?.replace(/\/$/, '')
    || '';
  if (!username) return null;
  const pretty_username = $('.c-usernameBlock__displayName .js-displayName').first().text().trim();
  const registeredEl = $('.user-title .popup_date').first();
  const epoch = Number(registeredEl.attr('data-time'));
  const registered = epoch ? new Date(epoch * 1000).toISOString() : registeredEl.text().trim();
  return {
    uuid: uuid.toLowerCase(),
    username,
    account_name: username.replace(/_/g, ''),
    pretty_username,
    registered,
  };
}
/**
 * Saves the user identity found in the given profile HTML and links their existing data to it.
 * @param {Cheerio} $
 * @returns {Promise<Object|null>} The saved user, or null if no UUID was found.
 */
export async function saveUserProfile($) {
  const user = processUserHTML($);
  if (!user) {
    console.log('[Warn] Could not find user UUID, FA UI may have changed');
    return null;
  }
  const { renamedFrom } = await db.saveUser(user);
  if (renamedFrom) console.log(`[Data] User rename detected: ${renamedFrom} -> ${user.username} (${user.uuid})`);
  await db.linkUserUuid(user.uuid, user.username);
  if (renamedFrom) await db.linkUserUuid(user.uuid, renamedFrom);
  return user;
}
const profileChecked = new Set();
/**
 * Makes sure the given username has a UUID on record, fetching their profile once if needed.
 * @param {String} username
 */
export async function ensureUserProfile(username) {
  if (!username || profileChecked.has(username)) return;
  profileChecked.add(username);
  if (await db.getUserByName(username)) return;
  const $ = await getHTML(FA_USER_BASE + username).catch(() => false);
  if (!$) return;
  await saveUserProfile($);
}

/**
 * Collects the submission links on a gallery/scraps/favorites page.
 * @param {Cheerio} $
 * @returns {String[]} Absolute submission URLs
 */
export function parseGalleryLinks($) {
  return Array.from($('figcaption a[href^="/view"]'))
    .map((a) => FA_URL_BASE + a.attribs.href);
}
/**
 * Finds the "Next" page of a favorites listing (favorites paginate with a form, not page numbers).
 * @returns {String|undefined} Absolute URL of the next page, if there is one
 */
export function parseFavoritesNextPage($, url) {
  const action = $(`form[action$="next"]`).attr('action');
  return action ? url.split('/favorite')[0] + action : undefined;
}
/**
 * Walks the user's gallery in order to gather all submission links for future download.
 * @param {String} url Gallery URL
 * @param {Boolean} isScraps Is this the scraps folder or not?
 */
export async function getSubmissionLinks({ url, username, userUuid = null, isScraps = false, isFavorites = false }) {
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
    let newLinks = parseGalleryLinks($);
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
    if (isFavorites && username) await db.saveFavorites(username, newLinks, userUuid);
    currLinks = currLinks += newLinks.length;
    currPageCount++;
    if (isFavorites) {
      nextPage = parseFavoritesNextPage($, url);
      if (!nextPage) break;
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
  const comments = parseComments($, submission_id);
  if(!comments.length) return;
  return db.saveComments(comments);
}
/**
 * Gets the commenter's login name. The <comment-username> text holds the display name AND "~login"
 * (with a lot of whitespace), so read the dedicated link instead.
 */
function parseCommentUsername($, $div) {
  const link = $div.find('.c-usernameBlock__userName').first();
  const fromHref = link.attr('href')?.split('/user/')[1]?.replace(/\/$/, '');
  if (fromHref) return fromHref;
  const text = link.text().replace('~', '').trim();
  return text || $div.find('comment-username').text().replace(/\s+/g, ' ').trim();
}
/**
 * Parses all comments on a submission page.
 * @param {Cheerio} $
 * @param {String} submission_id
 * @returns {Object[]}
 */
export function parseComments($, submission_id) {
  return Array.from($('#comments-submission .comment_container'))
    .map((val) => {
      const $div = $(val);
      const isDeleted = $div.find('comment-container').hasClass('deleted-comment-container');
      let date = '';
      if (!isDeleted) {
        date = $div.find('comment-date > span').attr('title').trim();
        if (/ago/i.test(date)) date = $div.find('comment-date > span').text().trim();
      }
      const posted_at = isDeleted ? null : (Number($div.find('comment-date .popup_date').attr('data-time')) || null);
      const username = isDeleted ? '' : parseCommentUsername($, $div);
      return {
        id: $div.find('.comment_anchor').attr('id'),
        submission_id,
        width: $div.attr('style'),
        username,
        account_name: username.replace(/_/gi, ''),
        desc: isDeleted ? '' : $div.find('comment-user-text .user-submitted-links').html().trim(),
        subtitle: isDeleted ? '' : $div.find('comment-title').text().trim(),
        date,
        posted_at,
      }
    });
}
const metadataID = 'scrape-metadata';
/**
 * Gathers all of the relevant metadata from all uncrawled submission pages.
 * @returns 
 */
// What "Refresh details" updates. File names and links are left alone so saved files stay matched up.
const DETAIL_FIELDS = ['title', 'desc', 'tags', 'rating', 'category', 'species', 'uploaded_at'];
export function pickDetails(data) {
  const details = { species: data.species || '' };
  for (const key of DETAIL_FIELDS) {
    // A field that failed to parse must not wipe what is already saved
    if (data[key] !== '' && data[key] != null) details[key] = data[key];
  }
  return details;
}

/**
 * @param {Object} options
 * @param {Array<{url}>} [options.data] Submissions to read (default: links not read yet)
 * @param {Boolean} [options.detailsOnly] Only update descriptive fields, and keep submissions FA has deleted
 */
export async function scrapeSubmissionInfo({ data = null, downloadComments, detailsOnly = false }) {
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
          if (detailsOnly) {
            // Keep the archived copy; just stop asking FA about it
            console.log(`[Data] Deleted on FA, keeping saved copy: ${links[index].url}`);
            db.saveMetaData(links[index].url, { species: '' });
            return false;
          }
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
    await db.saveMetaData(links[index].url, detailsOnly ? pickDetails(data) : data);
    // Link to the artist's permanent UUID (fetches their profile once if unknown)
    await ensureUserProfile(data.username).catch(() => {});
    const artist = await db.getUserByName(data.username);
    await db.setSubmissionUserUuid(data.id, artist?.uuid);
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

  const uploaded_at = Number($('.popup_date').first().attr('data-time')) || null;

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

  // Labels (Category, Theme, Species, ...) and values sit in two parallel rows of spans.
  // Category is saved as "Category / Theme", the way older FA pages showed it.
  let category = '';
  let species = '';
  try {
    const labels = $('.submission-content-stats > span.highlight > span').map((_, el) => $(el).text().trim().toLowerCase()).get();
    const values = $('.submission-content-stats > span:not(.highlight) > span').map((_, el) => $(el).text().trim()).get();
    const stat = (name) => labels.includes(name) ? values[labels.indexOf(name)] || '' : '';
    category = [stat('category'), stat('theme')].filter(Boolean).join(' / ') || values[0] || '';
    species = stat('species');
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
    uploaded_at,
    thumbnail_url,
    rating,
    category,
    species,
  };
}