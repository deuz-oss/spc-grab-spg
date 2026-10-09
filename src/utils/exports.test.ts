import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attendanceRows, billingLines, isBillable, wibClock, type ExportData } from './exports';
import type { Shift } from '../types';

const shift = (id: string, date: string, over: Partial<Shift> = {}): Shift => ({
  id, requestId: 'r1', venueId: 'v1', spgId: 'u1', shiftDate: date, plannedStart: '09:00:00', plannedEnd: '19:00:00',
  overtimeHours: 2, status: 'done', validatedAt: 1, replacesShiftId: null, ...over,
});

const base: ExportData = {
  shifts: [
    shift('s1', '2026-11-03'),
    shift('s2', '2026-11-04', { validatedAt: null }),
    shift('s3', '2026-11-05'),
    shift('s4', '2026-11-06', { status: 'no_show', overtimeHours: 2 }),
    shift('s5', '2026-12-01'),
  ],
  requests: [{
    id: 'r1', campaignId: 'c1', cityId: 'sby', venueId: 'v1', grade: 'B', headcount: 1, startDate: '2026-11-01',
    endDate: '2026-12-31', shiftHours: 10, package: 'monthly', status: 'running', submittedAt: 0, slaHiringDue: null,
    staffedAt: null, notes: '',
  }],
  attendances: [{
    id: 'a1', shiftId: 's1', userId: 'u1', clockInAt: Date.UTC(2026, 10, 3, 2, 5), clockInLat: 0, clockInLng: 0, mocked: false,
    geoValid: true, distanceM: 20, lateMin: 5, clockOutAt: Date.UTC(2026, 10, 3, 12, 5), autoClosed: false, route: [],
  }],
  exceptions: [{ id: 1, shiftId: 's3', type: 'late', detail: '', detectedAt: 0, status: 'open', note: '' }],
  kpiLogs: [
    { id: 'k1', shiftId: 's1', spgId: 'u1', fieldKey: 'downloads', value: 7, proofPath: 'x', loggedAt: 0 },
    { id: 'k2', shiftId: 's1', spgId: 'u1', fieldKey: 'downloads', value: 5, proofPath: 'y', loggedAt: 0 },
  ],
  profiles: [{
    id: 'u1', name: 'Sari', username: 'sari', role: 'spg', cityId: 'sby', active: true, grade: 'B', contractType: 'pkwt',
    documentsOk: true, phoneOk: true, bpjsRegistered: true, consentVersion: 'v', consentAt: 0, photoPath: null,
  }],
  venues: [{ id: 'v1', cityId: 'sby', name: 'TP', address: '', lat: 0, lng: 0, radiusM: 150 }],
  cities: [{ id: 'sby', name: 'Kota Surabaya', province: 'Jatim', capability: 'Strong' }],
  campaigns: [{ id: 'c1', name: 'Food', type: 'user', kpiFields: [], active: true }],
};

test('WIB clock from epoch ms', () => {
  assert.equal(wibClock(Date.UTC(2026, 10, 3, 2, 5)), '09:05');
  assert.equal(wibClock(null), '');
});

test('billable = done + validated + no open exception', () => {
  assert.equal(isBillable(base.shifts[0], base.exceptions), true);
  assert.equal(isBillable(base.shifts[1], base.exceptions), false);
  assert.equal(isBillable(base.shifts[2], base.exceptions), false);
  assert.equal(isBillable(base.shifts[3], base.exceptions), false);
});

test('billing recap counts validated SPG-days in the month only', () => {
  const lines = billingLines(base, '2026-11');
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], { city: 'Kota Surabaya', grade: 'B', pkg: 'monthly', shiftHours: 10, days: 1, overtimeHours: 2 });
});

test('payroll export: hours split 8 + 2, no pay for a no-show, KPI summed', () => {
  const rows = attendanceRows(base, '2026-11-01', '2026-11-30', true);
  const head = rows[0];
  const col = (name: string) => head.indexOf(name);
  assert.equal(rows.length, 5); // header + 4 November shifts
  const s1 = rows[1];
  assert.equal(s1[col('Clock-in')], '09:05');
  assert.equal(s1[col('Jam kerja')], 10);
  assert.equal(s1[col('KPI downloads')], 12);
  assert.equal(s1[col('Jam normal')], 8);
  assert.equal(s1[col('Jam lembur')], 2);
  const noShow = rows[4];
  assert.equal(noShow[col('Jam normal')], 0);
  assert.equal(noShow[col('Jam lembur')], 0);
});

test('Grab export has no payroll columns', () => {
  const head = attendanceRows(base, '2026-11-01', '2026-11-30', false)[0];
  assert.equal(head.includes('Username'), false);
  assert.equal(head.includes('Jam lembur'), false);
});
