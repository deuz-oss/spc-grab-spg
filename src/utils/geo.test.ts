import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineM, venueFence } from './geo';

const venue = { lat: -7.2625, lng: 112.7389, radiusM: 150 };

test('distance matches the server smoke-test fixture (~300 m north)', () => {
  const d = haversineM(venue, { lat: -7.2598, lng: 112.7389 });
  assert.ok(d > 250 && d < 350, `got ${d}`);
});

test('fence: inside radius, outside radius, mocked never inside', () => {
  assert.equal(venueFence(venue, { lat: -7.2626, lng: 112.739 }, false).inside, true);
  assert.equal(venueFence(venue, { lat: -7.2598, lng: 112.7389 }, false).inside, false);
  assert.equal(venueFence(venue, { lat: -7.2625, lng: 112.7389 }, true).inside, false);
});
