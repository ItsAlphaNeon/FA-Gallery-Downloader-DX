import test from 'node:test';
import assert from 'node:assert/strict';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { upgradeDatabase } from '../js/database-upgrade.js';

async function v15Database(rows) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec('CREATE TABLE commentdata (id TEXT UNIQUE, username TEXT, account_name TEXT)');
  await db.exec('BEGIN');
  for (let i = 0; i < rows; i++) {
    await db.run('INSERT INTO commentdata VALUES (?, ?, ?)', String(i), `Display Name\n   ~some_user${i}`, '');
  }
  await db.exec('COMMIT');
  await db.exec('PRAGMA user_version = 15');
  return db;
}

test('upgrade: comment usernames are cleaned in one go and the version is bumped', async () => {
  const db = await v15Database(5000);
  await upgradeDatabase(db);
  assert.equal((await db.get('PRAGMA user_version')).user_version, 16);
  assert.equal((await db.get(`SELECT count(*) n FROM commentdata WHERE username LIKE '%' || char(10) || '%'`)).n, 0);
  assert.deepEqual(await db.get(`SELECT username, account_name FROM commentdata WHERE id = '7'`), { username: 'some_user7', account_name: 'someuser7' });
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
