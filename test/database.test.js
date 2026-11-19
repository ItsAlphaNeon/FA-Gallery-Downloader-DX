// Database tests run against a throw-away database in a temp folder (the app uses paths relative to cwd).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fa-db-test-'));
const originalCwd = process.cwd();
process.chdir(tmp);
const db = await import('../js/database-interface.js');
const { upgradeDatabase } = await import('../js/database-upgrade.js');

const USER = { uuid: '00000000-0000-1000-8000-000000000001', username: 'testuser', account_name: 'testuser', pretty_username: 'TestUser', registered: '2022-02-28T09:06:58.000Z' };
const ALL_RATINGS = { general: true, mature: true, adult: true };

before(async () => {
  await db.init();
  await db.saveLinks(['https://www.furaffinity.net/view/1/', 'https://www.furaffinity.net/view/2/'], false, 'testuser');
  await db.saveMetaData('https://www.furaffinity.net/view/1/', { id: '1', title: 'First 100% Test', username: 'testuser', account_name: 'testuser', pretty_username: 'TestUser', desc: '<p onclick="x()">hello<script>alert(1)</script></p>', tags: 'a,b', content_name: '1.testuser_a.png', content_url: 'https://d.furaffinity.net/art/testuser/1/1.testuser_a.png', date_uploaded: 'x', uploaded_at: 1700000000, rating: 'General', category: 'All' });
  await db.saveMetaData('https://www.furaffinity.net/view/2/', { id: '2', title: 'Second', username: 'testuser', account_name: 'testuser', pretty_username: 'TestUser', desc: '', tags: '', content_name: '2.testuser_b.png', content_url: 'https://d.furaffinity.net/art/testuser/2/2.testuser_b.png', date_uploaded: 'x', uploaded_at: 1700000001, rating: 'Adult', category: 'All' });
});
after(async () => {
  await db.close();
  process.chdir(originalCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('fresh database is created at the latest schema version', async () => {
  const raw = await open({ filename: path.join(tmp, 'fa_gallery_downloader/databases/fa-gallery-downloader.db'), driver: sqlite3.Database });
  const { user_version } = await raw.get('PRAGMA user_version');
  const tables = (await raw.all("SELECT name FROM sqlite_master WHERE type='table'")).map(t => t.name);
  await raw.close();
  assert.ok(user_version >= 16, `schema version ${user_version}`);
  for (const t of ['subdata', 'commentdata', 'favorites', 'users', 'ownedaccounts', 'usersettings']) assert.ok(tables.includes(t), `missing table ${t}`);
});

test('users are tracked by UUID and renames are remembered', async () => {
  assert.deepEqual(await db.saveUser(USER), { renamedFrom: null });
  await db.linkUserUuid(USER.uuid, 'testuser');
  assert.equal((await db.getUserByName('testuser')).uuid, USER.uuid);
  assert.equal((await db.getUserByName('Test_User'.toLowerCase().replace('_', ''))).uuid, USER.uuid);
  const rows = await db.getAllCompleteSubmissionData();
  assert.ok(rows.every(r => r.user_uuid === USER.uuid));

  const renamed = await db.saveUser({ ...USER, username: 'newname', account_name: 'newname' });
  assert.deepEqual(renamed, { renamedFrom: 'testuser' });
  const byOld = await db.getUserByName('testuser');
  assert.equal(byOld.uuid, USER.uuid);
  assert.equal(byOld.username, 'newname');
  assert.equal(byOld.previous_usernames, 'testuser');
  await db.saveUser(USER); // rename back
});

test('a favorite by someone else is never stamped with the favoriter\'s UUID', async () => {
  await db.saveLinks(['https://www.furaffinity.net/view/9/'], false, 'testuser'); // placeholder row for a favorite
  await db.linkUserUuid(USER.uuid, 'testuser');
  const placeholder = await db.getSubmissionLinks();
  assert.equal(placeholder.length, 1);
  const raw = await open({ filename: path.join(tmp, 'fa_gallery_downloader/databases/fa-gallery-downloader.db'), driver: sqlite3.Database });
  const stamped = await raw.get("SELECT user_uuid FROM subdata WHERE url = 'https://www.furaffinity.net/view/9/'");
  await raw.close();
  assert.equal(stamped.user_uuid, null, 'placeholder rows (no metadata yet) must not get the favoriter UUID');
  await db.saveFavorites('testuser', ['https://www.furaffinity.net/view/9/'], USER.uuid);
  await db.saveMetaData('https://www.furaffinity.net/view/9/', { id: '9', username: 'other', account_name: 'other', pretty_username: 'Other', content_name: '9.other_c.png', content_url: 'https://d.furaffinity.net/art/other/9/9.other_c.png' });
  await db.setSubmissionUserUuid('9', null);
  const page = await db.getSubmissionPage('9');
  assert.equal(page.submission.user_uuid, null);
});

test('gallery queries: search, user, rating filter, ordering', async () => {
  const q = (query, order = 'DESC', ratings = ALL_RATINGS) => db.getGalleryPage(0, 25, query, order, ratings);
  assert.equal((await q({})).length, 3);
  assert.equal((await q({ searchTerm: '100%' })).length, 1, 'LIKE wildcards in the search must be literal');
  assert.equal((await q({ searchTerm: 'first test' })).length, 1, 'words match in order');
  assert.equal((await q({ searchTerm: 'test first' })).length, 0);
  assert.equal((await q({ searchTerm: 'first 100' })).length, 1);
  assert.equal((await q({ username: 'testuser' })).length, 2);
  assert.equal((await q({}, 'DESC', { general: true })).length, 2, 'General also includes unrated (NULL) submissions');
  assert.equal((await q({}, 'DESC', { adult: true })).length, 1);
  assert.equal((await q({}, 'DESC', {})).length, 0);
  const asc = await q({ username: 'testuser' }, 'ASC');
  const desc = await q({ username: 'testuser' }, 'DESC');
  assert.deepEqual(asc.map(r => r.id), desc.map(r => r.id).reverse());
});

test('SQL injection attempts are inert', async () => {
  const evil = "'; DROP TABLE subdata; --";
  const before = (await db.getAllCompleteSubmissionData()).length;
  await db.getGalleryPage(0, 25, { username: evil, searchTerm: evil }, evil, ALL_RATINGS);
  await db.getGalleryPage(evil, evil, { username: evil, galleryType: 'fav' }, 'asc', { general: true });
  await db.getSubmissionPage('1; DROP TABLE subdata');
  await db.getAllUnsavedContent(evil);
  await db.needsRepair(evil);
  await db.getComments(evil);
  await db.getAllFavoritesForUser(evil);
  await db.getAllSubmissionsForUser(evil);
  await db.deleteSubmission(evil);
  await db.setContentSaved(evil);
  await db.saveUserSettings({ latest_browser_version: "x'; DROP TABLE usersettings;--", not_a_column: 1 });
  assert.equal((await db.getAllCompleteSubmissionData()).length, before);
  assert.equal((await db.getUserSettings()).latest_browser_version, "x'; DROP TABLE usersettings;--");
});

test('descriptions and comments are sanitized when read for the gallery', async () => {
  await db.saveComments([{ id: 'cid:1', submission_id: '1', width: 'width:100%', username: 'c1', account_name: 'c1', desc: '<b>hi</b><img src=x onerror=alert(1)>', subtitle: '', date: 'd', posted_at: 1700000000 }]);
  const page = await db.getSubmissionPage('1');
  assert.doesNotMatch(page.submission.desc, /script|onclick/i);
  assert.match(page.submission.desc, /hello/);
  assert.doesNotMatch(page.comments[0].desc, /onerror/i);
  assert.match(page.comments[0].desc, /<b>hi<\/b>/);
});

test('upgrade v15 -> v16 cleans legacy comment usernames', async () => {
  const raw = await open({ filename: ':memory:', driver: sqlite3.Database });
  await raw.exec('CREATE TABLE commentdata (id TEXT, username TEXT, account_name TEXT)');
  await raw.run('INSERT INTO commentdata VALUES (?, ?, ?)', 'cid:1', 'Damianss127\n    \n    \n        ~damianss', 'x');
  await raw.run('INSERT INTO commentdata VALUES (?, ?, ?)', 'cid:2', 'blue_wolf', 'bluewolf');
  await raw.exec('PRAGMA user_version = 15');
  await upgradeDatabase(raw);
  assert.deepEqual(await raw.get("SELECT username, account_name FROM commentdata WHERE id = 'cid:1'"), { username: 'damianss', account_name: 'damianss' });
  assert.deepEqual(await raw.get("SELECT username, account_name FROM commentdata WHERE id = 'cid:2'"), { username: 'blue_wolf', account_name: 'bluewolf' });
  assert.equal((await raw.get('PRAGMA user_version')).user_version, 16);
  await raw.close();
});
