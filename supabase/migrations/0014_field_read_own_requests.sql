-- SPG and coordinators read the requests they have a shift on (phone test 18 Oct 2026, bug B6).
-- requests_read allowed monitoring roles only. The app finds a shift's campaign through its request
-- (shift -> request -> campaign), so for an SPG the campaign was never found: no "KPI shift ini" card and
-- no KPI could be logged at all. This adds a second read policy (policies are OR'ed; requests_read is
-- unchanged): a field user sees exactly the requests behind their own shifts — campaign, venue, grade,
-- headcount, dates, package, notes and the hiring SLA — and no other request. Approved 18 Oct: request
-- notes become visible to the SPG on that request, so the PIC keeps internal remarks out of them.
-- No recursion: the shifts policy goes through shift_visible() (security definer), not through requests.

create policy requests_read_own_shift on public.requests for select using (
  exists (select 1 from public.shifts s where s.request_id = requests.id and s.spg_id = (select auth.uid()))
);
