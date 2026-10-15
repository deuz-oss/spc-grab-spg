import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appVersionLabel } from './appVersion';

test('native build: version name and build number', () => {
  assert.equal(appVersionLabel('1.0.0', '2'), '1.0.0 (build 2)');
});

test('web has no native build number', () => {
  assert.equal(appVersionLabel('1.0.0', null), '1.0.0 (web)');
});

test('missing version name still shows the build', () => {
  assert.equal(appVersionLabel(null, '7'), '? (build 7)');
});
