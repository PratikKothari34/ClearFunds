-- Each opinion names the appointment that authorised it (#131). The posting of
-- the appoint_auditor proposal is the society's authorisation to publish that
-- auditor's statement (#86), so a reader of the report can check it instead of
-- taking it on trust. It comes from the year_close itself, never from matching
-- a name: the same person appointed twice is two appointments.

create or replace function cf.year_opinions(p_society text, p_fy text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  gov_op text;
  gov_seq bigint;
  hist jsonb := '[]';
begin
  for r in
    select c.sequence, c.recorded_at, c.body->>'opinion' as opinion, c.body->>'statement' as statement,
           p.full_name, a.appointment_seq
      from public.chain_entries c
      join public.auditor_appointments a on a.society_id = c.society_id
                                        and a.appointment_seq = (c.body->>'appointment_seq')::bigint
      join public.people p on p.id = a.person_id
     where c.society_id = p_society and c.kind = 'year_close' and c.body->>'fy' = p_fy
     order by c.sequence
  loop
    hist := hist || jsonb_build_object('seq', r.sequence, 'opinion', r.opinion, 'statement', r.statement,
      'auditor', r.full_name, 'appointment_seq', r.appointment_seq, 'recorded_at', r.recorded_at);
    if gov_seq is null or cf.severity(r.opinion) > cf.severity(gov_op) then
      gov_op := r.opinion;
      gov_seq := r.sequence;
    end if;
  end loop;
  return jsonb_build_object('fy', p_fy, 'closed', gov_seq is not null,
    'headline', gov_op, 'headline_seq', gov_seq, 'history', hist);
end
$$;
