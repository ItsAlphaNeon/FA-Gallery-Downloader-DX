import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import fs from 'fs-extra';
import process from 'node:process';
import { DB_LOCATION as dbLocation } from './constants.js';
import { upgradeDatabase } from './database-upgrade.js';
import { escapeLike, sanitizeHtml, toInt } from './sanitize.js';
import { buildSearch } from './search-query.js';

const { open } = sqlite;

/**@type sqlite.Database */
let db = null;

// INSERT/UPDATE functions
function genericInsert(table, columns, placeholders, data) {
  return db.run(`
  INSERT INTO ${table} (${columns})
  VALUES ${placeholders.join(',')}
`, ...data);
}

export function deleteSubmission(url) {
  return db.run('DELETE FROM subdata WHERE url = ?', url);
}
/**
 * Marks the given content_url as saved (downloaded).
 * @param {String} content_url 
 * @returns {Promise<null>}
 */
export function setContentSaved(content_url) {
  return db.run(`
  UPDATE subdata
  SET
    is_content_saved = 1,
    moved_content = 1
  WHERE content_url = ?
  `, content_url);
}
/**
 * Marks the given content_url as not saved (invalid file).
 * @param {String} content_url 
 * @returns {Promise<null>}
 */
export function setContentNotSaved(content_url) {
  return db.run(`
  UPDATE subdata
  SET
    is_content_saved = 0,
    moved_content = 1
  WHERE content_url = ?
  `, content_url);
}
export function setContentMoved(content_name) {
  return db.run(`
  UPDATE subdata
  SET
    moved_content = 1
  WHERE content_name = ?
  `, content_name);
}
export function setContentMissing(content_name) {
  return db.run(`
  UPDATE subdata
  SET
    content_missing = 1
  WHERE content_name = ?
  `, content_name);
}
export function setThumbnailMissing(thumbnail_url) {
  return db.run(`
  UPDATE subdata
  SET
    thumbnail_missing = 1
  WHERE thumbnail_url = ?
  `, thumbnail_url);
}
export function setThumbnailSaved(url, thumbnail_url, thumbnail_name) {
  return db.run(`
    UPDATE subdata
    SET
      is_thumbnail_saved = 1,
      thumbnail_url = ?,
      thumbnail_name = ?
    WHERE url = ?
  `, thumbnail_url, thumbnail_name, url);
}
const METADATA_COLUMNS = new Set([
  'id', 'title', 'username', 'account_name', 'pretty_username', 'desc', 'tags', 'content_name',
  'content_url', 'date_uploaded', 'uploaded_at', 'thumbnail_url', 'rating', 'category', 'species',
]);
/**
 * Takes the given data for the given url and updates the appropriate database columns.
 * @param {String} url 
 * @param {Object} d 
 * @returns {Promise<null>}
 */
export function saveMetaData(url, d) {
  const data = [];
  const queryNames = Object.getOwnPropertyNames(d)
    .filter(key => METADATA_COLUMNS.has(key))
    .map(key => {
      data.push(d[key]);
      return `${key} = ?`;
    });
  if (!queryNames.length) return Promise.resolve();
  return db.run(`
  UPDATE subdata
  SET 
    ${queryNames.join(',')}
  WHERE url = ?`, ...data, url);
}
/**
 * Creates blank entries in the database for all given submission URLs
 * for later updating.
 * @param {Array<Strings>} links 
 * @param {Boolean} isScraps 
 * @returns {Promise<null>}
 */
