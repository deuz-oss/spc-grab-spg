import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, coverage, datesBetween, hiringSla, whyNot } from './roster';
import type { GrabRequest, Profile, Shift, Training } from '../types';

const req: GrabRequest = {
  id: 'r1', campaignId: 'c1', cityId: 'sby', venueId: 'v1', grade: 'B', headcount: 2,
  startDate: '2026-10-30', endDate: '2026-11-02', shiftHours: 8, package: 'daily', status: 'new',
  submittedAt: 0, slaHiringDue: 1000, staffedAt: null, notes: '',
};
const spg = (id: string, over: Partial<Profile> = {}): Profile => ({
  id, name: id, username: id, role: 'spg', cityId: 'sby', active: true, grade: 'B', contractType: 'daily_worker',
  documentsOk: true, phoneOk: true, bpjsRegistered: true, consentVersion: 'v1', consentAt: 1, photoPath: null, ...over,
});
const shift = (id: string, spgId: string, date: string, status: Shift['status'] = 'planned'): Shift => ({
  id, requestId: 'r1', venueId: 'v1', spgId, shiftDate: date, plannedStart: '09:00:00', plannedEnd: '17:00:00',
  overtimeHours: 0, status, validatedAt: null, replacesShiftId: null,
});
const trained: Training[] = [{ id: 't', spgId: 'a', campaignId: 'c1', passedAt: 0, score: 90 }];

test('dates across a month end, inclusive', () => {
  assert.deepEqual(datesBetween('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
});

test('coverage ignores cancelled and replaced shifts, counts no-shows', () => {
  const c = coverage(req, [shift('1', 'a', '2026-10-30'), shift('2', 'b', '2026-10-30', 'replaced'), shift('3', 'c', '2026-10-31', 'no_show')]);
  assert.deepEqual(c.map((d) => d.scheduled), [1, 1, 0, 0]);
  assert.equal(c[0].needed, 2);
});

test('eligibility mirrors the server: grade, training, one shift per day', () => {
  assert.equal(whyNot(spg('a'), req, '2026-10-30', trained, []), null);
  assert.equal(whyNot(spg('a', { grade: 'C' }), req, '2026-10-30', trained, []), 'grade');
  assert.equal(whyNot(spg('a', { grade: 'A' }), req, '2026-10-30', trained, []), null);
  assert.equal(whyNot(spg('x'), req, '2026-10-30', trained, []), 'training');
  assert.equal(whyNot(spg('a', { active: false }), req, '2026-10-30', trained, []), 'inactive');
  assert.equal(whyNot(spg('a', { role: 'pic' }), req, '2026-10-30', trained, []), 'not_field');
  assert.equal(whyNot(spg('a'), req, '2026-10-30', trained, [shift('1', 'a', '2026-10-30', 'no_show')]), 'busy');
  assert.equal(whyNot(spg('a'), req, '2026-10-30', trained, [shift('1', 'a', '2026-10-30', 'replaced')]), null);
});

test('candidates: request city first, then higher grade', () => {
  const list = candidates([spg('far', { cityId: 'jkt', grade: 'A' }), spg('b'), spg('a', { grade: 'A' }), spg('pic', { role: 'pic' })], req);
  assert.deepEqual(list.map((p) => p.id), ['a', 'b', 'far']);
});

test('hiring SLA states', () => {
  assert.equal(hiringSla({ slaHiringDue: 1000, staffedAt: null, status: 'new' }, 500), 'open');
  assert.equal(hiringSla({ slaHiringDue: 1000, staffedAt: null, status: 'new' }, 1500), 'breached');
  assert.equal(hiringSla({ slaHiringDue: 1000, staffedAt: 900, status: 'staffed' }, 1500), 'met');
  assert.equal(hiringSla({ slaHiringDue: 1000, staffedAt: 1200, status: 'running' }, 1500), 'missed');
});
