import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPages } from './paging';

/** A fake table behind a server that, like Supabase, never returns more than `cap` rows. */
const table = (n: number, cap: number) => {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { rows, calls, page };
};

test('reads past the server row cap', async () => {
  const t = table(2500, 1000);
  const { data, error } = await fetchAllPages(t.page);
  assert.equal(error, null);
  assert.deepEqual(data, t.rows);
  assert.deepEqual(t.calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('one request when everything fits', async () => {
  const t = table(10, 1000);
  assert.equal((await fetchAllPages(t.page)).data.length, 10);
  assert.equal(t.calls.length, 1);
});

test('exactly one full page needs a second, empty request to know it is the end', async () => {
  const t = table(1000, 1000);
  assert.equal((await fetchAllPages(t.page)).data.length, 1000);
  assert.equal(t.calls.length, 2);
});

test('an error stops and is returned', async () => {
  let n = 0;
  const r = await fetchAllPages(async () => (n++ === 0 ? { data: [1, 2], error: null } : { data: null, error: { message: 'boom' } }), 2);
  assert.equal(r.error?.message, 'boom');
});
