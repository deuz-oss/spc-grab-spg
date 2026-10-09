import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapAttendance, mapCampaign, mapShift } from './mappers';

test('attendance: server-computed fields and null clock-out', () => {
  const a = mapAttendance({
    id: 'a1', shift_id: 's1', user_id: 'u1', clock_in_at: '2026-11-02T01:00:00Z', clock_in_lat: -7.26,
    clock_in_lng: 112.74, mocked: false, geo_valid: false, distance_m: '301', late_min: 20, clock_out_at: null,
    auto_closed: false,
  });
  assert.equal(a.clockInAt, Date.parse('2026-11-02T01:00:00Z'));
  assert.equal(a.distanceM, 301);
  assert.equal(a.geoValid, false);
  assert.equal(a.clockOutAt, null);
});

test('campaign: KPI template defaults are filled', () => {
  const c = mapCampaign({ id: 'c', name: 'Food', type: 'user', active: true, kpi_fields: [{ key: 'downloads', proof_required: true }] });
  assert.deepEqual(c.kpiFields, [{ key: 'downloads', label: 'downloads', unit: '', proof_required: true }]);
});

test('shift: overtime hours come from the server row', () => {
  const s = mapShift({
    id: 's', request_id: 'r', venue_id: 'v', spg_id: 'u', shift_date: '2026-11-02', planned_start: '09:00:00',
    planned_end: '19:00:00', overtime_hours: 2, status: 'planned', validated_at: null,
  });
  assert.equal(s.overtimeHours, 2);
  assert.equal(s.validatedAt, null);
});
