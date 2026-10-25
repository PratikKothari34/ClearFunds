-- Read models and reports. Everything a screen shows is derived from the
-- chain here, server-side (AGENTS.md item 3); the client renders and never
-- does money arithmetic.

-- ---------------------------------------------------------------- ledger

-- The read views run as their owner and filter membership themselves.
-- Under security_invoker, row-level security re-applies inside every join
-- and blocks the JSON expression indexes (1.1 s for the proposals view at
-- 4,000 entries, against 20 ms). Each view's outermost WHERE carries the
-- same membership rule the table policies do. current_user is postgres
-- inside SECURITY DEFINER functions, which check membership themselves.

create index chain_entries_target on public.chain_entries (society_id, ((body->>'target_seq')::bigint))
  where kind = 'proposal';

-- One row per money posting. Reversed entries stay, marked; a reversal and
-- its original net to zero by construction because the reversal carries the
-- negated amount.
create view public.ledger as
select po.society_id,
       po.sequence as seq,
       po.recorded_at,
       encode(po.entry_hash, 'hex') as fingerprint,
       po.body->>'effect' as effect,
       coalesce(tg.body->>'effect', po.body->>'effect') as origin_effect,
       (po.body->>'amount_minor')::bigint as amount_minor,
       po.body->>'currency' as currency,
       pr.sequence as proposal_seq,
       pr.body->>'action' as action,
       pr.actor as proposed_by,
       pr.body->>'counterparty' as counterparty,
       pr.body->>'category' as category,
       pr.body->>'narration' as narration,
       (pr.body->>'business_date')::date as business_date,
       pr.body->>'flat_id' as flat_id,
       pr.body->>'flat_set' as flat_set,
       pr.body->>'tier' as tier,
       (pr.body->>'required')::int as required,
       (pr.body->>'limit_minor')::bigint as limit_minor,
       case when po.body->>'effect' in ('reversal', 'charge_reversal')
            then (pr.body->>'target_seq')::bigint end as reverses_seq,
       case when pr.body->>'action' = 'reversal' and po.body->>'effect' in ('expense', 'receipt')
            then (pr.body->>'target_seq')::bigint end as replaces_seq,
       pr.body->>'reason' as reason,
       rv.sequence as reversed_by_seq,
       po.body->>'effect' in ('expense', 'receipt', 'reversal') as is_cash,
       sum(case when po.body->>'effect' in ('expense', 'receipt', 'reversal')
                then (po.body->>'amount_minor')::bigint else 0 end)
         over (partition by po.society_id order by po.sequence) as balance_minor
  from public.chain_entries po
  join public.chain_entries pr on pr.society_id = po.society_id
                              and pr.sequence = (po.body->>'proposal_seq')::bigint
  left join public.chain_entries tg on po.body->>'effect' in ('reversal', 'charge_reversal')
                                   and tg.society_id = po.society_id
                                   and tg.sequence = (pr.body->>'target_seq')::bigint
  left join lateral (
    select r.sequence from public.chain_entries rp
      join public.chain_entries r on r.society_id = rp.society_id and r.kind = 'posting'
                                 and (r.body->>'proposal_seq')::bigint = rp.sequence
                                 and r.body->>'effect' in ('reversal', 'charge_reversal')
     where rp.society_id = po.society_id and rp.kind = 'proposal'
       and (rp.body->>'target_seq')::bigint = po.sequence
     limit 1) rv on true
 where po.kind = 'posting'
   and po.body->>'effect' in ('expense', 'receipt', 'charge', 'reversal', 'charge_reversal')
   and (po.society_id in (select cf.my_societies()) or current_user in ('postgres', 'service_role'));

-- ---------------------------------------------------------------- proposals

