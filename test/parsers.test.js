// Parser tests against saved (trimmed + anonymized) FA pages in test/fixtures.
// If FA changes its markup, refresh the fixtures from the live site (npm run check:fa shows what broke).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { processUserHTML, processSubmissionHTML, parseGalleryLinks, parseFavoritesNextPage, parseComments } from '../js/scrape-data.js';
import { parseLoggedInUsername, isClassicTheme } from '../js/login.js';
import { checkLoggedIn, checkUser, checkGalleryLinks, checkSubmission, checkComments } from './structure-checks.js';

const load = (name) => cheerio.load(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const SUBMISSION_URL = 'https://www.furaffinity.net/view/62922607/';

test('login: reads the logged-in username and theme', () => {
  const $ = load('user.html');
  assert.equal(parseLoggedInUsername($), 'testuser');
  assert.deepEqual(checkLoggedIn(parseLoggedInUsername($)), []);
  assert.equal(isClassicTheme($), false);
  assert.equal(parseLoggedInUsername(cheerio.load('<html><body></body></html>')), false);
});

test('user profile: UUID and identity', () => {
  const user = processUserHTML(load('user.html'));
  assert.deepEqual(checkUser(user), []);
  assert.equal(user.uuid, '00000000-0000-1000-8000-000000000001');
  assert.equal(user.username, 'testuser');
  assert.equal(user.pretty_username, 'TestUser');
  assert.equal(user.registered, '2022-02-28T09:06:58.000Z');
});
test('user profile: UUID is also found in the gallery page header', () => {
  assert.equal(processUserHTML(load('gallery.html'))?.uuid, '00000000-0000-1000-8000-000000000001');
});
test('user profile: no UUID -> null (not a crash)', () => {
  assert.equal(processUserHTML(cheerio.load('<html><body><p>nothing</p></body></html>')), null);
});

test('gallery / scraps / favorites: submission links', () => {
  const gallery = parseGalleryLinks(load('gallery.html'));
  assert.deepEqual(checkGalleryLinks(gallery), []);
  assert.equal(gallery.length, 4);
  assert.equal(gallery[0], SUBMISSION_URL);
  assert.deepEqual(checkGalleryLinks(parseGalleryLinks(load('scraps.html')), 'scraps'), []);
  assert.deepEqual(checkGalleryLinks(parseGalleryLinks(load('favorites.html')), 'favorites'), []);
});
test('favorites: next-page link', () => {
  const next = parseFavoritesNextPage(load('favorites.html'), 'https://www.furaffinity.net/favorites/testuser/');
  assert.equal(next, 'https://www.furaffinity.net/favorites/testuser/2040067214/next');
  assert.equal(parseFavoritesNextPage(load('gallery.html'), 'https://www.furaffinity.net/favorites/testuser/'), undefined);
});

test('submission page: metadata', () => {
  const d = processSubmissionHTML(load('submission.html'), SUBMISSION_URL);
  assert.deepEqual(checkSubmission(d), []);
  assert.equal(d.id, '62922607');
  assert.equal(d.title, 'Loving my Balloons~');
  assert.equal(d.username, 'testuser');
  assert.equal(d.pretty_username, 'TestUser');
  assert.equal(d.rating, 'General');
  assert.equal(d.category, 'All');
  assert.equal(d.uploaded_at, 1762623497);
  assert.equal(d.content_name, '1762623497.testuser_hugs-with-balloon-balloo-neon.png');
  assert.equal(d.content_url, 'https://d.furaffinity.net/art/testuser/1762623497/1762623497.testuser_hugs-with-balloon-balloo-neon.png');
  assert.ok(d.tags.split(',').includes('balloons'));
  assert.ok(d.desc.length > 0);
});
test('submission page: a different rating/category parses too', () => {
  const d = processSubmissionHTML(load('submission-comments.html'), 'https://www.furaffinity.net/view/53959594/');
  assert.deepEqual(checkSubmission(d), []);
  assert.equal(d.rating, 'Mature');
});

test('comments: parsed with a clean login name and real timestamp', () => {
  const comments = parseComments(load('submission-comments.html'), '53959594');
  assert.equal(comments.length, 3);
  assert.deepEqual(checkComments(comments), []);
  assert.deepEqual(comments.map(c => c.username), ['commenter1', 'commenter2', 'commenter3']);
  assert.equal(comments[0].id, 'cid:175257528');
  assert.equal(comments[0].desc, 'Test comment 1');
  assert.equal(comments[0].posted_at, 1696708759);
  assert.equal(comments[0].submission_id, '53959594');
});
test('comments: none on a page without any', () => {
  assert.deepEqual(parseComments(load('submission.html'), '62922607'), []);
});

test('structure checks actually catch breakage', () => {
  assert.ok(checkUser(null).length);
  assert.ok(checkSubmission({}).length >= 8);
  assert.ok(checkGalleryLinks([]).length);
  assert.ok(checkComments([{ id: 'x', username: 'a\n  ~a', desc: 'd', date: 'd' }]).length);
});