export function saveLinks(links, isScraps = false, username) {
  let placeholder = [];
  const data = links.reduce((acc, val) => {
    let data = [val, username, isScraps, false];
    let marks = `(${data.map(()=>'?').join(',')})`;
    acc.push(...data);
    placeholder.push(marks);
    return acc;
    }, []);
  return genericInsert('subdata', 'url, username, is_scrap, is_content_saved', placeholder, data);
}
export function saveComments(comments) {
  let placeholder = [];
  const data = comments.reduce((acc, c) => {
    let data = [
      c.id,
      c.submission_id,
      c.width,
      c.username,
      c.account_name,
      c.desc,
      c.subtitle,
      c.date,
      c.posted_at ?? null,
    ];
    let marks = `(${data.map(()=>'?').join(',')})`;
    acc.push(...data);
    placeholder.push(marks);
    return acc;
  }, []);
  placeholder.join(',');
  return db.run(`
  INSERT INTO commentdata (
    id,
    submission_id,
    width,
    username,
    account_name,
    desc,
    subtitle,
    date,
    posted_at
  ) 
  VALUES ${placeholder}
  ON CONFLICT(id) DO UPDATE SET
    desc = excluded.desc,
    date = excluded.date,
    posted_at = excluded.posted_at
  `, ...data);
}
/**
 * Inserts or updates a user keyed by their permanent FA UUID. If the UUID is already
 * known under a different username, the old name is kept in previous_usernames.
 * @param {Object} u
 * @returns {Promise<{renamedFrom: String|null}>}
 */
export async function saveUser({ uuid, username, account_name, pretty_username, registered }) {
  const now = new Date().toISOString();
  const existing = await db.get('SELECT username, previous_usernames FROM users WHERE uuid = ?', uuid);
  if (!existing) {
    await db.run(`
      INSERT INTO users (uuid, username, account_name, pretty_username, registered, previous_usernames, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?, '', ?, ?)
    `, uuid, username, account_name, pretty_username, registered, now, now);
    return { renamedFrom: null };
  }
  let renamedFrom = null;
  let previous = existing.previous_usernames || '';
  if (existing.username && existing.username !== username) {
    renamedFrom = existing.username;
    previous = Array.from(new Set([...previous.split(',').filter(Boolean), renamedFrom])).join(',');
  }
  await db.run(`
    UPDATE users
    SET username = ?, account_name = ?, pretty_username = ?, registered = ?, previous_usernames = ?, last_seen = ?
    WHERE uuid = ?
  `, username, account_name, pretty_username, registered, previous, now, uuid);
  return { renamedFrom };
}
/**
 * Finds a known user by (account) name.
 * @param {String} name
 * @returns {Promise<Object|undefined>}
 */
export function getUserByName(name) {
  if (!name) return Promise.resolve(undefined);
  return db.get(`
    SELECT * FROM users
    WHERE username = ? OR account_name = ? OR ',' || previous_usernames || ',' LIKE ?
  `, name, name.replace(/_/g, ''), `%,${name},%`);
}
/**
 * Stamps all of a user's saved submissions and favorites with their UUID.
 * @param {String} uuid
 * @param {String} username
 */
export async function linkUserUuid(uuid, username) {
  if (!uuid || !username) return;
  const accountName = username.replace(/_/g, '');
  await db.run(`
    UPDATE subdata SET user_uuid = ?
    WHERE user_uuid IS NULL AND id IS NOT NULL AND (username = ? OR account_name = ?)
  `, uuid, username, accountName);
  await db.run(`
    UPDATE favorites SET user_uuid = ?
    WHERE user_uuid IS NULL AND username = ?
  `, uuid, username);
}
/**
 * Sets (or clears) the artist UUID of one submission, overwriting any previous value.
 */
export function setSubmissionUserUuid(id, uuid) {
  return db.run('UPDATE subdata SET user_uuid = ? WHERE id = ?', uuid ?? null, String(id));
}
/**
 * Usernames of saved submissions that still have no UUID.
 */
export function getUsernamesMissingUuid() {
  return db.all(`
    SELECT DISTINCT username
    FROM subdata
    WHERE user_uuid IS NULL AND username IS NOT NULL AND id IS NOT NULL
    ORDER BY username ASC
  `).then(rows => rows.map(r => r.username));
}
export function saveFavorites(username, links, userUuid = null) {
  let placeholder = [];
  const data = links.reduce((acc, val) => {
    let data = [username+val, username, val, userUuid];
    let marks = `(${data.map(()=>'?').join(',')})`;
    acc.push(...data);
    placeholder.push(marks);
    return acc;
    }, []);
  return genericInsert('favorites', 'id, username, url, user_uuid', placeholder, data);
}
const USER_SETTINGS_COLUMNS = new Set(['latest_browser_version']);
/**
 * Set all user settings
 * @param {Object} userSettings 
 */
