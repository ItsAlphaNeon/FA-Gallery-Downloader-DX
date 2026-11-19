import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, compareVersions } from '../js/version.js';

test('version: release tags parse to numbers', () => {
  assert.deepEqual(parseVersion('v3.0.0'), [3, 0, 0]);
  assert.deepEqual(parseVersion('2.8.0'), [2, 8, 0]);
  assert.deepEqual(parseVersion('v2.8.0.m'), [2, 8, 0]);
  assert.deepEqual(parseVersion('v3.1'), [3, 1, 0]);
  assert.equal(parseVersion(''), null);
  assert.equal(parseVersion(undefined), null);
  assert.equal(parseVersion('latest'), null);
});

test('version: update is offered only for a newer release', () => {
  assert.ok(compareVersions('3.0.0', '2.8.0') > 0);
  assert.ok(compareVersions('2.10.0', '2.9.9') > 0);
  assert.ok(compareVersions('2.8.0', '3.0.0') < 0);
  assert.equal(compareVersions('v3.0.0', '3.0.0'), 0);
  assert.equal(compareVersions('2.8.0.m', '2.8.0'), 0);
  assert.equal(compareVersions('', '3.0.0'), 0);
});
