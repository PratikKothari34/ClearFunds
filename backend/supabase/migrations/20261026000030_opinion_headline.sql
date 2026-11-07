-- The year's headline is the most serious opinion ever received, and nothing
-- supersedes it (AGENTS.md rule 19, #116). An opinion from a different appointing
-- set used to govern whatever its severity, which let a clean opinion replace an
-- earlier adverse one. That exception is removed: the committee controls who is
-- appointed, and the auditor rotates by law every two years, so it would fire
-- without anyone acting in bad faith. Of two equally serious, the earlier governs.

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
           p.full_name
      from public.chain_entries c
      join public.auditor_appointments a on a.society_id = c.society_id
                                        and a.appointment_seq = (c.body->>'appointment_seq')::bigint
      join public.people p on p.id = a.person_id
     where c.society_id = p_society and c.kind = 'year_close' and c.body->>'fy' = p_fy
     order by c.sequence
  loop
    hist := hist || jsonb_build_object('seq', r.sequence, 'opinion', r.opinion, 'statement', r.statement,
      'auditor', r.full_name, 'recorded_at', r.recorded_at);
    if gov_seq is null or cf.severity(r.opinion) > cf.severity(gov_op) then
      gov_op := r.opinion;
      gov_seq := r.sequence;
    end if;
  end loop;
  return jsonb_build_object('fy', p_fy, 'closed', gov_seq is not null,
    'headline', gov_op, 'headline_seq', gov_seq, 'history', hist);
end
$$;