export async function saveUserSettings(userSettings) {
  const values = [];
  const data = Object.getOwnPropertyNames(userSettings)
    .filter(key => USER_SETTINGS_COLUMNS.has(key))
    .map((key) => {
      const val = userSettings[key];
      values.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      return `${key} = ?`;
    });
  if (!data.length) return;
  return db.run(`
  UPDATE usersettings
  SET ${data.join(',')}
  `, ...values);
}
export function setOwnedAccount(username) {
  if (!username) return;
  return genericInsert('ownedaccounts', 'username', ['(?)'], [username]);
}
export function deleteOwnedAccount(username) {
  return db.run('DELETE FROM ownedaccounts WHERE username = ?', username);
}

// SELECT/GET functions

// Upload time in seconds: the stored epoch, or the timestamp FA puts at the start of every content filename.
const UPLOAD_TIME_SQL = `COALESCE(s.uploaded_at, CAST(substr(s.content_name, 1, instr(s.content_name, '.') - 1) AS INTEGER))`;
const extIn = (list) => list.map(e => `s.content_name LIKE '%.${e}'`).join(' OR ');
const catIn = (list) => list.map(c => `s.category LIKE '${c}%'`).join(' OR ');
// FA's "Type Filter" groups, worked out from the category and the file extension.
const SUBMISSION_TYPE_SQL = `CASE
  WHEN ${catIn(['Poetry'])} THEN 'poetry'
  WHEN ${extIn(['swf'])} OR ${catIn(['Flash', 'Interactive Media'])} THEN 'flash'
  WHEN ${extIn(['mp3', 'wav', 'ogg', 'mid', 'midi', 'flac', 'm4a'])} OR ${catIn(['Music', 'Podcasts'])} THEN 'music'
  WHEN ${extIn(['mp4', 'webm', 'mov', 'avi', 'mkv'])} THEN 'video'
  WHEN ${extIn(['txt', 'rtf', 'doc', 'docx', 'odt', 'pdf'])} OR ${catIn(['Story', 'Prose'])} THEN 'story'
  WHEN ${catIn(['Photography', 'Virtual Photography'])} THEN 'photo'
  ELSE 'art'
END`;
export const SUBMISSION_TYPES = ['art', 'music', 'flash', 'story', 'photo', 'poetry', 'video'];
const DATE_RANGES = { '1day': 1, '3days': 3, '7days': 7, '30days': 30, '90days': 90, '1year': 365, '3years': 1095, '5years': 1826 };
// bm25 weights per subdata_fts column: title, desc, tags, username, content_name
const RELEVANCE_SQL = 'bm25(subdata_fts, 10.0, 1.0, 5.0, 3.0, 1.0)';
const toEpoch = (date, endOfDay) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
  const t = Date.parse(`${date}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
};

/**
 * One page of the gallery, filtered the way FA's search page filters.
 * @param {Object} query { searchTerm, mode: all|any|extended, username, galleryType, category, theme, species,
 *   range: 1day..5years|all|manual, from, to (YYYY-MM-DD), types: ['art', ...], orderBy: relevancy|date }
 */
export async function getGalleryPage(offset = 0, count = 25, query = {}, sortOrder ='DESC', ratingFilter = { general: true, mature: true, adult: true }) {
  const { username, searchTerm, galleryType, mode, category, theme, species, range, from, to, types, orderBy } = query || {};
  const where = [];
  const params = [];
  let join = '';
  const limit = toInt(count, 1, 500, 25);
  const skip = toInt(offset, 0, Number.MAX_SAFE_INTEGER, 0);
  const desc = String(sortOrder).toUpperCase() !== 'ASC';

  const allowedRatings = [];
  if (ratingFilter?.general) allowedRatings.push('General');
  if (ratingFilter?.mature) allowedRatings.push('Mature');
  if (ratingFilter?.adult) allowedRatings.push('Adult');
  if (allowedRatings.length === 0) {
    where.push('1=0');
  } else if (allowedRatings.length < 3) {
    // Unknown ratings are shown with General
    const unknown = ratingFilter.general ? " OR s.rating IS NULL OR s.rating = ''" : '';
    where.push(`(s.rating IN (${allowedRatings.map(() => '?').join(',')})${unknown})`);
    params.push(...allowedRatings);
  }

  const search = buildSearch(searchTerm, ['all', 'any', 'extended'].includes(mode) ? mode : 'extended');
  if (search?.match) {
    join = 'JOIN subdata_fts ON subdata_fts.rowid = s.rowid';
    where.push('subdata_fts MATCH ?');
    params.push(search.match);
  } else if (search?.exclude) {
    where.push('s.rowid NOT IN (SELECT rowid FROM subdata_fts WHERE subdata_fts MATCH ?)');
    params.push(search.exclude);
  }

  if (galleryType && username) {
    where.push(`s.url IN (SELECT url FROM favorites f WHERE f.username LIKE ? ESCAPE '\\')`);
    params.push(`%${String(username).split('_').map(escapeLike).join('%')}%`);
  } else if (username) {
    where.push(`(s.username LIKE ? ESCAPE '\\' OR s.account_name LIKE ? ESCAPE '\\')`);
    const like = `%${escapeLike(username)}%`;
    params.push(like, like);
  }

  // Saved as "Category / Theme" (or just "Category" for some older pages)
  if (category && typeof category === 'string') {
    where.push(`(s.category = ? OR s.category LIKE ? ESCAPE '\\')`);
    params.push(category, `${escapeLike(category)} / %`);
  }
  if (theme && typeof theme === 'string') {
    where.push(`s.category LIKE ? ESCAPE '\\'`);
    params.push(`% / ${escapeLike(theme)}`);
  }
  if (species && typeof species === 'string') {
    where.push('s.species = ?');
    params.push(species);
  }

  if (DATE_RANGES[range]) {
    where.push(`${UPLOAD_TIME_SQL} >= ?`);
    params.push(Math.floor(Date.now() / 1000) - DATE_RANGES[range] * 86400);
  } else if (range === 'manual') {
    const start = toEpoch(from);
    const end = toEpoch(to, true);
    if (start != null) { where.push(`${UPLOAD_TIME_SQL} >= ?`); params.push(start); }
    if (end != null) { where.push(`${UPLOAD_TIME_SQL} <= ?`); params.push(end); }
  }

  if (Array.isArray(types)) {
    const wanted = SUBMISSION_TYPES.filter(t => types.includes(t));
    if (!wanted.length) where.push('1=0');
    else if (wanted.length < SUBMISSION_TYPES.length) {
      where.push(`(${SUBMISSION_TYPE_SQL}) IN (${wanted.map(() => '?').join(',')})`);
      params.push(...wanted);
    }
  }

  // Most relevant first is the lowest bm25 score
  const order = join && orderBy !== 'date'
    ? `${RELEVANCE_SQL} ${desc ? 'ASC' : 'DESC'}, s.content_name DESC`
    : `${UPLOAD_TIME_SQL} ${desc ? 'DESC' : 'ASC'}, s.content_name ${desc ? 'DESC' : 'ASC'}`;
  const dbQuery = `
  SELECT
    s.id,
    s.title,
    s.username,
    s.account_name,
    s.content_name,
    s.content_url,
    s.date_uploaded,
    s.uploaded_at,
    s.is_content_saved,
    s.thumbnail_name,
    s.is_thumbnail_saved,
    s.rating,
    s.pretty_username
  FROM subdata s
  ${join}
  WHERE s.id IS NOT NULL
  ${where.map(w => `AND ${w}`).join('\n  ')}
  ORDER BY ${order}
  LIMIT ${limit} OFFSET ${skip}
  `;
  try {
    return await db.all(dbQuery, ...params);
  } catch (e) {
    // A query the index can't parse: fall back to plain "all of the words"
    if (!search || mode === 'all' || !/fts5|MATCH/i.test(e.message)) throw e;
    console.log(`[Warn] Could not understand the search "${searchTerm}", searching for all of its words instead.`);
    return getGalleryPage(offset, count, { ...query, mode: 'all' }, sortOrder, ratingFilter);
  }
}
/**
 * Gets all submission info for given id.
 * 
 * @param {String} id 
 * @returns {Promise<Object>}
 */
export async function getSubmissionPage(id) {
  const data = {};
  data.submission = await db.get(`
  SELECT *
  FROM subdata
  WHERE id = ?
  `, String(id));
  // Descriptions come from scraped HTML and are rendered in the gallery page: sanitize on the way out
  if (data.submission) data.submission.desc = sanitizeHtml(data.submission.desc);
  data.comments = (await db.all(`
    SELECT *
    FROM commentdata
    WHERE submission_id = ?
  `, String(id))).map(c => ({ ...c, desc: sanitizeHtml(c.desc) }));
  return data;
}

export function getAllUnmovedContentData() {
  return db.all(`
  SELECT content_url, content_name, username, account_name
  FROM subdata
  WHERE is_content_saved = 1
    AND moved_content = 0
  `);
}
/**
 * Finds all data with content not yet downloaded.
 * 
 * @returns {Promise<Array>}
 */
export function getAllUnsavedContent(name) {
  const nameQuery = name ? `AND
    (username LIKE ? OR account_name LIKE ?)
    `:`AND username IS NOT NULL`;
  return db.all(`
    SELECT content_url, content_name, username, account_name
    FROM subdata
    WHERE is_content_saved = 0
    AND content_missing = 0
    AND content_url IS NOT NULL
    AND content_name NOT LIKE '%.'
    ${nameQuery}
    ORDER BY content_name DESC
  `, ...(name ? [name, name] : []));
}

export function getAllUnsavedThumbnails() {
  return db.all(`
    SELECT url, content_url, username, thumbnail_url, account_name
    FROM subdata
    WHERE is_thumbnail_saved = 0
    AND username IS NOT NULL
    AND thumbnail_missing = 0
    AND (
      content_url LIKE '%/stories/%'
      OR content_url LIKE '%/music/%'
      OR content_url LIKE '%/poetry/%'
    )
    ORDER BY content_name DESC
  `);
}
/**
 * Queries for all entries without necessary data.
 * A missing uploaded_at/posted_at alone doesn't count: everything saved before 3.0.0 lacks them and
 * the viewer falls back to the saved date text, so flagging them would re-scrape whole libraries.
 * @returns {Promise<Array>} All entries in need of repair
 */
export function needsRepair(username) {
  let usernameQuery = '';
  const params = [];
  if (username) {
    usernameQuery = 'AND (username = ? OR account_name = ?)';
    params.push(username, username);
  }
  return db.all(`
  SELECT url
  FROM subdata
  WHERE id IS NOT NULL
  ${usernameQuery}
  AND (
    username IS NULL
    OR rating IS NULL
    OR category IS NULL
    OR date_uploaded LIKE '%ago%'
    OR id IN (
      SELECT submission_id
      FROM commentdata
      WHERE date LIKE '%ago%'
    )
  )
  `, ...params);
}
export function getAllFavUsernames() {
  return db.all(`
    SELECT DISTINCT username
    FROM favorites
    WHERE username IS NOT NULL
    ORDER BY username ASC
  `);
}
export function getAllUsernames() {
  return db.all(`
    SELECT DISTINCT username, account_name
    FROM subdata
    WHERE username IS NOT NULL
    ORDER BY username ASC
  `);
}

/**
 * Retrieves all submission links with uncollected data.
 * @param {Boolean} isScraps 
 * @returns {Promise<Array>} All matching Database rows
 */
/**
 * Downloaded submissions whose page hasn't been read since species/theme were saved (before v3.1.0).
 * A refreshed submission gets species '' when FA lists none, so this list shrinks as a refresh runs.
 * @param {Array<String>} [usernames] Only these artists
 */
export function getSubmissionsMissingDetails(usernames = []) {
  const names = usernames.map(n => String(n).toLowerCase());
  const byUser = names.length
    ? `AND (LOWER(username) IN (${names.map(() => '?').join(',')}) OR LOWER(account_name) IN (${names.map(() => '?').join(',')}))`
    : '';
  return db.all(`
    SELECT url
    FROM subdata
    WHERE id IS NOT NULL AND species IS NULL
    ${byUser}
    ORDER BY url DESC
  `, ...names, ...names.map(n => n.replace(/_/g, '')));
}
export function getSubmissionLinks() {
  return db.all(`
    SELECT url
    FROM subdata
    WHERE id IS null
    ORDER BY url DESC
  `);
}

export function getComments(id) {
  return db.all(`
  SELECT *
  FROM commentdata
  WHERE submission_id = ?
  AND desc IS NOT NULL
  `, String(id));
}

export function getOwnedAccounts() {
  return db.all(`
    SELECT *
    FROM ownedaccounts
  `).then(results => results.map(a => a.username))
    .catch(() => []);
}

export function getAllFavoritesForUser(username) {
  if (!username) return;
  return db.all(`
    SELECT *
    FROM subdata
    WHERE url IN (
      SELECT url
      FROM favorites
      WHERE username = ?
        OR account_name = ?
    )
  `, username, username);
}
export function getAllSubmissionsForUser(username) {
  if (!username) return;
  return db.all(`
    SELECT *
    FROM subdata
    WHERE (
      username = ? OR account_name = ?
    )
    AND is_content_saved = 1
    AND id IS NOT NULL
    ORDER BY content_name ASC
  `, username, username);
}
/**
 * 
 * @returns {Promise<Array>} All submission data in the database
 */
export function getAllSubmissionData() {
  return db.all('SELECT url from subdata');
}
/**
 * 
 * @returns {Promise<Array>} All complete submission data in the database
 */
export function getAllCompleteSubmissionData() {
  return db.all('SELECT * from subdata WHERE id IS NOT NULL');
}

export function getAllInvalidFiles() {
  return db.all(`
    SELECT id, content_name, content_url, username, account_name
    FROM subdata
    WHERE content_name LIKE '%.'
    AND is_content_saved = 1
  `);
}

export async function getUserSettings() {
  return db.get(`SELECT * FROM usersettings`);
}

export async function close() {
  return db.close().catch(() => console.log('Database already closed!'));
}
/**
 * Deletes all info related to the given amount from submission data and favorites.
 * 
 * @param {String} name 
 * @returns {Promise<null>}
 */
export async function deleteAccount(name) {
  await db.run(`
    DELETE FROM subdata
    WHERE account_name = ?
    OR username = ?
  `, [name, name]);
  return db.run(`
    DELETE FROM favorites
    WHERE username = ?
  `, [name]);
}
export async function deleteBlankSubmissionInfo() {
  return db.run(`
    DELETE FROM subdata
    WHERE username IS NULL
  `);
}

/**
 * Creates appropriate database tables.
 * @returns 
 */
export async function init() {
  await fs.ensureFile(dbLocation);
  sqlite3.verbose();
  db = await open({
    filename: dbLocation,
    driver: sqlite3.cached.Database,
  });
  // Check for existence of necessary tables
  return db.get(`
    SELECT name 
    FROM sqlite_master 
    WHERE type='table' AND name='subdata'
  `).then(({ name } = {}) => {
    // If not found, we need to create the table
    if (!name) {
      return db.exec(`
        CREATE TABLE subdata (
          id TEXT PRIMARY KEY,
          title TEXT, 
          desc TEXT, 
          tags TEXT, 
          url TEXT UNIQUE ON CONFLICT IGNORE, 
          is_scrap INTEGER, 
          date_uploaded TEXT, 
          content_url TEXT, 
          content_name TEXT, 
          is_content_saved INTEGER,
          username TEXT,
          pretty_username TEXT
        )`)
        .then(db.exec(`PRAGMA user_version = 2`));
    }
  })
  .then(() => {
    return upgradeDatabase(db);
  })
  .catch(async (e) => {
    console.error(e);
    await db.close();
    process.exit(2);
  });
}
