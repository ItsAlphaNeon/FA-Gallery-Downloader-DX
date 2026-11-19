/**
 * Shared "does this look right?" checks for everything we scrape from FA.
 *
 * Used by the fixture tests (test/parsers.test.js) and by the live canary (npm run check:fa), so a
 * change to FA's markup shows up the same way in both: as a readable list of what stopped parsing.
 * Every check returns an array of problem strings (empty = everything parsed).
 */

const isNonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function needFields(obj, fields, label) {
  return fields.filter(f => !isNonEmpty(obj?.[f])).map(f => `${label}: "${f}" is missing/empty`);
}

/** @param {String|false} name Result of parseLoggedInUsername */
export function checkLoggedIn(name) {
  return isNonEmpty(name) ? [] : ['login: could not read the logged-in username from the menu bar (#ddmenu)'];
}

export function checkUser(user) {
  if (!user) return ['user: no profile header / UUID found'];
  const problems = needFields(user, ['username', 'account_name', 'pretty_username', 'registered'], 'user');
  if (!UUID.test(user.uuid || '')) problems.push('user: "uuid" is not a valid UUID');
  return problems;
}

export function checkGalleryLinks(links, label = 'gallery') {
  if (!links?.length) return [`${label}: no submission links found (figcaption a[href^="/view"])`];
  return links.filter(l => !/^https:\/\/www\.furaffinity\.net\/view\/\d+\/$/.test(l))
    .map(l => `${label}: unexpected link format: ${l}`);
}

export function checkSubmission(d, { requireTags = true } = {}) {
  const problems = needFields(d, [
    'id', 'title', 'username', 'pretty_username', 'content_url', 'content_name', 'date_uploaded', 'category',
  ], 'submission');
  if (requireTags) problems.push(...needFields(d, ['tags'], 'submission'));
  if (!/^\d+$/.test(d?.id || '')) problems.push('submission: "id" is not numeric');
  if (!/^https:\/\/d\.furaffinity\.net\//.test(d?.content_url || '')) problems.push('submission: "content_url" is not a d.furaffinity.net link');
  if (!/\.[a-z0-9]+$/i.test(d?.content_name || '')) problems.push('submission: "content_name" has no file extension');
  if (!['General', 'Mature', 'Adult'].includes(d?.rating)) problems.push(`submission: "rating" is "${d?.rating}", expected General/Mature/Adult`);
  if (!Number.isInteger(d?.uploaded_at) || d.uploaded_at <= 0) problems.push('submission: "uploaded_at" (popup_date data-time) is missing');
  if (typeof d?.desc !== 'string') problems.push('submission: "desc" is missing');
  return problems;
}

export function checkComments(comments) {
  const problems = [];
  comments.forEach((c, i) => {
    const label = `comment ${i + 1}`;
    problems.push(...needFields(c, ['id', 'username', 'desc', 'date'], label));
    if (/\s/.test(c.username || '')) problems.push(`${label}: "username" contains whitespace: ${JSON.stringify(c.username)}`);
    if (!Number.isInteger(c.posted_at) || c.posted_at <= 0) problems.push(`${label}: "posted_at" is missing`);
  });
  return problems;
}
