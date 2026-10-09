-- Spec data model: "KPI fields fixed once the first log exists". New fields may be added later;
-- an existing field cannot be removed or have its proof rule changed once SPG have logged against it.
create or replace function public.campaigns_lock_kpi() returns trigger
language plpgsql security definer set search_path = public as $$
declare f jsonb;
begin
  if new.kpi_fields is not distinct from old.kpi_fields then return new; end if;
  if not exists (select 1 from public.kpi_logs k join public.shifts s on s.id = k.shift_id
                   join public.requests r on r.id = s.request_id where r.campaign_id = old.id) then
    return new;
  end if;
  for f in select * from jsonb_array_elements(old.kpi_fields) loop
    if not exists (select 1 from jsonb_array_elements(new.kpi_fields) n
                    where n->>'key' = f->>'key'
                      and coalesce((n->>'proof_required')::boolean, false) = coalesce((f->>'proof_required')::boolean, false)) then
      raise exception 'KPI "%" sudah dipakai SPG dan tidak bisa diubah.', f->>'label';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.campaigns_lock_kpi() from public, anon, authenticated;
create trigger campaigns_lock_kpi before update of kpi_fields on public.campaigns
  for each row execute function public.campaigns_lock_kpi();
