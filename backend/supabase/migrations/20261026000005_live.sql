-- What a charge would do, before anyone proposes it: computed by the same
-- allocation the proposal will store, so the preview cannot disagree.
create function public.api_preview_charge(p_society text, p_flat_set text, p_total bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  a record;
begin
  if not cf.is_committee(p_society) then
    perform cf.err('only the committee can raise a charge');
  end if;
  if p_total is null or p_total <= 0 then
    return null;
  end if;
  a := cf.allocate(p_society, p_flat_set, p_total, cf.today());
  return jsonb_build_object(
    'flats', jsonb_array_length(a.flat_ids),
    'base_minor', (select min(v::bigint) from jsonb_array_elements_text(a.line_amounts) v),
    'extra_flats', jsonb_array_length(a.remainder_flats),
    'remainder_labels', (select coalesce(jsonb_agg(f.label order by f.ordinal), '[]')
                           from public.flats f where f.id in (select jsonb_array_elements_text(a.remainder_flats))));
end
$$;
revoke all on function public.api_preview_charge(text, text, bigint) from public, anon;
grant execute on function public.api_preview_charge(text, text, bigint) to authenticated;

-- New entries reach open screens as they are appended. Realtime applies the
-- same RLS as a select, so a client hears only its own society.
alter publication supabase_realtime add table public.chain_entries;

-- Every total a dashboard shows, summed here so the client renders figures
-- and never adds money itself.
create function public.api_summary(p_society text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  fy text;
  b record;
begin
  if not cf.is_member(p_society) then
    perform cf.err('not a member of this society');
  end if;
  fy := cf.fy_of(p_society, cf.today());
  b := cf.fy_bounds(p_society, fy);
  return jsonb_build_object(
    'balance_minor', coalesce((select balance_minor from public.ledger where society_id = p_society
                                 order by seq desc limit 1), 0),
    'entries', (select count(*) from public.ledger where society_id = p_society),
    'head_seq', (select max(sequence) from public.chain_entries where society_id = p_society),
    'as_of', (select max(recorded_at) from public.chain_entries where society_id = p_society),
    'fy', fy,
    'months', (select coalesce(jsonb_agg(m order by m->>'month' desc), '[]') from (
      select jsonb_build_object('month', to_char(business_date, 'YYYY-MM'),
               'in_minor', coalesce(sum(amount_minor) filter (where is_cash and amount_minor > 0), 0),
               'out_minor', coalesce(-sum(amount_minor) filter (where is_cash and amount_minor < 0), 0),
               'charged_minor', coalesce(sum(amount_minor) filter (where origin_effect = 'charge'), 0),
               'entries', count(*)) as m
        from public.ledger where society_id = p_society
       group by to_char(business_date, 'YYYY-MM')) x),
    'fy_spend', (select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount_minor', amt)
                   order by amt desc), '[]') from (
      select category, (-sum(amount_minor))::bigint as amt from public.ledger
       where society_id = p_society and origin_effect = 'expense' and business_date between b.starts and b.ends
       group by category having sum(amount_minor) <> 0) y),
    'fy_spend_total_minor', (select coalesce(-sum(amount_minor), 0) from public.ledger
       where society_id = p_society and origin_effect = 'expense' and business_date between b.starts and b.ends),
    'outstanding_minor', (select coalesce(sum(outstanding_minor) filter (where outstanding_minor > 0), 0)
                            from public.flat_dues where society_id = p_society),
    'flats_outstanding', (select count(*) filter (where outstanding_minor > 0) from public.flat_dues
                            where society_id = p_society),
    'flats', (select count(*) from public.flats where society_id = p_society));
end
$$;
revoke all on function public.api_summary(text) from public, anon;
grant execute on function public.api_summary(text) to authenticated;
