-- A year's report beside the year before (#67). Both columns are api_report's
-- own figures, so the comparison cannot disagree with the report a resident
-- reads: totals come from entries posted in each year (AGENTS.md item 7), and
-- an adjusting entry counts in the year it was posted, never the year it
-- corrects.

create function cf.compare_rows(p_this jsonb, p_prev jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'this_minor', t, 'previous_minor', p,
           'change_minor', t - p) order by t desc, p desc, category), '[]')
    from (select coalesce(a.category, b.category) as category,
                 coalesce(a.amt, 0) as t, coalesce(b.amt, 0) as p
            from (select x->>'category' as category, (x->>'amount_minor')::bigint as amt
                    from jsonb_array_elements(p_this) x) a
            full join (select x->>'category' as category, (x->>'amount_minor')::bigint as amt
                         from jsonb_array_elements(p_prev) x) b on a.category = b.category) r
$$;

create function public.api_report_compare(p_society text, p_fy text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  this jsonb;
  prev jsonb;
  prev_fy text;
  t jsonb;
  p jsonb;
begin
  -- api_report checks membership and the shape of p_fy.
  this := public.api_report(p_society, p_fy);
  prev_fy := (left(p_fy, 4)::int - 1)::text || '-' || lpad((left(p_fy, 4)::int % 100)::text, 2, '0');
  prev := public.api_report(p_society, prev_fy);
  t := this->'income_expenditure';
  p := prev->'income_expenditure';
  return jsonb_build_object(
    'fy', p_fy, 'previous_fy', prev_fy, 'currency', this->'currency',
    'income', cf.compare_rows(t->'income', p->'income'),
    'expenditure', cf.compare_rows(t->'expenditure', p->'expenditure'),
    'totals', (select jsonb_object_agg(k, jsonb_build_object('this_minor', a, 'previous_minor', b, 'change_minor', a - b))
                 from (values ('income', (t->>'total_income_minor')::bigint, (p->>'total_income_minor')::bigint),
                              ('expenditure', (t->>'total_expenditure_minor')::bigint, (p->>'total_expenditure_minor')::bigint),
                              ('surplus', (t->>'surplus_minor')::bigint, (p->>'surplus_minor')::bigint)) v(k, a, b)));
end
$$;

revoke all on function cf.compare_rows(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.api_report_compare(text, text) from public, anon, authenticated;
grant execute on function public.api_report_compare(text, text) to authenticated, service_role;