create view public.proposals as
select pr.society_id,
       pr.sequence as seq,
       pr.recorded_at,
       pr.actor as proposed_by,
       pr.body->>'action' as action,
       (pr.body->>'amount_minor')::bigint as amount_minor,
       pr.body->>'currency' as currency,
       pr.body->>'counterparty' as counterparty,
       pr.body->>'category' as category,
       pr.body->>'narration' as narration,
       (pr.body->>'business_date')::date as business_date,
       pr.body->>'flat_id' as flat_id,
       (pr.body->>'target_seq')::bigint as target_seq,
       pr.body->>'reason' as reason,
       (pr.body->>'replacement_amount_minor')::bigint as replacement_amount_minor,
       (pr.body->>'person')::uuid as person,
       pr.body->>'role' as role,
       pr.body->>'fy' as fy,
       pr.body->>'flat_set' as flat_set,
       jsonb_array_length(pr.body->'flat_ids') as flat_count,
       pr.body->>'tier' as tier,
       (pr.body->>'required')::int as required,
       (pr.body->>'seated')::int as seated,
       (pr.body->>'limit_minor')::bigint as limit_minor,
       coalesce(po.posted_seq::text, cl.outcome, 'open') as status,
       case when po.posted_seq is not null then 'posted' else coalesce(cl.outcome, 'open') end as state,
       po.posted_seq,
       coalesce(ap.list, '[]') as approvals,
       coalesce(ap.approve, 0) as approve_count,
       coalesce(ap.decline, 0) as decline_count
  from public.chain_entries pr
  left join lateral (
    select min(sequence) as posted_seq from public.chain_entries
     where society_id = pr.society_id and kind = 'posting'
       and (body->>'proposal_seq')::bigint = pr.sequence) po on true
  left join lateral (
    select body->>'outcome' as outcome from public.chain_entries
     where society_id = pr.society_id and kind = 'proposal_closed'
       and (body->>'proposal_seq')::bigint = pr.sequence limit 1) cl on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('seq', a.sequence, 'person', a.actor,
             'decision', a.body->>'decision', 'role', a.body->>'role',
             'derived', (a.body->>'derived')::boolean, 'recorded_at', a.recorded_at,
             'signature', a.body->>'signature', 'key_seq', (a.body->>'key_seq')::bigint)
             order by a.sequence) as list,
           count(*) filter (where a.body->>'decision' = 'approve')::int as approve,
           count(*) filter (where a.body->>'decision' = 'decline')::int as decline
      from public.chain_entries a
     where a.society_id = pr.society_id and a.kind = 'approval'
       and (a.body->>'proposal_seq')::bigint = pr.sequence) ap on true
 where pr.kind = 'proposal'
   and (pr.society_id in (select cf.my_societies()) or current_user in ('postgres', 'service_role'));

-- ---------------------------------------------------------------- disputes

create view public.disputes as
select f.society_id,
       f.sequence as seq,
       f.recorded_at,
       f.actor as handle,
       f.body->>'scope' as scope,
       f.body->'target_seqs' as target_seqs,
       f.body->>'counterparty' as counterparty,
       f.body->>'period' as period,
       f.body->>'text' as text,
       not exists (select 1 from public.chain_entries n
                    where n.society_id = f.society_id and n.kind = 'flag_note'
                      and (n.body->>'flag_seq')::bigint = f.sequence and n.actor = f.actor
                      and n.body->>'note' in ('resolved', 'raised_in_error')) as is_open,
       coalesce((select jsonb_agg(jsonb_build_object('seq', n.sequence, 'note', n.body->>'note',
                  'text', n.body->>'text', 'by', n.actor, 'by_author', n.actor = f.actor,
                  'recorded_at', n.recorded_at) order by n.sequence)
                   from public.chain_entries n
                  where n.society_id = f.society_id and n.kind = 'flag_note'
                    and (n.body->>'flag_seq')::bigint = f.sequence), '[]') as notes
  from public.chain_entries f
 where f.kind = 'flag'
   and (f.society_id in (select cf.my_societies()) or current_user in ('postgres', 'service_role'));

-- ---------------------------------------------------------------- dues

-- Charged minus paid, per flat. A charge's lines are the stored allocation;
-- a charge reversal's lines are those lines negated.
create view public.flat_dues as
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
 where (f.society_id in (select cf.my_societies()) or current_user in ('postgres', 'service_role'));

-- ---------------------------------------------------------------- mismatch

