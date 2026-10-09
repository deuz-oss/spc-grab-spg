import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoObjectPath, photoStoragePath } from './photoRef';

test('object path puts the owner uid first (storage RLS checks it)', () => {
  assert.equal(photoObjectPath('u1', 'a_123', 'JPG'), 'u1/a_123.jpg');
  assert.equal(photoObjectPath('u1', 'k_9', '../etc'), 'u1/k_9.jpg');
});

test('storage path resolves bucket paths and rejects local or foreign refs', () => {
  assert.equal(photoStoragePath('u1/a_123.jpg'), 'u1/a_123.jpg');
  assert.equal(photoStoragePath('/u1/a_123.jpg'), 'u1/a_123.jpg');
  assert.equal(photoStoragePath('file:///data/x.jpg'), null);
  assert.equal(photoStoragePath('https://example.com/x.jpg'), null);
  assert.equal(photoStoragePath('  '), null);
  assert.equal(photoStoragePath(null), null);
});
