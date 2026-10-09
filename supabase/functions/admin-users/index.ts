// Supabase Edge Function: account provisioning the app must never do itself (it never holds the
// service-role key). Ported from spc-nc-workforce, with the Grab roles and permissions:
//   super_admin  — any role, any account
//   back_office  — onboards field workers only (spg, coordinator): create, reset password, (de)activate
// Every call is re-checked here because this function's admin client bypasses RLS by design.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = ['super_admin', 'pic', 'back_office', 'coordinator', 'spg', 'grab_viewer'] as const;
type Role = (typeof ROLES)[number];
const FIELD_ROLES: Role[] = ['spg', 'coordinator'];
const GRADES = ['A', 'B', 'C'];
const CONTRACTS = ['daily_worker', 'pkwt'];

type CreateBody = {
  action: 'create';
  username: string;
  password: string;
  name: string;
  role: Role;
  cityId?: string | null;
  grade?: string | null;
  contractType?: string | null;
  phone?: string | null;
};
type SetPasswordBody = { action: 'setPassword'; userId: string; password: string };
type SetActiveBody = { action: 'setActive'; userId: string; active: boolean };
type Body = CreateBody | SetPasswordBody | SetActiveBody;

// Must match src/utils/password.ts.
const MIN_PASSWORD = 8;
function passwordProblem(password: string, username = ''): string | null {
  if (password.length < MIN_PASSWORD) return `Password minimal ${MIN_PASSWORD} karakter.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password harus berisi huruf dan angka.';
  const u = username.trim().toLowerCase();
  if (u && password.toLowerCase().includes(u)) return 'Password tidak boleh memuat username.';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !caller) return json({ error: 'Not authenticated' }, 401);

    const { data: me } = await admin.from('profiles').select('role, active').eq('id', caller.id).single();
    // A deactivated account's JWT stays valid until it expires — check `active` too.
    if (!me?.active || !['super_admin', 'back_office'].includes(me.role)) {
      return json({ error: 'Hanya super admin atau back office.' }, 403);
    }
    const isSuper = me.role === 'super_admin';
    const mayManage = (role: string) => isSuper || FIELD_ROLES.includes(role as Role);

    const body = (await req.json()) as Body;

    if (body.action === 'create') {
      const username = (body.username ?? '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
        return json({ error: 'Username 3–40 karakter: huruf kecil, angka, titik, garis bawah, atau strip.' }, 400);
      }
      const name = (body.name ?? '').trim();
      if (!name) return json({ error: 'Nama wajib diisi.' }, 400);
      if (!ROLES.includes(body.role)) return json({ error: `Role tidak dikenal: ${body.role}` }, 400);
      if (!mayManage(body.role)) return json({ error: 'Back office hanya bisa membuat akun SPG / koordinator.' }, 403);
      const field = FIELD_ROLES.includes(body.role);
      if (field) {
        if (!body.cityId) return json({ error: 'Kota wajib untuk SPG / koordinator.' }, 400);
        if (!body.grade || !GRADES.includes(body.grade)) return json({ error: 'Grade wajib (A/B/C).' }, 400);
        if (!body.contractType || !CONTRACTS.includes(body.contractType)) return json({ error: 'Jenis kontrak wajib.' }, 400);
      }
      const pwErr = passwordProblem(body.password ?? '', username);
      if (pwErr) return json({ error: pwErr }, 400);

      const { data, error } = await admin.auth.admin.createUser({
        email: `${username}@internal.spc`,
        password: body.password,
        email_confirm: true,
        user_metadata: { name, username },
      });
      if (error) {
        const taken = /already|registered|exists/i.test(error.message);
        return json({ error: taken ? 'Username sudah dipakai.' : error.message }, 400);
      }
      // handle_new_auth_user creates every profile INACTIVE as 'spg'; this update grants the real role.
      const { error: upErr } = await admin.from('profiles').update({
        name,
        role: body.role,
        active: true,
        city_id: body.cityId ?? null,
        grade: field ? body.grade : null,
        contract_type: field ? body.contractType : null,
      }).eq('id', data.user.id);
      if (upErr) {
        await admin.auth.admin.deleteUser(data.user.id);
        return json({ error: `Gagal mengaktifkan profil: ${upErr.message}` }, 400);
      }
      const phone = (body.phone ?? '').trim();
      if (phone) await admin.from('profile_contacts').upsert({ user_id: data.user.id, phone });
      await audit(admin, caller.id, 'user.create', data.user.id, { username, role: body.role, city_id: body.cityId ?? null });
      return json({ id: data.user.id });
    }

    if (body.action === 'setPassword' || body.action === 'setActive') {
      const { data: target } = await admin.from('profiles').select('username, role').eq('id', body.userId).single();
      if (!target) return json({ error: 'Akun tidak ditemukan.' }, 404);
      if (!mayManage(target.role)) return json({ error: 'Back office hanya bisa mengelola akun SPG / koordinator.' }, 403);

      if (body.action === 'setPassword') {
        const pwErr = passwordProblem(body.password ?? '', target.username);
        if (pwErr) return json({ error: pwErr }, 400);
        const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password });
        if (error) return json({ error: error.message }, 400);
        await audit(admin, caller.id, 'user.password_reset', body.userId, {});
        return json({ ok: true });
      }

      if (body.userId === caller.id) return json({ error: 'Tidak bisa menonaktifkan akun sendiri.' }, 400);
      const { error } = await admin.from('profiles').update({ active: !!body.active }).eq('id', body.userId);
      if (error) return json({ error: error.message }, 400);
      await audit(admin, caller.id, body.active ? 'user.activate' : 'user.deactivate', body.userId, {});
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

/** admin_audit_log: the service role cannot be attributed by triggers, so record the caller here. */
async function audit(
  // deno-lint-ignore no-explicit-any
  admin: SupabaseClient<any>,
  actorId: string,
  action: string,
  rowId: string,
  changes: Record<string, unknown>,
) {
  const { error } = await admin.from('admin_audit_log')
    .insert({ actor_id: actorId, action, table_name: 'profiles', row_id: rowId, changes });
  if (error) console.warn(`audit ${action} failed: ${error.message}`);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