-- A chain-fingerprint mismatch concerns the whole ledger, so it is its own
-- object. One open report per resident, updated rather than duplicated.
create table public.mismatch_reports (
  id bigint generated always as identity primary key,
  society_id text not null references public.societies,
  handle text not null,
  anchor_hash text,
  anchor_seq bigint,
  served_hash text,
  note text,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index mismatch_one_per_resident on public.mismatch_reports (society_id, handle);
alter table public.mismatch_reports enable row level security;
create policy members_read on public.mismatch_reports for select to authenticated
  using (society_id in (select cf.my_societies()));
grant select on public.mismatch_reports to authenticated;

create function public.api_report_mismatch(p_society text, p_anchor_hash text, p_anchor_seq bigint,
  p_served_hash text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tenures := cf.open_tenure(p_society, cf.require_person(auth.uid(), p_society));
begin
  if t.id is null then
    perform cf.err('only a resident can report a mismatch');
  end if;
  insert into public.mismatch_reports (society_id, handle, anchor_hash, anchor_seq, served_hash, note)
  values (p_society, t.handle, p_anchor_hash, p_anchor_seq, p_served_hash, left(p_note, 1000))
  on conflict (society_id, handle) do update
    set anchor_hash = excluded.anchor_hash, anchor_seq = excluded.anchor_seq,
        served_hash = excluded.served_hash, note = excluded.note, updated_at = now();
end
$$;

-- ---------------------------------------------------------------- structuring

-- Below-limit expenses to the same payee whose total within the rolling
-- window crosses the limit are shown as ONE aggregate, constituents listed.
-- Not blocked (AGENTS.md item 6). Keyed on payee; the window is the
-- society's structuring_window_days. Both are open questions in GOALS.md.
create function public.api_structuring(p_society text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  win int;
  out jsonb;
begin
  if not cf.is_member(p_society) and coalesce(auth.role(), '') <> 'service_role' then
    perform cf.err('not a member of this society');
  end if;
  select structuring_window_days into win from public.societies where id = p_society;
  with e as (
    select seq, lower(btrim(counterparty)) as k, counterparty, business_date as d,
           -amount_minor as a, limit_minor
      from public.ledger
     where society_id = p_society and effect = 'expense' and tier = 'pair' and reversed_by_seq is null),
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

-- ---------------------------------------------------------------- opinions

create function cf.severity(o text) returns int language sql immutable as $$
  select case o when 'clean' then 0 when 'qualified' then 1 when 'adverse' then 2
                when 'disclaimer' then 3 end
$$;

-- The year's headline: the most serious opinion ever received, except that
-- an opinion from an auditor appointed by a different admin set governs
-- over an earlier one. "Different" is read strictly as disjoint, so a
-- committee cannot bury an adverse opinion by changing one member and
-- appointing a friendlier auditor.
create function cf.year_opinions(p_society text, p_fy text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  gov_set uuid[];
  gov_op text;
  gov_seq bigint;
  hist jsonb := '[]';
begin
  for r in
    select c.sequence, c.recorded_at, c.body->>'opinion' as opinion, c.body->>'statement' as statement,
           a.appointing_set, p.full_name
      from public.chain_entries c
      join public.auditor_appointments a on a.society_id = c.society_id
                                        and a.appointment_seq = (c.body->>'appointment_seq')::bigint
      join public.people p on p.id = a.person_id
     where c.society_id = p_society and c.kind = 'year_close' and c.body->>'fy' = p_fy
     order by c.sequence
  loop
    hist := hist || jsonb_build_object('seq', r.sequence, 'opinion', r.opinion, 'statement', r.statement,
      'auditor', r.full_name, 'recorded_at', r.recorded_at);
    if gov_seq is null or not (gov_set && r.appointing_set)
       or cf.severity(r.opinion) > cf.severity(gov_op) then
      gov_set := r.appointing_set;
      gov_op := r.opinion;
      gov_seq := r.sequence;
    end if;
  end loop;
  return jsonb_build_object('fy', p_fy, 'closed', gov_seq is not null,
    'headline', gov_op, 'headline_seq', gov_seq, 'history', hist);
end
$$;

create function public.api_years(p_society text) returns jsonb
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
  select coalesce(min(business_date), cf.today()) into first_date from public.ledger where society_id = p_society;
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

-- ---------------------------------------------------------------- reports

-- The annual report: income and expenditure, balance sheet, every reversal,
-- every adjusting entry against a closed year (generated, so it cannot be
-- left out), structuring aggregates and the auditor's opinions.
create function public.api_report(p_society text, p_fy text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  b record;
  soc public.societies;
  head public.chain_entries;
  inc jsonb;
  exp jsonb;
  ti bigint;
  te bigint;
  cash bigint;
  recv bigint;
  open_fund bigint;
begin
  if not cf.is_member(p_society) and coalesce(auth.role(), '') <> 'service_role' then
    perform cf.err('not a member of this society');
  end if;
  if p_fy !~ '^[0-9]{4}-[0-9]{2}$' then
    perform cf.err('financial year must look like 2025-26');
  end if;
  select * into soc from public.societies where id = p_society;
  b := cf.fy_bounds(p_society, p_fy);
  select * into head from public.chain_entries where society_id = p_society order by sequence desc limit 1;

  -- Per-period totals come from entries POSTED in the period (item 7).
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount_minor', amt) order by amt desc), '[]'),
         coalesce(sum(amt), 0)
    into inc, ti
    from (select category, sum(amount_minor)::bigint as amt from public.ledger
           where society_id = p_society and business_date between b.starts and b.ends
             and (origin_effect = 'charge' or (origin_effect = 'receipt' and flat_id is null))
           group by category) x;
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'amount_minor', amt) order by amt desc), '[]'),
         coalesce(sum(amt), 0)
    into exp, te
    from (select category, (-sum(amount_minor))::bigint as amt from public.ledger
           where society_id = p_society and business_date between b.starts and b.ends
             and origin_effect = 'expense'
           group by category) x;

  select coalesce(sum(amount_minor) filter (where is_cash), 0),
         coalesce(sum(amount_minor) filter (where origin_effect = 'charge'), 0)
           - coalesce(sum(amount_minor) filter (where origin_effect = 'receipt' and flat_id is not null), 0)
    into cash, recv
    from public.ledger where society_id = p_society and business_date <= b.ends;
  select coalesce(sum(case when origin_effect = 'expense' then amount_minor
                           when origin_effect = 'charge' then amount_minor
                           when origin_effect = 'receipt' and flat_id is null then amount_minor
                           else 0 end), 0)
    into open_fund
    from public.ledger where society_id = p_society and business_date < b.starts;

  return jsonb_build_object(
    'society', jsonb_build_object('id', soc.id, 'name', soc.name, 'city', soc.city),
    'fy', p_fy, 'starts', b.starts, 'ends', b.ends, 'currency', soc.currency,
    'generated_at', floor(extract(epoch from clock_timestamp()) * 1000),
    'through_seq', head.sequence, 'through_hash', encode(head.entry_hash, 'hex'),
    'true_and_fair', format('These statements are generated by the server from the society''s chained '
      'ledger, through entry %s. They are intended to give a true and fair view of the state of '
      'affairs of %s as at %s and of its income and expenditure for the year then ended.',
      head.sequence, soc.name, to_char(b.ends, 'FMDD Mon YYYY')),
    'income_expenditure', jsonb_build_object('income', inc, 'expenditure', exp,
      'total_income_minor', ti, 'total_expenditure_minor', te, 'surplus_minor', ti - te),
    'balance_sheet', jsonb_build_object(
      'cash_and_bank_minor', cash,
      'dues_receivable_minor', greatest(recv, 0),
      'advances_from_members_minor', greatest(-recv, 0),
      'opening_fund_minor', open_fund,
      'surplus_minor', ti - te,
      'closing_fund_minor', open_fund + ti - te,
      'total_assets_minor', cash + greatest(recv, 0),
      'total_funds_and_liabilities_minor', open_fund + ti - te + greatest(-recv, 0)),
    'reversals', (select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'reverses_seq', reverses_seq,
        'amount_minor', amount_minor, 'counterparty', counterparty, 'reason', reason,
        'business_date', business_date) order by seq), '[]')
      from public.ledger where society_id = p_society and reverses_seq is not null
        and business_date between b.starts and b.ends),
    'adjusting_entries', (select coalesce(jsonb_agg(jsonb_build_object('seq', x.seq,
        'reverses_seq', x.reverses_seq, 'corrects_fy', x.fy, 'amount_minor', x.amount_minor,
        'reason', x.reason, 'counterparty', x.counterparty) order by x.seq), '[]')
      from (
        -- The reversed entry's own date, read from its proposal in the chain
        -- rather than by joining the ledger view to itself.
        select l.seq, l.reverses_seq, l.amount_minor, l.reason, l.counterparty,
               cf.fy_of(p_society, (tpr.body->>'business_date')::date) as fy
          from public.ledger l
          join public.chain_entries tp on tp.society_id = l.society_id and tp.sequence = l.reverses_seq
          join public.chain_entries tpr on tpr.society_id = tp.society_id
                                       and tpr.sequence = (tp.body->>'proposal_seq')::bigint
         where l.society_id = p_society and l.reverses_seq is not null
           and l.business_date between b.starts and b.ends) x
      where x.fy <> p_fy and cf.fy_closed(p_society, x.fy)),
    'structuring', (select coalesce(jsonb_agg(s), '[]') from jsonb_array_elements(public.api_structuring(p_society)) s
      where (s->>'last_date')::date between b.starts and b.ends),
    'opinions', cf.year_opinions(p_society, p_fy),
    'signoffs', (select coalesce(jsonb_agg(jsonb_build_object('month', body->>'month', 'seq', sequence,
        'through_seq', (body->>'through_seq')::bigint, 'recorded_at', recorded_at) order by body->>'month'), '[]')
      from public.chain_entries where society_id = p_society and kind = 'month_signoff'
        and (body->>'month' || '-01')::date between b.starts and b.ends));
