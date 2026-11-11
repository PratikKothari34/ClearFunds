-- api_years listed financial years from the society's first posting. A year
-- with no postings here but an appointed auditor (a society that opens
-- mid-year and has its previous year audited, or one that has not posted yet)
-- was left out, so its auditor had no year to open and its opinion appeared on
-- no screen, though the opinion was in the chain (#138).
--
-- The list now starts at the earliest of: the first posting, the year of any
-- auditor appointment, and today. Nothing else changes.

create or replace function public.api_years(p_society text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  first_date date;
  y date;
  out jsonb := '[]';
  v_fy text;
begin
  if not cf.is_member(p_society) and coalesce(auth.role(), '') <> 'service_role' then
    perform cf.err('not a member of this society');
  end if;
  select least(
           (select min(business_date) from public.ledger where society_id = p_society),
           (select min((cf.fy_bounds(p_society, a.fy)).starts) from public.auditor_appointments a
             where a.society_id = p_society),
           cf.today())
    into first_date;
  y := (cf.fy_bounds(p_society, cf.fy_of(p_society, first_date))).starts;
  while y <= cf.today() loop
    v_fy := cf.fy_of(p_society, y);
    out := out || (cf.year_opinions(p_society, v_fy) || jsonb_build_object(
      'starts', (cf.fy_bounds(p_society, v_fy)).starts, 'ends', (cf.fy_bounds(p_society, v_fy)).ends,
      'ended', (cf.fy_bounds(p_society, v_fy)).ends < cf.today(),
      'auditor', (select jsonb_agg(jsonb_build_object('name', p.full_name, 'appointment_seq', a.appointment_seq))
                    from public.auditor_appointments a join public.people p on p.id = a.person_id
                   where a.society_id = p_society and a.fy = v_fy)));
    y := (y + interval '1 year')::date;
  end loop;
  return out;
end
$$;
