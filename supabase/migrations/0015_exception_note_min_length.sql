-- Closing an exception needs a note of at least 10 characters (phone test 20 Oct 2026, bug B7).
-- The note is the audit trail behind a billed shift — e.g. why a short shift is still invoiced to Grab — and
-- the PIC closed three exceptions with "ada". resolve_exception only refused an empty note. Approved 20 Oct:
-- at least 10 characters after trimming. Same function as 0010 otherwise (the min-length check comes before
-- the "already closed" check, as the empty-note check did).

create or replace function public.exception_note_min_length() returns int
language sql immutable set search_path = public as $$ select 10 $$;
revoke execute on function public.exception_note_min_length() from public, anon;

create or replace function public.resolve_exception(p_id bigint, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ops() then raise exception 'Hanya PIC yang bisa menyelesaikan exception.'; end if;
  if p_status not in ('resolved','waived') then raise exception 'Status tidak valid.'; end if;
  if length(coalesce(trim(p_note), '')) < public.exception_note_min_length() then
    raise exception 'Catatan wajib diisi, minimal % karakter: apa yang dicek dan hasilnya.', public.exception_note_min_length();
  end if;
  update public.exceptions set status = p_status, note = trim(p_note), resolved_by = auth.uid(), resolved_at = now()
   where id = p_id and status = 'open';
  if not found then raise exception 'Exception ini sudah ditutup (mungkin oleh PIC lain) atau tidak ditemukan.'; end if;
end;
$$;
revoke execute on function public.resolve_exception(bigint, text, text) from public, anon;
