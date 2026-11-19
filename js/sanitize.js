import * as cheerio from 'cheerio';
import path from 'node:path';

/**
 * Central input validation/sanitization. Everything that originates outside the process
 * (startup form, gallery page bindings, scraped FA HTML) should pass through here before it
 * reaches a URL, the filesystem, the shell, or rendered HTML.
 */

const USERNAME_REGEX = /^[a-z0-9][a-z0-9._~-]{0,39}$/i;
const SUBMISSION_URL_REGEX = /^https?:\/\/(?:www\.)?furaffinity\.net\/view\/(\d+)\/?(?:[?#].*)?$/i;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a single FA username. Returns the trimmed name, or null if it is not a valid name.
 * @param {*} name
 * @returns {String|null}
 */
export function sanitizeUsername(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return USERNAME_REGEX.test(trimmed) ? trimmed : null;
}
/**
 * Splits a comma separated list of names, returning the valid ones and the rejected ones.
 * @param {String} str
 * @returns {{valid: String[], invalid: String[]}}
 */
export function parseUsernameList(str) {
  const valid = [];
  const invalid = [];
  if (typeof str !== 'string') return { valid, invalid };
  str.split(',').map(n => n.trim()).filter(Boolean).forEach((n) => {
    const clean = sanitizeUsername(n);
    (clean ? valid : invalid).push(clean || n);
  });
  return { valid, invalid };
}
export function isUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}
/**
 * Returns the canonical URL for an FA submission link, or null if it isn't one.
 * @param {*} url
 * @returns {String|null}
 */
export function normalizeSubmissionUrl(url) {
  if (typeof url !== 'string') return null;
  const match = url.trim().match(SUBMISSION_URL_REGEX);
  return match ? `https://www.furaffinity.net/view/${match[1]}/` : null;
}
/**
 * Only furaffinity.net (and its subdomains, e.g. d.furaffinity.net) over https.
 * Used to ensure login cookies are never sent anywhere else.
 */
export function isFaUrl(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && (hostname === 'furaffinity.net' || hostname.endsWith('.furaffinity.net'));
  } catch {
    return false;
  }
}
/**
 * Only plain web links may be handed to the OS "open" handler.
 */
export function isSafeExternalUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}
/**
 * Makes a string safe to use as a single file or folder name (no traversal, no reserved characters).
 * @param {*} name
 * @param {String} fallback Used when nothing usable remains.
 * @returns {String}
 */
export function sanitizeFileName(name, fallback = '_') {
  if (typeof name !== 'string') return fallback;
  let clean = path.win32.basename(path.posix.basename(name.replace(/\\/g, '/')))
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .slice(0, 200);
  if (!clean || /^\.+$/.test(clean)) return fallback;
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(clean)) clean = `_${clean}`;
  return clean;
}
/**
 * Resolves child inside base, refusing anything that escapes it.
 * @returns {String|null}
 */
export function safeJoin(base, ...segments) {
  const resolvedBase = path.resolve(base);
  const target = path.resolve(resolvedBase, ...segments);
  return (target === resolvedBase || target.startsWith(resolvedBase + path.sep)) ? target : null;
}
/** Clamps a value to an integer range (for LIMIT/OFFSET style values). */
export function toInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
/** Escapes % _ \ for use in a LIKE ... ESCAPE '\' pattern. */
export function escapeLike(value) {
  return String(value ?? '').replace(/[\\%_]/g, (c) => '\\' + c);
}

// ---- HTML sanitizing (descriptions/comments are rendered with v-html in a privileged page) ----
const ALLOWED_TAGS = new Set([
  'a', 'b', 'i', 'u', 's', 'em', 'strong', 'strike', 'del', 'ins', 'sub', 'sup', 'small', 'big',
  'br', 'hr', 'p', 'div', 'span', 'center', 'blockquote', 'code', 'pre', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'font',
]);
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input',
  'button', 'textarea', 'select', 'link', 'meta', 'base', 'svg', 'math', 'template', 'noscript', 'audio', 'video',
]);
const ALLOWED_ATTRS = {
  '*': ['class', 'title', 'style', 'align'],
  a: ['href', 'rel'],
  img: ['src', 'alt', 'width', 'height'],
  font: ['color', 'size'],
};
const SAFE_URL_REGEX = /^(?:https?:|mailto:|\/(?!\/)|\/\/|#)/i;
const SAFE_STYLE_REGEX = /^[\w\s#%.,:;()!-]*$/;

function isSafeUrl(value) {
  // Strip whitespace/control characters browsers ignore inside schemes (e.g. "java\nscript:")
  // eslint-disable-next-line no-control-regex
  const v = value.replace(/[\u0000- ]/g, '');
  return SAFE_URL_REGEX.test(v);
}
/**
 * Allowlist-based HTML sanitizer. Removes scripts, event handlers, dangerous URLs and unknown tags.
 * @param {String} html
 * @returns {String}
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const $ = cheerio.load(html, null, false);
  const els = $('*').toArray().reverse(); // children before parents
  for (const el of els) {
    const $el = $(el);
    const tag = (el.tagName || '').toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      $el.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      $el.replaceWith($el.contents());
      continue;
    }
    const allowed = new Set([...ALLOWED_ATTRS['*'], ...(ALLOWED_ATTRS[tag] || [])]);
    for (const attr of Object.keys(el.attribs || {})) {
      const value = el.attribs[attr];
      if (!allowed.has(attr)) {
        $el.removeAttr(attr);
      } else if ((attr === 'href' || attr === 'src') && !isSafeUrl(value)) {
        $el.removeAttr(attr);
      } else if (attr === 'style' && (!SAFE_STYLE_REGEX.test(value) || /url\(|expression|@import/i.test(value))) {
        $el.removeAttr(attr);
      }
    }
    if (tag === 'a' && el.attribs?.href) $el.attr('rel', 'noopener noreferrer');
  }
  return $.html();
}
