import test from 'node:test';
import assert from 'node:assert/strict';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { upgradeDatabase, LATEST_DB_VERSION } from '../js/database-upgrade.js';

async function v15Database(rows) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE subdata (id TEXT PRIMARY KEY, title TEXT, desc TEXT, tags TEXT, username TEXT, content_name TEXT)');
  await db.run('INSERT INTO subdata VALUES (?, ?, ?, ?, ?, ?)', '1', 'Cuddle pile', 'very cuddly', 'cuddle,red_fox', 'someone', '1.someone_a.png');
  await db.exec('CREATE TABLE commentdata (id TEXT UNIQUE, username TEXT, account_name TEXT)');
  await db.exec('BEGIN');
  for (let i = 0; i < rows; i++) {
    await db.run('INSERT INTO commentdata VALUES (?, ?, ?)', String(i), `Display Name\n   ~some_user${i}`, '');
  }
  await db.exec('COMMIT');
  await db.exec('PRAGMA user_version = 15');
  return db;
}

test('upgrade: comment usernames are cleaned in one go and the version is bumped', async (t) => {
  const db = await v15Database(5000);
  const lines = [];
  const log = t.mock.method(console, 'log', (msg) => lines.push(msg));
  const result = await upgradeDatabase(db);
  log.mock.restore();
  assert.deepEqual(result, { from: 15, to: LATEST_DB_VERSION });
  assert.match(lines[0], new RegExp(`Upgrading database from v15 to v${LATEST_DB_VERSION}`));
  assert.ok(lines.some(l => /Cleaning up 5000 saved comment usernames/.test(l)));
  assert.equal((await db.get('PRAGMA user_version')).user_version, LATEST_DB_VERSION);
  assert.equal((await db.get(`SELECT count(*) n FROM commentdata WHERE username LIKE '%' || char(10) || '%'`)).n, 0);
  assert.deepEqual(await db.get(`SELECT username, account_name FROM commentdata WHERE id = '7'`), { username: 'some_user7', account_name: 'someuser7' });
  // The search index is filled after the VACUUM and kept in sync afterwards
  const find = (q) => db.all('SELECT rowid FROM subdata_fts WHERE subdata_fts MATCH ?', q);
  assert.equal((await find('red_fox')).length, 1);
  await db.run(`UPDATE subdata SET title = 'Snuggle pile' WHERE id = '1'`);
  assert.equal((await find('cuddle')).length, 1, 'still in the tags');
  assert.equal((await find('{title} : cuddle')).length, 0);
  assert.equal((await find('{title} : snuggle')).length, 1);
  await db.run(`DELETE FROM subdata WHERE id = '1'`);
  assert.equal((await find('snuggle')).length, 0);
  await db.close();
});

test('upgrade: an up-to-date database is left alone', async (t) => {
  const db = await v15Database(1);
  await upgradeDatabase(db);
  const log = t.mock.method(console, 'log', () => {});
  const exec = t.mock.method(db, 'exec');
  await upgradeDatabase(db);
  assert.equal(exec.mock.callCount(), 0, 'no VACUUM or version write on a current database');
  assert.equal(log.mock.callCount(), 0);
  await db.close();
});
