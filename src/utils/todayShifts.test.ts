import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayShifts } from './todayShifts';
import type { Attendance, Shift } from '../types';

const shift = (id: string, shiftDate: string, plannedStart: string, extra: Partial<Shift> = {}): Shift => ({
  id, requestId: 'r', venueId: 'v', spgId: 'me', shiftDate, plannedStart, plannedEnd: '23:59:00', overtimeHours: 0,
  status: 'planned', validatedAt: null, replacesShiftId: null, ...extra,
});
const att = (shiftId: string, clockOutAt: number | null, userId = 'me'): Attendance => ({
  id: `a_${shiftId}`, shiftId, userId, clockInAt: 1, clockInLat: 0, clockInLng: 0, mocked: false, geoValid: true,
  distanceM: 0, lateMin: 0, clockOutAt, autoClosed: false, route: [],
});

test("today's shifts in start order; cancelled, replaced and other people's left out", () => {
  const got = todayShifts([
    shift('late', '2026-10-16', '15:30:00'),
    shift('early', '2026-10-16', '09:00:00', { status: 'no_show' }),
    shift('gone', '2026-10-16', '08:00:00', { status: 'cancelled' }),
    shift('swapped', '2026-10-16', '08:00:00', { status: 'replaced' }),
    shift('other', '2026-10-16', '08:00:00', { spgId: 'someone' }),
    shift('tomorrow', '2026-10-17', '09:00:00'),
  ], [], 'me', '2026-10-16');
  assert.deepEqual(got.map((s) => s.id), ['early', 'late']);
});

test('a shift from yesterday with the session still open stays on top, so the SPG can clock out (B5)', () => {
  const got = todayShifts(
    [shift('today', '2026-10-16', '15:30:00'), shift('last_night', '2026-10-15', '22:30:00')],
    [att('last_night', null)],
    'me', '2026-10-16',
  );
  assert.deepEqual(got.map((s) => s.id), ['last_night', 'today']);
});

test('a finished session from yesterday does not come back', () => {
  const got = todayShifts([shift('last_night', '2026-10-15', '22:30:00')], [att('last_night', 2)], 'me', '2026-10-16');
  assert.deepEqual(got, []);
});

test("someone else's open session is not shown", () => {
  const got = todayShifts([shift('x', '2026-10-15', '22:30:00')], [att('x', null, 'someone')], 'me', '2026-10-16');
  assert.deepEqual(got, []);
});

test('signed out: nothing', () => {
  assert.deepEqual(todayShifts([shift('a', '2026-10-16', '09:00:00')], [], undefined, '2026-10-16'), []);
});
