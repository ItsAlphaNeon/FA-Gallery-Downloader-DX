// Version helpers shared by the update check (Node) and the start page (browser).

/**
 * Turns "v3.0.0", "3.0.0" or "2.8.0.m" into [major, minor, patch]. Anything that is not a plain
 * number (a leading "v", suffixes like ".m" or "-beta") is ignored.
 * @param {string} version
 * @returns {number[]|null}
 */
export function parseVersion(version) {
  const match = String(version ?? '').trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (!match) return null;
  return [match[1], match[2], match[3]].map(n => +(n || 0));
}

/**
 * @returns {number} >0 when a is newer than b, <0 when older, 0 when equal or unparsable.
 */
export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i] - vb[i];
  }
  return 0;
}
