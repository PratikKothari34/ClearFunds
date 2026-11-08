-- What a flat owes is the most socially loaded figure in the product: a
-- resident behind on maintenance is identifiable by flat number to everyone
-- in the building (#6 item 6). A committee seat reads every flat; anyone else
-- reads only the flats they hold an open tenure on, owner or tenant.
-- api_summary and the reminders run as definer, so their totals still cover
-- every flat.

-- Set-returning, for the view's WHERE: evaluated once per query.
create function cf.my_tenure_flats() returns setof text
language sql stable security definer set search_path = '' as $$
  select t.flat_id from public.tenures t
    join public.people p on p.id = t.person_id
   where p.auth_user_id = auth.uid()
     and t.starts_on <= cf.today() and (t.ends_on is null or t.ends_on >= cf.today())
$$;
revoke all on function cf.my_tenure_flats() from public, anon;
grant execute on function cf.my_tenure_flats() to authenticated;

create or replace view public.flat_dues as
with lines as (
  select l.society_id, ids.v #>> '{}' as flat_id, (amt.v #>> '{}')::bigint as amount
    from public.ledger l
    join public.chain_entries pr on pr.society_id = l.society_id and pr.sequence = l.proposal_seq
    cross join lateral jsonb_array_elements(pr.body->'flat_ids') with ordinality ids(v, o)
    join lateral jsonb_array_elements(pr.body->'line_amounts') with ordinality amt(v, o2) on amt.o2 = ids.o
   where l.effect in ('charge', 'charge_reversal')),
paid as (
  select society_id, flat_id, sum(amount_minor) as amount
    from public.ledger
   where flat_id is not null and origin_effect = 'receipt'
   group by society_id, flat_id)
select f.society_id, f.id as flat_id, f.label, f.ordinal, f.has_parking,
       coalesce((select sum(amount) from lines where lines.flat_id = f.id), 0)::bigint as charged_minor,
       coalesce(p.amount, 0)::bigint as paid_minor,
       (coalesce((select sum(amount) from lines where lines.flat_id = f.id), 0) - coalesce(p.amount, 0))::bigint
         as outstanding_minor
  from public.flats f
  left join paid p on p.society_id = f.society_id and p.flat_id = f.id
 where (f.society_id in (select cf.my_committee_societies())
        or f.id in (select cf.my_tenure_flats())
        or current_user in ('postgres', 'service_role'));