end
$$;

-- ---------------------------------------------------------------- registry

-- The society opens with its elected committee. Founding seats are not
-- derived: they come from the statutory election, not the exemption.
create function public.api_open_society(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  sid text := coalesce(p->>'id', 'soc_' || substr(md5(gen_random_uuid()::text), 1, 8));
  c jsonb;
  pid uuid;
  ids jsonb := '[]';
  roles jsonb := '[]';
  rec public.chain_entries;
begin
  insert into public.societies (id, name, city, currency, fy_start_month)
    values (sid, p->>'name', p->>'city', coalesce(p->>'currency', 'INR'),
            coalesce((p->>'fy_start_month')::int, 4));
  insert into private.society_secrets (society_id) values (sid);
  for c in select value from jsonb_array_elements(p->'committee') loop
    insert into public.people (society_id, full_name, email, phone)
      values (sid, c->>'name', lower(c->>'email'), c->>'phone')
      on conflict (society_id, email) do update set full_name = excluded.full_name
      returning id into pid;
    ids := ids || to_jsonb(pid::text);
    roles := roles || to_jsonb(coalesce(c->>'role', 'member'));
  end loop;
  rec := cf.append(sid, 'society_opened', null, jsonb_build_object(
    'name', p->>'name', 'currency', coalesce(p->>'currency', 'INR'),
    'fy_start_month', coalesce((p->>'fy_start_month')::int, 4),
    'approval_limit_minor', coalesce((p->>'approval_limit_minor')::bigint, 0),
    'committee', ids, 'roles', roles));
  insert into public.committee_seats (society_id, person_id, role, seated_seq)
    select sid, (i.v #>> '{}')::uuid, r.v #>> '{}', rec.sequence
      from jsonb_array_elements(ids) with ordinality i(v, o)
      join jsonb_array_elements(roles) with ordinality r(v, o2) on r.o2 = i.o;
  return sid;
end
$$;

-- The society's admins create accounts; residents never sign themselves up.
create function public.api_add_person(p_society text, p_name text, p_email text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  if not cf.is_committee(p_society) and coalesce(auth.role(), '') <> 'service_role' then
    perform cf.err('only the committee can add people');
  end if;
  if not cf.text_ok(p_name, 120) or coalesce(p_email, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform cf.err('a name and a valid email are required');
  end if;
  insert into public.people (society_id, full_name, email, phone, auth_user_id)
    values (p_society, btrim(p_name), lower(btrim(p_email)), nullif(btrim(p_phone), ''),
            (select id from auth.users where email = lower(btrim(p_email))))
    on conflict (society_id, email) do update set full_name = excluded.full_name
    returning id into pid;
  return pid;
end
$$;

create function public.api_add_tenure(p_society text, p_person uuid, p_flat text, p_kind text,
  p_starts date default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  parent text;
  tid text;
begin
  if not cf.is_committee(p_society) and coalesce(auth.role(), '') <> 'service_role' then
    perform cf.err('only the committee can add residents');
  end if;
  if not exists (select 1 from public.flats where id = p_flat and society_id = p_society)
     or not exists (select 1 from public.people where id = p_person and society_id = p_society) then
    perform cf.err('unknown flat or person');
  end if;
  if p_kind = 'tenant' then
    select id into parent from public.tenures
     where flat_id = p_flat and kind = 'owner' and ends_on is null order by starts_on limit 1;
    if parent is null then
      perform cf.err('a tenant is held under an owner: add the owner first');
    end if;
  end if;
  insert into public.tenures (society_id, flat_id, person_id, kind, parent_tenure_id, starts_on)
    values (p_society, p_flat, p_person, p_kind, parent, coalesce(p_starts, cf.today()))
    returning id into tid;
  return tid;
end
$$;

-- Revoking is closing a tenure, never deleting an account.
create function public.api_close_tenure(p_society text, p_tenure text, p_ends date default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not cf.is_committee(p_society) then
    perform cf.err('only the committee can close a tenure');
  end if;
  update public.tenures set ends_on = coalesce(p_ends, cf.today())
   where id = p_tenure and society_id = p_society and ends_on is null;
end
$$;

create function public.api_mark_seen(p_society text, p_seq bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.seen (person_id, last_seen_seq)
  select cf.person(auth.uid(), p_society), p_seq where cf.person(auth.uid(), p_society) is not null
  on conflict (person_id) do update set last_seen_seq = greatest(public.seen.last_seen_seq, excluded.last_seen_seq);
$$;

-- ---------------------------------------------------------------- privileges

-- Postgres grants EXECUTE to PUBLIC by default and Supabase adds anon and
-- authenticated. Take it all back, then grant exactly what each caller needs.
do $$
declare
  f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('public', 'cf') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$$;

grant usage on schema cf to authenticated, service_role;
grant execute on function cf.my_societies(), cf.my_committee_societies(),
  cf.is_member(text), cf.is_committee(text), cf.person(uuid, text),
  cf.active_seat(text, uuid), cf.open_tenure(text, uuid) to authenticated, service_role;

grant execute on function
  public.api_me(text), public.api_head(text), public.api_years(text), public.api_report(text, text),
  public.api_structuring(text), public.api_withdraw(text, bigint), public.api_raise_flag(text, jsonb),
  public.api_flag_note(text, bigint, text, text), public.api_resolve_handle(text, text),
  public.api_my_tenant_flags(text), public.api_report_mismatch(text, text, bigint, text, text),
  public.api_add_person(text, text, text, text), public.api_add_tenure(text, uuid, text, text, date),
  public.api_close_tenure(text, text, date), public.api_mark_seen(text, bigint)
  to authenticated;

grant execute on function
  public.api_propose(uuid, text, jsonb), public.api_cast_intent(uuid, text, bigint, text),
  public.api_cast(uuid, text, bigint, text, bigint, text), public.api_register_key(uuid, text, text),
  public.api_signoff_intent(uuid, text, text), public.api_signoff(uuid, text, text, bigint, text, bigint, text),
  public.api_close_intent(uuid, text, text, text, text),
  public.api_close_year(uuid, text, text, text, text, bigint, bigint, text),
  public.api_open_society(jsonb), public.api_add_person(text, text, text, text),
  public.api_add_tenure(text, uuid, text, text, date), public.api_head(text), public.api_structuring(text)
  to service_role;

grant select on public.ledger, public.proposals, public.disputes, public.flat_dues to authenticated;
revoke all on public.ledger, public.proposals, public.disputes, public.flat_dues, public.mismatch_reports from anon;
