/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { agoLabel, liveState, STALE_AFTER_MIN } from './live';

const NOW = new Date(2026, 8, 26, 9, 30).getTime();
const MIN = 60000;

describe('liveState', () => {
  it('in store vs on the road while the position is fresh', () => {
    assert.equal(liveState(NOW - 2 * MIN, true, NOW), 'in_store');
    assert.equal(liveState(NOW - 2 * MIN, false, NOW), 'on_the_road');
  });

  it('becomes stale only after the threshold, regardless of store check-in', () => {
    assert.equal(liveState(NOW - STALE_AFTER_MIN * MIN, false, NOW), 'on_the_road');
    assert.equal(liveState(NOW - (STALE_AFTER_MIN + 1) * MIN, true, NOW), 'stale');
  });
});

describe('agoLabel', () => {
  it('formats minutes and hours in Indonesian', () => {
    assert.equal(agoLabel(NOW - 20 * 1000, NOW), 'baru saja');
    assert.equal(agoLabel(NOW - 5 * MIN, NOW), '5 menit lalu');
    assert.equal(agoLabel(NOW - 120 * MIN, NOW), '2 jam lalu');
    assert.equal(agoLabel(NOW - 130 * MIN, NOW), '2 jam 10 menit lalu');
  });

  it('never shows negative time (device clock slightly behind the server)', () => {
    assert.equal(agoLabel(NOW + 30 * 1000, NOW), 'baru saja');
  });
});

describe('heartbeat vs stale', () => {
  it('an SPG standing still sends heartbeats often enough never to look stale', async () => {
    const { TRACK_HEARTBEAT_MS } = await import('../config');
    // at least two heartbeats may be missed (Android throttling) before the map says "Tidak ada update"
    assert.ok(TRACK_HEARTBEAT_MS * 3 <= STALE_AFTER_MIN * MIN, `heartbeat ${TRACK_HEARTBEAT_MS / MIN} min vs stale ${STALE_AFTER_MIN} min`);
  });
});
