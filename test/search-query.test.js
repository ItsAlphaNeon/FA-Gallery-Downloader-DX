import test from 'node:test';
import assert from 'node:assert/strict';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { buildSearch } from '../js/search-query.js';

// The examples from FA's search help, run against a tiny index shaped like subdata_fts
const ROWS = [
  ['Fender plushie', 'a quick brown fox jumps', 'plushie,red_fox', 'fender'],
  ['Rednef truck', 'brown and quick loud fox', 'truck,gray_fox', 'rednef'],
  ['Box fox', 'socks', 'arctic_fox,fennec', 'someone'],
  ['Cuddle pile', 'brown and quick very loud fox', 'cuddle,hug', 'neon'],
];

const index = await (async () => {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE VIRTUAL TABLE f USING fts5(title, desc, tags, username, content_name, tokenize="unicode61 tokenchars '_'")`);
  for (const [i, r] of ROWS.entries()) await db.run('INSERT INTO f (rowid, title, desc, tags, username) VALUES (?, ?, ?, ?, ?)', i + 1, ...r);
  return db;
})();

async function find(text, mode) {
  const s = buildSearch(text, mode);
  if (!s) return null;
  const rows = s.match
    ? await index.all('SELECT rowid FROM f WHERE f MATCH ? ORDER BY rowid', s.match)
    : await index.all('SELECT rowid FROM f WHERE rowid NOT IN (SELECT rowid FROM f WHERE f MATCH ?) ORDER BY rowid', s.exclude);
  return rows.map(r => r.rowid);
}

const cases = [
  ['fender & plushie', [1]],
  ['fender plushie', [1]],
  ['fender | rednef', [1, 2]],
  ['fox -fender', [2, 3, 4]],
  ['fox !fender', [2, 3, 4]],
  ['-truck', [1, 3, 4]],
  ['fox & (box | socks)', [3]],
  ['"quick brown fox"', [1]],
  ['"quick brown fox"~3', [1, 2]],
  ['"red_fox gray_fox arctic_fox fennec swift_fox kit_fox"/2', [3]],
  ['quick << brown << fox', [1, 2, 4]],
  ['@title fender', [1]],
  ['@message socks', [3]],
  ['@lower rednef', [2]],
  ['@keywords plushie', [1]],
  ['@(title,keywords) fox', [3]],
  ['(fender | rednef) -truck @keywords plushie', [1]],
  ['cudd', [4]],
  ['@title cudd', []],
  ['@title cudd*', [4]],
];
for (const [text, expected] of cases) {
  test(`search: ${text}`, async () => assert.deepEqual(await find(text), expected));
}

test('search: "all" and "any" modes treat operators as plain words', async () => {
  assert.deepEqual(await find('fender | rednef', 'all'), []);
  assert.deepEqual(await find('fender | rednef', 'any'), [1, 2]);
  assert.deepEqual(await find('-truck', 'any'), [2]);
});

test('search: nothing to search for', () => {
  for (const text of ['', '   ', '((', '"', '@title', '| &']) assert.equal(buildSearch(text), null, JSON.stringify(text));
});

test('search: quotes in a word cannot break out of the FTS string', async () => {
  for (const text of ['x" OR 1=1 --', 'a"b', '"""', "it's", 'NEAR(a b)', '{title}:x', 'a:b']) {
    await find(text); // must not throw
  }
});
