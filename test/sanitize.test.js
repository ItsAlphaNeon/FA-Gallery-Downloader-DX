import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../js/sanitize.js';

test('usernames', () => {
  assert.equal(s.sanitizeUsername('ballooneon'), 'ballooneon');
  assert.equal(s.sanitizeUsername('blue_wolf.~-1'), 'blue_wolf.~-1');
  for (const bad of ["x'; DROP TABLE subdata;--", '../../etc', '', ' ', 'a/b', 'a\\b', 5, null, 'x'.repeat(41)]) {
    assert.equal(s.sanitizeUsername(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(s.parseUsernameList('a, b_c,../x, ,d.'), { valid: ['a', 'b_c', 'd.'], invalid: ['../x'] });
});

test('submission urls', () => {
  assert.equal(s.normalizeSubmissionUrl('http://furaffinity.net/view/123'), 'https://www.furaffinity.net/view/123/');
  assert.equal(s.normalizeSubmissionUrl(' https://www.furaffinity.net/view/123/?x=1#c '), 'https://www.furaffinity.net/view/123/');
  assert.equal(s.normalizeSubmissionUrl('https://evil.com/view/123/'), null);
  assert.equal(s.normalizeSubmissionUrl('https://www.furaffinity.net.evil.com/view/1/'), null);
  assert.equal(s.normalizeSubmissionUrl('https://www.furaffinity.net/view/abc/'), null);
});

test('only FA https urls get cookies; only web urls are opened', () => {
  assert.equal(s.isFaUrl('https://d.furaffinity.net/art/x.png'), true);
  assert.equal(s.isFaUrl('https://www.furaffinity.net/'), true);
  assert.equal(s.isFaUrl('https://furaffinity.net.evil.com/x'), false);
  assert.equal(s.isFaUrl('https://evilfuraffinity.net/x'), false);
  assert.equal(s.isFaUrl('http://www.furaffinity.net/x'), false);
  assert.equal(s.isSafeExternalUrl('https://example.com'), true);
  for (const bad of ['file:///C:/Windows/notepad.exe', 'javascript:alert(1)', 'data:text/html,hi', '', undefined]) {
    assert.equal(s.isSafeExternalUrl(bad), false, `should reject ${bad}`);
  }
});

test('file names and paths cannot escape', () => {
  assert.equal(s.sanitizeFileName('../../evil.exe'), 'evil.exe');
  assert.equal(s.sanitizeFileName('..' + '\\' + '..' + '\\' + 'evil.exe'), 'evil.exe');
  assert.equal(s.sanitizeFileName('..'), '_');
  assert.equal(s.sanitizeFileName('a<b>:c.png'), 'a_b__c.png');
  assert.equal(s.sanitizeFileName('CON'), '_CON');
  assert.equal(s.sanitizeFileName('1762623497.user_file.png'), '1762623497.user_file.png');
  assert.equal(s.safeJoin('/base', '..', 'x'), null);
  assert.ok(s.safeJoin('/base', 'ok', 'x'));
});

test('numbers and LIKE patterns', () => {
  assert.equal(s.toInt('9999', 1, 500, 25), 500);
  assert.equal(s.toInt('abc; DROP', 1, 500, 25), 25);
  assert.equal(s.toInt(-5, 0, 10, 0), 0);
  assert.equal(s.escapeLike('50%_off\\'), '50\\%\\_off\\\\');
});

test('html sanitizer removes active content but keeps FA formatting', () => {
  const dirty = '<p onclick="x()">hi <script>alert(1)</script><a href="javascript:alert(1)">bad</a> '
    + '<a href=" jav&#x09;ascript:alert(1)">bad2</a> <a href="/user/x/" class="auto_link">ok</a>'
    + '<img src="https://a.furaffinity.net/x.gif" onerror="alert(1)"><iframe src="x"></iframe><svg onload=alert(1)></svg>'
    + '<span style="color:red">r</span><span style="background:url(javascript:x)">u</span><i class="bbcode">i</i><weird>unwrap</weird></p>';
  const clean = s.sanitizeHtml(dirty);
  assert.ok(!/script|onclick|onerror|iframe|svg|javascript|onload|url\(/i.test(clean), clean);
  assert.match(clean, /class="auto_link"/);
  assert.match(clean, /color:red/);
  assert.match(clean, /<img src="https:\/\/a\.furaffinity\.net\/x\.gif">/);
  assert.match(clean, /unwrap/);
  assert.doesNotMatch(clean, /weird/);
  assert.equal(s.sanitizeHtml(null), '');
});
