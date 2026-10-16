/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendCapped, selectNewPoints } from './routeFilter';

// ~111 m per 0.001° of latitude
const p = (lat: number, t: number) => ({ lat, lng: 106.8, t });

describe('selectNewPoints', () => {
  it('keeps every fix of a batch (not just the last), in time order', () => {
    const { kept, last } = selectNewPoints(null, [p(-6.003, 3000), p(-6.001, 1000), p(-6.002, 2000)], 8);
    assert.deepEqual(kept.map((x) => x.t), [1000, 2000, 3000]);
    assert.equal(last?.t, 3000);
  });

  it('drops fixes closer than the min step to the previously kept point', () => {
    const { kept } = selectNewPoints(p(-6.0, 0), [p(-6.00001, 1000), p(-6.001, 2000), p(-6.00101, 3000)], 8);
    assert.deepEqual(kept.map((x) => x.t), [2000]);
  });

  it('standing still: keeps a heartbeat point once the heartbeat interval has passed (B4)', () => {
    const MIN = 60000;
    // fixes every 15 s for 11 min, all within 1 m of the booth
    const batch = Array.from({ length: 44 }, (_, i) => p(-6.0 - (i % 2) * 0.000005, (i + 1) * 15000));
    const { kept } = selectNewPoints(p(-6.0, 0), batch, 8, 5 * MIN);
    assert.deepEqual(kept.map((x) => x.t), [5 * MIN, 10 * MIN]);
  });

  it('without a heartbeat, standing still keeps nothing', () => {
    const { kept } = selectNewPoints(p(-6.0, 0), [p(-6.000005, 10 * 60000)], 8);
    assert.deepEqual(kept, []);
  });

  it('ignores fixes not newer than the last kept one (re-delivered batches)', () => {
    const { kept, last } = selectNewPoints(p(-6.0, 5000), [p(-6.01, 4000), p(-6.02, 5000)], 8);
    assert.deepEqual(kept, []);
    assert.equal(last?.t, 5000);
  });
});

describe('appendCapped', () => {
  it('appends below the cap', () => {
    assert.deepEqual(appendCapped([1, 2], [3], 5), [1, 2, 3]);
  });

  it('drops the oldest entries beyond the cap', () => {
    assert.deepEqual(appendCapped([1, 2, 3], [4, 5], 3), [3, 4, 5]);
  });
});
