-- The auditor's statement sits in the year_close preimage, so its bound is in
-- bytes of UTF-8, not characters: a Devanagari character is 3 bytes (#3). It
-- was 4,000 characters, and a statement over that was refused as "required".
-- An over-long statement is refused with the limit, never truncated: the
-- chain would then attest to words the auditor did not write.
--
-- Measured after NFC, because that is what api_close_intent and api_close_year
-- chain. NFC can grow text: U+0958 (a nukta letter) is 3 bytes and decomposes
-- to 6, so measuring before it let a statement exceed the limit in the chain.

create or replace function cf.check_close(p_user uuid, p_society text, p_fy text, p_opinion text, p_statement text,
  out me uuid, out appt public.auditor_appointments, out head public.chain_entries)
language plpgsql stable security definer set search_path = '' as $$
declare
  chained int;
begin
  me := cf.require_person(p_user, p_society);
  select a.* into appt from public.auditor_appointments a
   where a.society_id = p_society and a.person_id = me and a.fy = p_fy
     and not exists (select 1 from public.chain_entries c where c.society_id = p_society
                       and c.kind = 'year_close' and (c.body->>'appointment_seq')::bigint = a.appointment_seq)
   order by a.appointment_seq desc limit 1;
  if appt.person_id is null then
    perform cf.err('only the auditor appointed for this year can close it');
  end if;
  if (cf.fy_bounds(p_society, p_fy)).ends >= cf.today() then
    perform cf.err('the financial year has not ended yet');
  end if;
  if p_opinion not in ('clean', 'qualified', 'adverse', 'disclaimer') then
    perform cf.err('opinion is clean, qualified, adverse or disclaimer');
  end if;
  if coalesce(btrim(p_statement), '') = '' then
    perform cf.err('the auditor''s statement is required');
  end if;
  chained := octet_length(normalize(btrim(p_statement), nfc));
  if chained > 16384 then
    perform cf.err(format('the auditor''s statement is %s bytes; the limit is 16,384 bytes of UTF-8', chained));
  end if;
  select * into head from public.chain_entries where society_id = p_society order by sequence desc limit 1;
end
$$;
