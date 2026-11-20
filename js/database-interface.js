import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import fs from 'fs-extra';
import process from 'node:process';
import { DB_LOCATION as dbLocation } from './constants.js';
import { upgradeDatabase } from './database-upgrade.js';
import { escapeLike, sanitizeHtml, toInt } from './sanitize.js';

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
  'content_url', 'date_uploaded', 'uploaded_at', 'thumbnail_url', 'rating', 'category',
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
export function getGalleryPage(offset = 0, count = 25, query = {}, sortOrder ='DESC', ratingFilter = { general: true, mature: true, adult: true }) {
  const { username, searchTerm, galleryType } = query || {};
  const params = [];
  let searchQuery = '';
  let galleryQuery = '';
  let usernameQuery = '';
  let ratingQuery = '';
  const order = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const limit = toInt(count, 1, 500, 25);
  const skip = toInt(offset, 0, Number.MAX_SAFE_INTEGER, 0);

  const allowedRatings = [];
  if (ratingFilter?.general) allowedRatings.push('General');
  if (ratingFilter?.mature) allowedRatings.push('Mature');
  if (ratingFilter?.adult) allowedRatings.push('Adult');

  let ratingParams = [];
  if (allowedRatings.length === 0) {
    ratingQuery = 'AND 1=0';
  } else if (allowedRatings.length < 3) {
    const nullClause = ratingFilter.general ? ' OR rating IS NULL' : '';
    ratingQuery = `AND (rating IN (${allowedRatings.map(() => '?').join(',')})${nullClause})`;
    ratingParams = allowedRatings;
  }

  if (searchTerm) {
    const term = `%${String(searchTerm).trim().split(/\s+/).map(escapeLike).join('%')}%`;
    searchQuery = `
      AND (
        title LIKE ? ESCAPE '\\'
        OR
        tags LIKE ? ESCAPE '\\'
        OR
        desc LIKE ? ESCAPE '\\'
        OR
        content_name LIKE ? ESCAPE '\\'
      )`;
    params.push(term, term, term, term);
  }
  if (galleryType && username) {
    galleryQuery = `
      AND url IN (
        SELECT url
        FROM favorites f
        WHERE f.username LIKE ? ESCAPE '\\'
      )
    `;
    params.push(`%${String(username).split('_').map(escapeLike).join('%')}%`);
  } else if (username) {
    usernameQuery = `
      AND (
        username LIKE ? ESCAPE '\\'
        OR account_name LIKE ? ESCAPE '\\'
      )
      `;
    const like = `%${escapeLike(username)}%`;
    params.push(like, like);
  }
  params.push(...ratingParams);
  const dbQuery = `
  SELECT
    id,
    title,
    username,
    account_name,
    content_name,
    content_url,
    date_uploaded,
    uploaded_at,
    is_content_saved,
    thumbnail_name,
    is_thumbnail_saved,
    rating,
    pretty_username
  FROM subdata
  WHERE id IS NOT NULL
  ${searchQuery}
  ${usernameQuery}
  ${galleryQuery}
  ${ratingQuery}
  ORDER BY content_name ${order}
  LIMIT ${limit} OFFSET ${skip}
  `;
  return db.all(dbQuery, ...params);
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
