import { Buffer } from "node:buffer";
// UI smoke test of the web build against a mocked Supabase API (no real backend needed).
//   npx expo export --platform web --output-dir dist && python3 -m http.server 8765 -d dist &
//   node scripts/ui-smoke.mjs pic|grab_viewer|back_office|spg [consented|running]
// Env: BASE_URL (default http://localhost:8765/), CHROMIUM (executable path, optional), SHOTS (screenshot dir).
import { chromium } from 'playwright';
const role = process.argv[2] || 'pic';
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 31 * 3600e3).toISOString().slice(0, 10);
const ids = { super_admin: 'u-admin', pic: 'u-pic', back_office: 'u-bo', spg: 'u-spg', grab_viewer: 'u-grab', coordinator: 'u-coord' };
const me = ids[role];
const prof = (id, name, role, extra = {}) => ({ id, name, username: name.toLowerCase().replace(/ /g, '.'), role, active: true,
  city_id: null, grade: null, contract_type: null, documents_ok: false, phone_ok: false, bpjs_registered: false,
  consent_version: null, consent_at: null, photo_path: null, created_at: '2026-10-01T00:00:00Z', ...extra });
const db = {
  profiles: [
    prof('u-admin', 'Admin', 'super_admin'), prof('u-pic', 'Pic Satu', 'pic'), prof('u-bo', 'Bo Satu', 'back_office'),
    prof('u-grab', 'Grab Viewer', 'grab_viewer'),
    prof('u-spg', 'Sari Wulandari', 'spg', { city_id: 'sby', grade: 'B', contract_type: 'daily_worker', documents_ok: true, phone_ok: true, bpjs_registered: true, consent_version: process.argv[3] ? '2026-10-v1' : null }),
    prof('u-coord', 'Kordinator Sby', 'coordinator', { city_id: 'sby', grade: 'A', contract_type: 'pkwt', consent_version: '2026-10-v1' }),
    prof('u-new', 'Budi Baru', 'spg', { city_id: 'sby', grade: 'C', contract_type: 'daily_worker' }),
  ],
  cities: [{ id: 'sby', name: 'Kota Surabaya', province: 'Jawa Timur', umk: 5288796, capability: 'Strong' }, { id: 'jkt', name: 'Jakarta', province: 'DKI', umk: 5729876, capability: 'Weak' }],
  venues: [{ id: 'v1', city_id: 'sby', name: 'Tunjungan Plaza', address: 'Jl. Basuki Rahmat 8-12', lat: -7.2625, lng: 112.7389, radius_m: 150 }],
  campaigns: [{ id: 'c1', name: 'GrabFood New User', type: 'user', active: true, starts_on: today, ends_on: null,
    kpi_fields: [{ key: 'downloads', label: 'App downloads', unit: 'unduhan', proof_required: true }, { key: 'contacts', label: 'Kontak', unit: 'orang', proof_required: false }] }],
  requests: [{ id: 'r1', campaign_id: 'c1', city_id: 'sby', venue_id: 'v1', grade: 'B', headcount: 2, start_date: today, end_date: tomorrow,
    shift_hours: 10, package: 'daily', status: 'running', submitted_at: '2026-10-05T03:00:00Z', sla_hiring_due: '2026-10-12T16:59:59Z', staffed_at: null, notes: 'Seragam dari Grab' }],
  shifts: [
    { id: 's1', request_id: 'r1', venue_id: 'v1', spg_id: 'u-spg', shift_date: today, planned_start: '09:00:00', planned_end: '19:00:00', overtime_hours: 2, status: 'planned', validated_at: null, replaces_shift_id: null },
    { id: 's2', request_id: 'r1', venue_id: 'v1', spg_id: 'u-coord', shift_date: today, planned_start: '09:00:00', planned_end: '19:00:00', overtime_hours: 2, status: 'no_show', validated_at: null, replaces_shift_id: null },
  ],
  attendances: process.argv[3] === 'running' ? [{ id: 'a1', shift_id: 's1', user_id: 'u-spg', clock_in_at: new Date(Date.now() - 135 * 60e3).toISOString(), clock_in_lat: -7.2626, clock_in_lng: 112.7389, mocked: false, geo_valid: true, distance_m: 12, late_min: 0, clock_out_at: null, auto_closed: false }] : [],
  kpi_logs: process.argv[3] === 'running' ? [{ id: 'k1', shift_id: 's1', spg_id: 'u-spg', field_key: 'contacts', value: 41, proof_path: null, logged_at: new Date().toISOString() }] : [],
  exceptions: [{ id: 1, shift_id: 's2', type: 'no_show', detail: 'Tidak clock-in 30 menit setelah jam mulai', detected_at: new Date().toISOString(), status: 'open', note: '' }],
  trainings: [{ id: 't1', spg_id: 'u-spg', campaign_id: 'c1', passed_at: '2026-10-08T00:00:00Z', score: 85 }, { id: 't2', spg_id: 'u-coord', campaign_id: 'c1', passed_at: '2026-10-08T00:00:00Z', score: 90 }],
  replacements: [{ id: 'rp_s2', original_shift_id: 's2', reason: 'no_show', requested_at: new Date().toISOString(), due_at: new Date(Date.now() + 86400e3).toISOString(), filled_shift_id: null, filled_at: null }],
  daily_reports: [{ report_date: '2026-10-08', generated_at: '2026-10-08T23:00:00Z', published_at: null, totals: { planned: 3, attended: 2, no_show: 1, geo_valid: 2, open_exceptions: 1, kpi: { downloads: 34 } } }],
  profile_contacts: [{ user_id: 'u-spg', phone: '081234567890' }],
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: me, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const writes = [];
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: 420, height: 900 } });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e)));
p.on('console', (m) => { if (m.type() === 'error' && !/favicon|tile|unpkg|leaflet/i.test(m.text())) errs.push(m.text()); });
await p.route(/supabase\.co/, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname.startsWith('/auth/v1/token')) {
    return json({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r', user: { id: me, aud: 'authenticated', role: 'authenticated', email: 'x@internal.spc' } });
  }
  if (url.pathname.startsWith('/auth/v1/user')) return json({ id: me, aud: 'authenticated', role: 'authenticated' });
  if (url.pathname.startsWith('/rest/v1/rpc/')) { writes.push(`rpc ${url.pathname.split('/').pop()} ${req.postData()}`); return json(url.pathname.endsWith('live_positions') ? [{ user_id: 'u-spg', name: 'Sari Wulandari', shift_id: 's1', venue_id: 'v1', lat: -7.2627, lng: 112.739, recorded_at: new Date().toISOString() }] : null); }
  if (url.pathname.startsWith('/functions/v1/')) { writes.push(`fn ${req.postData()}`); return json({ id: 'new' }); }
  if (url.pathname.startsWith('/storage/')) return json({ signedURL: null });
  const table = url.pathname.split('/').pop();
  if (req.method() !== 'GET' && req.method() !== 'HEAD') {
    writes.push(`${req.method()} ${url.pathname.split('/').pop()}${url.search} ${req.postData()}`);
    if (req.method() === 'PATCH' && db[table]) {
      const idq = url.searchParams.get('id');
      db[table].filter((r) => !idq || r.id === idq.slice(3)).forEach((r) => Object.assign(r, JSON.parse(req.postData() || '{}')));
    }
    return route.fulfill({ status: 201, body: '' });
  }
  let rows = db[table] ?? [];
  const idf = url.searchParams.get('id');
  if (idf && idf.startsWith('eq.')) rows = rows.filter((r) => r.id === idf.slice(3));
  const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  return json(single ? rows[0] : rows);
});
const shot = async (name) => { await p.waitForTimeout(900); await p.screenshot({ path: `${process.env.SHOTS || '/tmp'}/${role}-${name}.png`, fullPage: false }); };
const click = async (text) => { await p.getByText(text, { exact: true }).first().click(); };
await p.goto(process.env.BASE_URL || 'http://localhost:8765/', { waitUntil: 'networkidle' });
await p.getByPlaceholder(/username/i).fill('demo').catch(() => {});
const inputs = p.locator('input');
await inputs.nth(0).fill('demo'); await inputs.nth(1).fill('pw12345678');
await click('Masuk');
await p.waitForTimeout(2500);
await shot('home');
if (role === 'spg' && !process.argv[3]) {
  console.log('CONSENT:', (await p.innerText('body')).replace(/\s+/g, ' ').slice(0, 300));
  await p.getByRole('button', { name: 'Saya Setuju' }).click();
  await p.waitForTimeout(1500);
}
const body = async () => (await p.innerText('body')).replace(/\s+/g, ' ').slice(0, 400);
console.log('HOME:', await body());
const tabs = { pic: ['Request', 'Peta', 'Laporan', 'Data'], grab_viewer: ['Request', 'Peta', 'Laporan'], back_office: ['Data', 'Laporan'], spg: ['Jadwal'], super_admin: ['Data'] }[role] ?? [];
for (const t of tabs) {
  await p.locator('a[role="tab"], [role="tab"], [href]').filter({ hasText: new RegExp(`^${t}$`) }).first().click({ timeout: 5000 })
    .catch(async () => p.getByText(t, { exact: true }).last().click({ timeout: 5000 }));
  await shot(t);
  console.log(`${t.toUpperCase()}:`, (await p.innerText('body')).replace(/\s+/g, ' ').slice(-700));
  if (t === 'Request') {
    await p.getByText('GrabFood New User · Kota Surabaya').first().click();
    await shot('request-detail');
    console.log('DETAIL:', (await p.innerText('body')).replace(/\s+/g, ' ').slice(400, 1300));
    if (role === 'pic') {
      await p.getByText(/^10-1\d \(0\/2\)$/).last().click();
      await p.getByText('Sari Wulandari · Grade B').last().click();
      await p.getByText(/^Jadwalkan 1 Shift$/).last().click();
      await p.waitForTimeout(1500);
      await shot('scheduled');
    }
  }
  if (t === 'Data') {
    await p.getByText(/^Sari Wulandari$/).last().click();
    await shot('spg-detail');
    console.log('SPG DETAIL:', await body());
  }
}
console.log('WRITES:', writes);
console.log('ERRORS:', errs.slice(0, 8));
await b.close();
