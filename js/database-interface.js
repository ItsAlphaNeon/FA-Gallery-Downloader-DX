import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import fs from 'fs-extra';
import process from 'node:process';
import { DB_LOCATION as dbLocation } from './constants.js';
import { upgradeDatabase } from './database-upgrade.js';

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
  return db.exec(`
    DELETE FROM subdata
    WHERE url = '${url}'
  `);
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
  WHERE content_url = '${content_url}'
  `);
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
  WHERE content_url = '${content_url}'
  `);
}
export function setContentMoved(content_name) {
  return db.run(`
  UPDATE subdata
  SET
    moved_content = 1
  WHERE content_name = '${content_name}'
  `);
}
export function setContentMissing(content_name) {
  return db.run(`
  UPDATE subdata
  SET
    content_missing = 1
  WHERE content_name = '${content_name}'
  `);
}
export function setThumbnailMissing(thumbnail_url) {
  return db.run(`
  UPDATE subdata
  SET
    thumbnail_missing = 1
  WHERE thumbnail_url = '${thumbnail_url}'
  `);
}
export function setThumbnailSaved(url, thumbnail_url, thumbnail_name) {
  return db.run(`
    UPDATE subdata
    SET
      is_thumbnail_saved = 1,
      thumbnail_url = '${thumbnail_url}',
      thumbnail_name = '${thumbnail_name}'
    WHERE url = '${url}'
  `);
}
/**
 * Takes the given data for the given url and updates the appropriate database columns.
 * @param {String} url 
 * @param {Object} d 
 * @returns {Promise<null>}
 */
export function saveMetaData(url, d) {
  const data = [];
  let queryNames = Object.getOwnPropertyNames(d)
  .map(key => {
    data.push(d[key]);
    return `${key} = ?`
  });
  return db.run(`
  UPDATE subdata
  SET 
    ${queryNames.join(',')}
  WHERE url = '${url}'`, ...data);
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
    date
  ) 
  VALUES ${placeholder}
  ON CONFLICT(id) DO UPDATE SET
    desc = excluded.desc,
    date = excluded.date
  `, ...data);
}
export function saveFavorites(username, links) {
  let placeholder = [];
  const data = links.reduce((acc, val) => {
    let data = [username+val, username, val];
    let marks = `(${data.map(()=>'?').join(',')})`;
    acc.push(...data);
    placeholder.push(marks);
    return acc;
    }, []);
  return genericInsert('favorites', 'id, username, url', placeholder, data);
}
/**
 * Set all user settings
 * @param {Object} userSettings 
 */
export async function saveUserSettings(userSettings) {
  let data = Object.getOwnPropertyNames(userSettings)
  .map((key) => {
    let val = userSettings[key];
    switch (typeof val) {
      case 'string':
        val = `'${val}'`;
        break;
      case 'object':
        val = `'${JSON.stringify(val)}'`;
        break;
    }
    return `${key} = ${val}`
  });
  db.run(`
  UPDATE usersettings
  SET ${data.join(',')}
  `);
}
export function setOwnedAccount(username) {
  if (!username) return;
  return genericInsert('ownedaccounts', 'username', ['(?)'], [username]);
}
export function deleteOwnedAccount(username) {
  return db.exec(`
    DELETE FROM ownedaccounts
    WHERE username = '${username}'
  `);
}

// SELECT/GET functions
export function getGalleryPage(offset = 0, count = 25, query = {}, sortOrder ='DESC') {
  let { username, searchTerm, galleryType } = query;
  let searchQuery = '';
  let galleryQuery = '';
  let usernameQuery = '';

  if (searchTerm) {
    searchTerm = `${searchTerm.replace(/\s/gi, '%')}`;
    searchQuery =`
      AND (
        title LIKE '%${searchTerm}%'
        OR
        tags LIKE '%${searchTerm}%'
        OR
        desc LIKE '%${searchTerm}%'
        OR 
        content_name LIKE '%${searchTerm}'
      )`;
  }
  if (galleryType && username) {
    galleryQuery = `
      AND url IN (
        SELECT url
        FROM favorites f
        WHERE f.username LIKE '%${username.replace(/_/g, '%')}%'
      )
    `;
  } else {
    if (username) {
      usernameQuery = `
        AND (
          username LIKE '%${username}%'
          OR account_name LIKE '%${username}%'
        )
        `;
    }
  }
  const dbQuery = `
  SELECT 
    id, 
    title,
    username,
    account_name,
    content_name,
    content_url,
    date_uploaded,
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
  ORDER BY content_name ${sortOrder}
  LIMIT ${count} OFFSET ${offset}
  `;
  return db.all(dbQuery);
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
  WHERE id = ${id}
  `);
  data.comments = await db.all(`
    SELECT *
    FROM commentdata
    WHERE submission_id = '${id}'
  `);
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
    (username LIKE '${name}' OR account_name LIKE '${name}')
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
  `);
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
 * @returns {Promise<Array>} All entries in need of repair
 */
export function needsRepair(username) {
  let usernameQuery = '';
  if (username) {
    usernameQuery = `AND (username = '${username}' OR account_name = '${username}')`;
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
  `);
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
  WHERE submission_id = ${id}
  AND desc IS NOT NULL
  `);
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
      WHERE username = '${username}'
        OR account_name = '${username}'
    )
  `);
}
export function getAllSubmissionsForUser(username) {
  if (!username) return;
  return db.all(`
    SELECT *
    FROM subdata
    WHERE (
      username = '${username}' OR account_name = '${username}'
    )
    AND is_content_saved = 1
    AND id IS NOT NULL
    ORDER BY content_name ASC
  `);
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
