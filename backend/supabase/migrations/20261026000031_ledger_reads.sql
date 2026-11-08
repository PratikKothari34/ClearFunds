-- Reading part of the ledger (#102, contracts/api/v1.md "Reading part of the
-- ledger"). Every surface wanted a bounded slice, and the view could only hand
-- over the whole history. These read the same `ledger` view, so a row here has
-- exactly the view's columns and the same running balance.
--
-- Each checks membership itself: they run as definer, and the view's own filter
-- does not apply to the definer.

-- The rows the structuring rule considers, decided once (contract: "The
-- structuring window is decided once"). api_structuring, the report and
-- api_structuring_hint all read this, so they cannot disagree about a payee.
create function cf.structuring_rows(p_society text)
returns table (seq bigint, k text, counterparty text, d date, a bigint, limit_minor bigint)
language sql stable security definer set search_path = '' as $$
  select seq, lower(btrim(counterparty)), counterparty, business_date, -amount_minor, limit_minor
    from public.ledger
   where society_id = p_society and effect = 'expense' and tier = 'pair' and reversed_by_seq is null
$$;

create or replace function public.api_structuring(p_society text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  win int;
  out jsonb;
begin
  if not cf.is_member(p_society) and coalesce(auth.role(), '') <> 'service_role' then
    perform cf.err('not a member of this society');
  end if;
  select structuring_window_days into win from public.societies where id = p_society;
  with e as (select * from cf.structuring_rows(p_society)),
  w as (
    select x.seq, x.k, array_agg(y.seq) as members
      from e x join e y on y.k = x.k and y.d > x.d - win and y.d <= x.d
     group by x.seq, x.k, x.limit_minor
    having sum(y.a) > x.limit_minor),
  m as (select distinct k, unnest(members) as seq from w),
  j as (select e.*, case when e.d - lag(e.d) over (partition by e.k order by e.d, e.seq) > win
                         then 1 else 0 end as brk
          from m join e on e.seq = m.seq),
  g as (select j.*, sum(brk) over (partition by k order by d, seq) as grp from j)
  select coalesce(jsonb_agg(row order by row->>'last_date' desc), '[]') into out from (
    select jsonb_build_object('counterparty', min(counterparty), 'total_minor', sum(a),
             'limit_minor', max(limit_minor), 'first_date', min(d), 'last_date', max(d),
             'window_days', win, 'constituents', jsonb_agg(seq order by d, seq)) as row
      from g group by k, grp) r;
  return out;
end
$$;

create function cf.require_member(p_society text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cf.is_member(p_society) then
    perform cf.err('not a member of this society');
  end if;
end
$$;

create function cf.require_limit(p_limit int, p_max int) returns void
language plpgsql immutable set search_path = '' as $$
begin
  -- Refused, never clamped: a caller must not get fewer rows than it asked
  -- for without knowing.
  if p_limit is null or p_limit < 1 or p_limit > p_max then
    perform cf.err(format('limit must be between 1 and %s', p_max));
  end if;
end
$$;

-- A page as the contract shapes it: newest first, and next_before null only on
-- the last page. Reads one row more than asked to know whether one follows.
create function cf.page(p_rows jsonb, p_limit int) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(r order by (r->>'seq')::bigint desc)
                        from (select r from jsonb_array_elements(p_rows) r
                               order by (r->>'seq')::bigint desc limit p_limit) x), '[]'),
    'next_before', case when jsonb_array_length(p_rows) > p_limit
                        then (select min((r->>'seq')::bigint) from (
                                select r from jsonb_array_elements(p_rows) r
                                 order by (r->>'seq')::bigint desc limit p_limit) y) end)
$$;

create function public.api_ledger_page(p_society text, p_before bigint default null, p_limit int default 50,
  p_filter text default 'all', p_search text default null, p_categories text[] default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(btrim(coalesce(p_search, '')));
  digits text := regexp_replace(btrim(coalesce(p_search, '')), '[,₹[:space:]]', '', 'g');
  rows jsonb;
begin
  perform cf.require_member(p_society);
  perform cf.require_limit(p_limit, 200);
  if p_filter is null or p_filter not in ('all', 'in', 'out', 'reversed', 'disputed', 'charges') then
    perform cf.err('filter is all, in, out, reversed, disputed or charges');
  end if;
  with open_flags as (
    select d.target_seqs, lower(btrim(d.counterparty)) as cp
      from public.disputes d where d.society_id = p_society and d.is_open)
  select coalesce(jsonb_agg(to_jsonb(l)), '[]') into rows from (
    select l.* from public.ledger l
     where l.society_id = p_society
       and (p_before is null or l.seq < p_before)
       and case p_filter
             when 'all' then true
             -- A row with no readable amount is in neither direction (contract).
             when 'in' then l.is_cash and l.amount_minor > 0
             when 'out' then l.is_cash and l.amount_minor < 0
             when 'reversed' then l.reversed_by_seq is not null or l.reverses_seq is not null
             when 'disputed' then exists (select 1 from open_flags f
                    where f.target_seqs @> to_jsonb(l.seq)
                       or (f.cp is not null and f.cp = lower(btrim(l.counterparty))))
             when 'charges' then not l.is_cash
           end
       and (q = ''
            or (q ~ '^#[0-9]+$' and l.seq = substr(q, 2)::bigint)
            or (q !~ '^#[0-9]+$' and (
                  strpos(lower(coalesce(l.counterparty, '')), q) > 0
               or strpos(lower(coalesce(l.narration, '')), q) > 0
               or strpos(lower(coalesce(l.reason, '')), q) > 0
               or l.category = any(coalesce(p_categories, '{}'))
               or (digits ~ '^[0-9]+$' and l.amount_minor is not null
                   and abs(l.amount_minor)::text like digits || '%'))))
     order by l.seq desc
     limit p_limit + 1) l;
  return cf.page(rows, p_limit);
end
$$;

create function public.api_flat_statement(p_society text, p_flat text, p_before bigint default null,
  p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  rows jsonb;
begin
  perform cf.require_member(p_society);
  perform cf.require_limit(p_limit, 200);
  if not exists (select 1 from public.flats where id = p_flat and society_id = p_society) then
    perform cf.err('unknown flat');
  end if;
  select coalesce(jsonb_agg(to_jsonb(l)), '[]') into rows from (
    select l.* from public.ledger l
     where l.society_id = p_society and l.flat_id = p_flat and (p_before is null or l.seq < p_before)
     order by l.seq desc limit p_limit + 1) l;
  return cf.page(rows, p_limit);
end
$$;

-- Committee and auditors see every flat; anyone else only the flats they hold
-- an open tenure on (contract). It answers the same question as flat_dues, so
-- it must not become a second door to the owing list.
create function public.api_recent_receipts(p_society text, p_per_flat int default 6) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  everyone boolean;
begin
  perform cf.require_member(p_society);
  perform cf.require_limit(p_per_flat, 24);
  everyone := cf.is_committee(p_society) or cf.is_auditor(p_society, cf.person(auth.uid(), p_society));
  -- One pass over the ledger, ranked per flat. A lateral read per flat would
  -- recompute the view's running balance once for every flat.
  return (
    with r as materialized (
      select l.flat_id, to_jsonb(l) as j, l.seq,
             row_number() over (partition by l.flat_id order by l.seq desc) as n
        from public.ledger l
       where l.society_id = p_society and l.flat_id is not null and l.origin_effect = 'receipt'),
    per as (select flat_id, jsonb_agg(j order by seq desc) as rows from r where n <= p_per_flat group by flat_id)
    select coalesce(jsonb_agg(jsonb_build_object('flat_id', f.id, 'rows', coalesce(per.rows, '[]'))
             order by f.ordinal), '[]')
      from public.flats f
      left join per on per.flat_id = f.id
     where f.society_id = p_society
       and (everyone or f.id in (select cf.my_tenure_flats())));
end
$$;

create function public.api_payees(p_society text, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform cf.require_member(p_society);
  perform cf.require_limit(p_limit, 200);
  return (select coalesce(jsonb_agg(jsonb_build_object('counterparty', counterparty, 'uses', uses)
                            order by uses desc, counterparty), '[]')
            from (select counterparty, count(*) as uses from public.ledger
                   where society_id = p_society and effect = 'expense' and reversed_by_seq is null
                     and counterparty is not null
                   group by counterparty order by count(*) desc, counterparty limit p_limit) x);
end
$$;

create function public.api_structuring_hint(p_society text, p_counterparty text, p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_end date := coalesce(p_date, cf.today());
  win int;
begin
  perform cf.require_member(p_society);
  select structuring_window_days into win from public.societies where id = p_society;
  return (select jsonb_build_object('payments', count(*), 'total_minor', coalesce(sum(r.a), 0),
                                    'window_days', win, 'since', v_end - win + 1)
            from cf.structuring_rows(p_society) r
           where r.k = lower(btrim(coalesce(p_counterparty, ''))) and r.d > v_end - win and r.d <= v_end);
end
$$;

revoke all on function cf.structuring_rows(text), cf.require_member(text), cf.require_limit(int, int),
  cf.page(jsonb, int) from public, anon, authenticated;
revoke all on function public.api_ledger_page(text, bigint, int, text, text, text[]),
  public.api_flat_statement(text, text, bigint, int), public.api_recent_receipts(text, int),
  public.api_payees(text, int), public.api_structuring_hint(text, text, date) from public, anon;
grant execute on function public.api_ledger_page(text, bigint, int, text, text, text[]),
  public.api_flat_statement(text, text, bigint, int), public.api_recent_receipts(text, int),
  public.api_payees(text, int), public.api_structuring_hint(text, text, date) to authenticated;
