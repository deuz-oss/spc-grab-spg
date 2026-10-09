/** Database rows (snake_case, ISO timestamps) → app model (camelCase, epoch ms). Pure. */
import type {
  Attendance, Campaign, City, GrabRequest, KpiField, KpiLog, Profile, Shift, ShiftException, Venue,
} from '../types';

type Row = Record<string, unknown>;
const ms = (v: unknown): number | null => (v == null ? null : Date.parse(String(v)));
const num = (v: unknown): number | null => (v == null ? null : Number(v));

export function mapProfile(r: Row): Profile {
  return {
    id: String(r.id), name: String(r.name), username: String(r.username), role: r.role as Profile['role'],
    cityId: (r.city_id as string | null) ?? null, active: Boolean(r.active),
    grade: (r.grade as Profile['grade']) ?? null, contractType: (r.contract_type as Profile['contractType']) ?? null,
  };
}

export const mapCity = (r: Row): City => ({
  id: String(r.id), name: String(r.name), province: String(r.province), capability: r.capability as City['capability'],
});

export const mapVenue = (r: Row): Venue => ({
  id: String(r.id), cityId: String(r.city_id), name: String(r.name), address: String(r.address ?? ''),
  lat: Number(r.lat), lng: Number(r.lng), radiusM: Number(r.radius_m),
});

export function mapCampaign(r: Row): Campaign {
  const fields = Array.isArray(r.kpi_fields) ? (r.kpi_fields as KpiField[]) : [];
  return {
    id: String(r.id), name: String(r.name), type: r.type as Campaign['type'], active: Boolean(r.active),
    kpiFields: fields.map((f) => ({ key: f.key, label: f.label ?? f.key, unit: f.unit ?? '', proof_required: !!f.proof_required })),
  };
}

export const mapRequest = (r: Row): GrabRequest => ({
  id: String(r.id), campaignId: String(r.campaign_id), cityId: String(r.city_id), venueId: String(r.venue_id),
  grade: r.grade as GrabRequest['grade'], headcount: Number(r.headcount), startDate: String(r.start_date),
  endDate: String(r.end_date), shiftHours: Number(r.shift_hours) as 8 | 10, package: r.package as GrabRequest['package'],
  status: r.status as GrabRequest['status'], submittedAt: ms(r.submitted_at) ?? 0, slaHiringDue: ms(r.sla_hiring_due),
});

export const mapShift = (r: Row): Shift => ({
  id: String(r.id), requestId: String(r.request_id), venueId: String(r.venue_id), spgId: String(r.spg_id),
  shiftDate: String(r.shift_date), plannedStart: String(r.planned_start), plannedEnd: String(r.planned_end),
  overtimeHours: Number(r.overtime_hours ?? 0), status: r.status as Shift['status'], validatedAt: ms(r.validated_at),
});

export const mapAttendance = (r: Row): Omit<Attendance, 'route'> & { route: Attendance['route'] } => ({
  id: String(r.id), shiftId: String(r.shift_id), userId: String(r.user_id), clockInAt: ms(r.clock_in_at) ?? 0,
  clockInLat: Number(r.clock_in_lat), clockInLng: Number(r.clock_in_lng), mocked: Boolean(r.mocked),
  geoValid: r.geo_valid == null ? null : Boolean(r.geo_valid), distanceM: num(r.distance_m), lateMin: num(r.late_min),
  clockOutAt: ms(r.clock_out_at), autoClosed: Boolean(r.auto_closed), route: [],
});

export const mapKpi = (r: Row): KpiLog => ({
  id: String(r.id), shiftId: String(r.shift_id), spgId: String(r.spg_id), fieldKey: String(r.field_key),
  value: Number(r.value), proofPath: (r.proof_path as string | null) ?? null, loggedAt: ms(r.logged_at) ?? 0,
});

export const mapException = (r: Row): ShiftException => ({
  id: Number(r.id), shiftId: String(r.shift_id), type: r.type as ShiftException['type'], detail: String(r.detail ?? ''),
  detectedAt: ms(r.detected_at) ?? 0, status: r.status as ShiftException['status'], note: String(r.note ?? ''),
});
