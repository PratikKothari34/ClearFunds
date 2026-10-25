-- The approval rules (AGENTS.md items 5-8, 10-11).
--
-- Money moves in three chained steps: a proposal, approvals, and a posting
-- appended in the same transaction as the approval that completed it. Every
-- rule is checked here, under the per-society lock, so no client can skip
-- one. Functions that take a signature are granted to service_role only: the
-- signing edge function authenticates the admin, signs with the server-held
-- key and passes the result in (AGENTS.md item 2).

-- ---------------------------------------------------------------- helpers

create function cf.err(msg text) returns void language plpgsql as $$
begin
  raise exception '%', msg using errcode = 'P0001';
end
$$;

create function cf.lock(p_society text) returns void
language sql security definer set search_path = '' as $$
  select 1 from public.societies where id = p_society for update;
$$;

create function cf.today() returns date language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- The financial year a business date falls in, as '2025-26'.
create function cf.fy_of(p_society text, p_date date) returns text
language sql stable security definer set search_path = '' as $$
  select (y)::text || '-' || lpad(((y + 1) % 100)::text, 2, '0')
    from (select case when extract(month from p_date) >= s.fy_start_month
                      then extract(year from p_date)::int
                      else extract(year from p_date)::int - 1 end as y
            from public.societies s where s.id = p_society) t
$$;

create function cf.fy_bounds(p_society text, p_fy text, out starts date, out ends date)
language sql stable security definer set search_path = '' as $$
  select make_date(left(p_fy, 4)::int, s.fy_start_month, 1),
         (make_date(left(p_fy, 4)::int, s.fy_start_month, 1) + interval '1 year' - interval '1 day')::date
    from public.societies s where s.id = p_society
$$;

create function cf.fy_closed(p_society text, p_fy text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.chain_entries
                  where society_id = p_society and kind = 'year_close' and body->>'fy' = p_fy)
$$;

create function cf.entry(p_society text, p_seq bigint) returns public.chain_entries
language sql stable security definer set search_path = '' as $$
  select * from public.chain_entries where society_id = p_society and sequence = p_seq
$$;

-- The limit in force and the entry that set it. Read from the chain, never
-- from live config: a limit lowered afterwards must not legitimise an
-- approval cast under the old one.
create function cf.limit_in_force(p_society text, out limit_minor bigint, out limit_seq bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce((body->>'limit_minor')::bigint, (body->>'approval_limit_minor')::bigint), sequence
    from public.chain_entries
   where society_id = p_society
     and (kind = 'society_opened' or (kind = 'posting' and body->>'effect' = 'limit'))
   order by sequence desc limit 1
$$;

create function cf.seated(p_society text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.committee_seats where society_id = p_society and unseated_seq is null
$$;

-- ceil(2M/3) is a floor in code. A configured threshold may only raise it.
create function cf.required_committee(p_society text) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(ceil(2.0 * cf.seated(p_society) / 3)::int, coalesce(s.committee_threshold, 0), 2)
    from public.societies s where s.id = p_society
$$;

create function cf.latest_key(p_society text, p_person uuid) returns public.chain_entries
language sql stable security definer set search_path = '' as $$
  select * from public.chain_entries
   where society_id = p_society and kind = 'key_registered' and body->>'person' = p_person::text
   order by sequence desc limit 1
$$;

-- 'open', 'posted', or the outcome a proposal_closed entry recorded.
create function cf.proposal_status(p_society text, p_seq bigint) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'posted' from public.chain_entries
      where society_id = p_society and kind = 'posting' and (body->>'proposal_seq')::bigint = p_seq limit 1),
    (select body->>'outcome' from public.chain_entries
      where society_id = p_society and kind = 'proposal_closed' and (body->>'proposal_seq')::bigint = p_seq limit 1),
    'open')
$$;

-- The posted reversal of a posting, if any. "At most once" counts POSTED
-- reversals: an abandoned in-flight one does not use up the entry's chance.
create function cf.reversal_of(p_society text, p_posting_seq bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select r.sequence from public.chain_entries r
    join public.chain_entries pr on pr.society_id = r.society_id
                                and pr.sequence = (r.body->>'proposal_seq')::bigint
   where r.society_id = p_society and r.kind = 'posting'
     and r.body->>'effect' in ('reversal', 'charge_reversal')
     and (pr.body->>'target_seq')::bigint = p_posting_seq
   limit 1
$$;

create function cf.require_seat(p_society text, p_person uuid) returns public.committee_seats
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.committee_seats := cf.active_seat(p_society, p_person);
begin
  if s.person_id is null then
    perform cf.err('only a seated committee member can do this');
  end if;
  return s;
end
$$;

create function cf.require_person(p_user uuid, p_society text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  p uuid := cf.person(p_user, p_society);
begin
  if p is null then
    perform cf.err('no account in this society');
  end if;
  return p;
end
$$;

create function cf.text_ok(v text, max int) returns boolean language sql immutable as $$
  select v is not null and length(btrim(v)) between 1 and max
$$;

-- ---------------------------------------------------------------- allocation

-- Splits a total across a flat-set (AGENTS.md item 10). The indivisible
-- remainder goes to the flats that have received it least often in THIS
-- flat-set, ties broken by registry ordinal; a flat new to the set is
-- seeded at the median count. Never seeded from the chain position.
create function cf.allocate(p_society text, p_flat_set text, p_total bigint, p_on date,
  out flat_ids jsonb, out line_amounts jsonb, out remainder_flats jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  n int;
  rem int;
begin
  with hist as (
    select x.flat, count(*) filter (where x.got) as cnt
      from public.chain_entries pr
      join public.chain_entries po on po.society_id = pr.society_id and po.kind = 'posting'
                                  and po.body->>'effect' = 'charge'
                                  and (po.body->>'proposal_seq')::bigint = pr.sequence
      cross join lateral (
        select ids.v #>> '{}' as flat, (pr.body->'remainder_flats') ? (ids.v #>> '{}') as got
          from jsonb_array_elements(pr.body->'flat_ids') ids(v)) x
     where pr.society_id = p_society and pr.kind = 'proposal'
       and pr.body->>'action' = 'charge' and pr.body->>'flat_set' = p_flat_set
     group by x.flat),
  members as (
    select f.id, f.ordinal, h.cnt
      from public.flats f left join hist h on h.flat = f.id
     where f.society_id = p_society and f.joined_on <= p_on
       and (p_flat_set = 'all' or (p_flat_set = 'parking' and f.has_parking))),
  med as (select percentile_disc(0.5) within group (order by cnt) as m from members where cnt is not null),
  ranked as (
    select id, ordinal,
           row_number() over (order by coalesce(cnt, (select m from med), 0), ordinal) as r,
           count(*) over () as n
      from members)
  select max(r.n)::int,
         jsonb_agg(r.id order by r.ordinal),
         jsonb_agg(r.r order by r.ordinal)
    into n, flat_ids, line_amounts
    from ranked r;

  if coalesce(n, 0) = 0 then
    perform cf.err('no flats in that set');
  end if;
  rem := (p_total % n)::int;
  -- line_amounts holds each flat's rank for the moment; turn it into money.
  select jsonb_agg(p_total / n + case when (rk #>> '{}')::int <= rem then 1 else 0 end order by o),
         coalesce(jsonb_agg(flat_ids -> (o::int - 1) order by o) filter (where (rk #>> '{}')::int <= rem), '[]')
    into line_amounts, remainder_flats
    from jsonb_array_elements(line_amounts) with ordinality t(rk, o);
end
$$;

-- ---------------------------------------------------------------- propose

-- A proposal snapshots its tier, the count it needs, M, and the limit in
-- force (with the entry that set it). The count is fixed here and never
-- re-read from live M.
create function public.api_propose(p_user uuid, p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  seat public.committee_seats;
  soc public.societies;
  act text := p->>'action';
  amt bigint;
  repl bigint;
  lim record;
  m int;
  tier text;
  req int;
  body jsonb;
  bdate date := coalesce((p->>'business_date')::date, cf.today());
  tgt public.chain_entries;
  tgt_prop public.chain_entries;
  alloc record;
  rec public.chain_entries;
begin
  perform cf.lock(p_society);
  me := cf.require_person(p_user, p_society);
  seat := cf.require_seat(p_society, me);
  select * into soc from public.societies where id = p_society;
  lim := cf.limit_in_force(p_society);
  m := cf.seated(p_society);

  if act not in ('expense', 'receipt', 'charge', 'reversal', 'limit_change',
                 'seat_admin', 'unseat_admin', 'appoint_auditor') then
    perform cf.err('unknown action');
  end if;
  if not cf.text_ok(p->>'narration', 280) then
    perform cf.err('a description is required');
  end if;
  if act <> 'seat_admin' and m < 3 then
    perform cf.err('the committee has fewer than 3 seated members: seat more before moving money');
  end if;
  if (p ? 'amount_minor') and p->'amount_minor' <> 'null'::jsonb
     and (jsonb_typeof(p->'amount_minor') <> 'number' or (p->>'amount_minor') !~ '^-?[0-9]{1,16}$') then
    perform cf.err('amount must be an integer count of minor units');
  end if;
  if (p ? 'replacement_amount_minor') and p->'replacement_amount_minor' <> 'null'::jsonb
     and (jsonb_typeof(p->'replacement_amount_minor') <> 'number'
          or (p->>'replacement_amount_minor') !~ '^-?[0-9]{1,16}$') then
    perform cf.err('amount must be an integer count of minor units');
  end if;
  amt := (p->>'amount_minor')::bigint;

  body := jsonb_build_object(
    'action', act, 'amount_minor', null, 'currency', null, 'counterparty', null,
    'category', null, 'narration', btrim(p->>'narration'), 'business_date', bdate::text,
    'flat_id', null, 'target_seq', null, 'reason', null, 'replacement_amount_minor', null,
    'person', null, 'role', null, 'fy', null, 'flat_set', null,
    'flat_ids', '[]'::jsonb, 'line_amounts', '[]'::jsonb, 'remainder_flats', '[]'::jsonb);

  if act in ('expense', 'receipt', 'charge') then
    if amt is null or amt <= 0 or amt > 9007199254740991 then
      perform cf.err('amount must be a positive whole number of paise');
    end if;
    if bdate > cf.today() then
      perform cf.err('the date cannot be in the future');
    end if;
    if cf.fy_closed(p_society, cf.fy_of(p_society, bdate)) then
      perform cf.err('that financial year is closed by its auditor: post in the current year');
    end if;
    body := body || jsonb_build_object('amount_minor', amt, 'currency', soc.currency,
      'category', coalesce(nullif(btrim(p->>'category'), ''), case when act = 'charge' then 'maintenance' end));
    if body->>'category' is null then
      perform cf.err('a category is required');
    end if;
    tier := case when amt <= lim.limit_minor then 'pair' else 'committee' end;
  end if;

  if act in ('expense', 'receipt') then
    if not cf.text_ok(p->>'counterparty', 120) then
      perform cf.err(case when act = 'expense' then 'who was paid is required' else 'who paid is required' end);
    end if;
    body := body || jsonb_build_object('counterparty', btrim(p->>'counterparty'));
    if act = 'receipt' and p->>'flat_id' is not null then
      if not exists (select 1 from public.flats where id = p->>'flat_id' and society_id = p_society) then
        perform cf.err('unknown flat');
      end if;
      body := body || jsonb_build_object('flat_id', p->>'flat_id');
    end if;
  elsif act = 'charge' then
    if coalesce(p->>'flat_set', 'all') not in ('all', 'parking') then
      perform cf.err('unknown flat set');
    end if;
    alloc := cf.allocate(p_society, coalesce(p->>'flat_set', 'all'), amt, bdate);
    body := body || jsonb_build_object('flat_set', coalesce(p->>'flat_set', 'all'),
      'counterparty', 'Residents', 'flat_ids', alloc.flat_ids,
      'line_amounts', alloc.line_amounts, 'remainder_flats', alloc.remainder_flats);
  elsif act = 'reversal' then
    tgt := cf.entry(p_society, (p->>'target_seq')::bigint);
    if tgt.kind is distinct from 'posting' or tgt.body->>'effect' not in ('expense', 'receipt', 'charge') then
      perform cf.err('only a posted expense, receipt or charge can be reversed');
    end if;
    if cf.reversal_of(p_society, tgt.sequence) is not null then
      perform cf.err('this entry has already been reversed: an entry is reversed at most once');
    end if;
    if not cf.text_ok(p->>'reason', 500) then
      perform cf.err('a reason is required for every reversal');
    end if;
    tgt_prop := cf.entry(p_society, (tgt.body->>'proposal_seq')::bigint);
    amt := abs((tgt.body->>'amount_minor')::bigint);
    repl := (p->>'replacement_amount_minor')::bigint;
    if repl is not null and (repl <= 0 or tgt.body->>'effect' = 'charge') then
      perform cf.err(case when repl <= 0 then 'replacement must be a positive amount'
                          else 'a charge is replaced by reversing it and raising a new one' end);
    end if;
    -- Always posts in the current period (item 7): a closed year's figures
    -- stay as filed, and the reversal is disclosed as an adjusting entry.
    bdate := cf.today();
    body := body || jsonb_build_object(
      'amount_minor', amt, 'currency', tgt.body->>'currency',
      'counterparty', tgt_prop.body->>'counterparty', 'category', tgt_prop.body->>'category',
      'business_date', bdate::text, 'flat_id', tgt_prop.body->'flat_id',
      'target_seq', tgt.sequence, 'reason', btrim(p->>'reason'),
      'replacement_amount_minor', repl, 'flat_set', tgt_prop.body->'flat_set',
      -- Negates the stored lines one by one; never re-allocates (item 5).
      'flat_ids', tgt_prop.body->'flat_ids',
      'line_amounts', (select coalesce(jsonb_agg(-(v::bigint) order by o), '[]')
                         from jsonb_array_elements_text(tgt_prop.body->'line_amounts') with ordinality x(v, o)));
    -- At least the tier of the entry it reverses.
    tier := case when tgt_prop.body->>'tier' = 'committee'
                   or greatest(amt, coalesce(repl, 0)) > lim.limit_minor
                 then 'committee' else 'pair' end;
  elsif act = 'limit_change' then
    if amt is null or amt < 0 then
      perform cf.err('the limit must be zero or a positive amount');
    end if;
    body := body || jsonb_build_object('amount_minor', amt, 'currency', soc.currency);
    tier := 'committee';
  elsif act in ('seat_admin', 'unseat_admin', 'appoint_auditor') then
    if not exists (select 1 from public.people where id = (p->>'person')::uuid and society_id = p_society) then
      perform cf.err('unknown person');
    end if;
    body := body || jsonb_build_object('person', p->>'person');
    if act = 'seat_admin' then
      if (cf.active_seat(p_society, (p->>'person')::uuid)).person_id is not null then
        perform cf.err('already seated');
      end if;
      if coalesce(p->>'role', 'member') not in ('president', 'treasurer', 'secretary', 'member') then
        perform cf.err('unknown role');
      end if;
      if p->>'role' <> 'member' and exists (select 1 from public.committee_seats
           where society_id = p_society and role = p->>'role' and unseated_seq is null) then
        perform cf.err('that office is held: unseat the holder first');
      end if;
      body := body || jsonb_build_object('role', coalesce(p->>'role', 'member'));
    elsif act = 'unseat_admin' then
      if (cf.active_seat(p_society, (p->>'person')::uuid)).person_id is null then
        perform cf.err('not seated');
      end if;
    else
      if (cf.active_seat(p_society, (p->>'person')::uuid)).person_id is not null then
        perform cf.err('a committee member cannot audit the committee');
      end if;
      if coalesce(p->>'fy', '') !~ '^[0-9]{4}-[0-9]{2}$' then
        perform cf.err('financial year must look like 2025-26');
      end if;
      body := body || jsonb_build_object('fy', p->>'fy');
    end if;
    tier := 'committee';
  end if;

  if tier = 'pair' then
    if (select count(*) from public.committee_seats where society_id = p_society
          and unseated_seq is null and role in ('treasurer', 'secretary')) < 2 then
      perform cf.err('a treasurer and a secretary must both be seated');
    end if;
    req := 2;
  elsif act = 'seat_admin' and m <= 1 then
    -- The low-admin exemption (item 6): applies only at M<=1. The seat it
    -- produces is flagged derived.
    req := m;
  else
    req := cf.required_committee(p_society);
  end if;

  body := body || jsonb_build_object('tier', tier, 'required', req, 'seated', m,
    'limit_minor', lim.limit_minor, 'limit_seq', lim.limit_seq);
  rec := cf.append(p_society, 'proposal', me::text, body);
  return jsonb_build_object('seq', rec.sequence, 'hash', encode(rec.entry_hash, 'hex'));
end
$$;

-- ---------------------------------------------------------------- post

create function cf.close(p_society text, p_seq bigint, p_outcome text) returns void
language sql security definer set search_path = '' as $$
  select cf.append(p_society, 'proposal_closed', null,
    jsonb_build_object('proposal_seq', p_seq, 'outcome', p_outcome));
$$;

create function cf.post(p_society text, pr public.chain_entries) returns void
language plpgsql security definer set search_path = '' as $$
declare
  b jsonb := pr.body;
  act text := b->>'action';
  tgt public.chain_entries;
  rec public.chain_entries;
  derived boolean;
  set_ids uuid[];
  other bigint;
begin
  if act in ('expense', 'receipt', 'charge')
     and cf.fy_closed(p_society, cf.fy_of(p_society, (b->>'business_date')::date)) then
    perform cf.close(p_society, pr.sequence, 'year_closed');
    return;
  end if;

  if act = 'expense' then
    perform cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
      'effect', 'expense', 'amount_minor', -(b->>'amount_minor')::bigint, 'currency', b->>'currency'));
  elsif act = 'receipt' then
    perform cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
      'effect', 'receipt', 'amount_minor', (b->>'amount_minor')::bigint, 'currency', b->>'currency'));
  elsif act = 'charge' then
    perform cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
      'effect', 'charge', 'amount_minor', (b->>'amount_minor')::bigint, 'currency', b->>'currency'));
  elsif act = 'reversal' then
    tgt := cf.entry(p_society, (b->>'target_seq')::bigint);
    if cf.reversal_of(p_society, tgt.sequence) is not null then
      perform cf.close(p_society, pr.sequence, 'superseded');
      return;
    end if;
    perform cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
      'effect', case when tgt.body->>'effect' = 'charge' then 'charge_reversal' else 'reversal' end,
      'amount_minor', -(tgt.body->>'amount_minor')::bigint, 'currency', tgt.body->>'currency'));
    if b->>'replacement_amount_minor' is not null then
      perform cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
        'effect', tgt.body->>'effect',
        'amount_minor', sign((tgt.body->>'amount_minor')::bigint) * (b->>'replacement_amount_minor')::bigint,
        'currency', tgt.body->>'currency'));
    end if;
    -- Any other in-flight reversal of the same entry can no longer post.
    for other in
      select sequence from public.chain_entries
       where society_id = p_society and kind = 'proposal' and body->>'action' = 'reversal'
         and (body->>'target_seq')::bigint = tgt.sequence and sequence <> pr.sequence
    loop
      if cf.proposal_status(p_society, other) = 'open' then
        perform cf.close(p_society, other, 'superseded');
      end if;
    end loop;
  elsif act = 'limit_change' then
    perform cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
      'effect', 'limit', 'limit_minor', (b->>'amount_minor')::bigint, 'currency', b->>'currency'));
  elsif act = 'seat_admin' then
    -- Derived: seated under the exemption, or by a voting set that contains
    -- a derived admin.
    derived := (b->>'seated')::int <= 1 or exists (
      select 1 from public.chain_entries a
       where a.society_id = p_society and a.kind = 'approval'
         and (a.body->>'proposal_seq')::bigint = pr.sequence
         and a.body->>'decision' = 'approve' and (a.body->>'derived')::boolean);
    if (cf.active_seat(p_society, (b->>'person')::uuid)).person_id is not null
       or (b->>'role' <> 'member' and exists (select 1 from public.committee_seats
            where society_id = p_society and role = b->>'role' and unseated_seq is null)) then
      perform cf.close(p_society, pr.sequence, 'superseded');
      return;
    end if;
    rec := cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
      'effect', 'seat', 'person', b->>'person', 'role', b->>'role', 'derived', derived));
    insert into public.committee_seats (society_id, person_id, role, derived, seated_seq)
      values (p_society, (b->>'person')::uuid, b->>'role', derived, rec.sequence);
  elsif act = 'unseat_admin' then
    if (cf.active_seat(p_society, (b->>'person')::uuid)).person_id is null then
      perform cf.close(p_society, pr.sequence, 'superseded');
      return;
    end if;
    rec := cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
      'effect', 'unseat', 'person', b->>'person'));
    update public.committee_seats set unseated_seq = rec.sequence
     where society_id = p_society and person_id = (b->>'person')::uuid and unseated_seq is null;
  elsif act = 'appoint_auditor' then
    select array_agg(person_id order by person_id) into set_ids
      from public.committee_seats where society_id = p_society and unseated_seq is null;
    rec := cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
      'effect', 'auditor', 'person', b->>'person', 'role', 'auditor'));
    insert into public.auditor_appointments (society_id, person_id, fy, appointment_seq, appointing_set)
      values (p_society, (b->>'person')::uuid, b->>'fy', rec.sequence, set_ids);
  end if;
end
$$;

-- ---------------------------------------------------------------- approve

create function cf.approval_message(p_society text, p_seq bigint, p_hash bytea,
  p_decision text, p_person uuid) returns bytea
language sql immutable as $$
  select cf.field(2, convert_to('clearfunds/approval', 'UTF8'))
      || cf.field(2, convert_to(p_society, 'UTF8'))
      || cf.field(1, int8send(p_seq))
      || cf.field(3, p_hash)
      || cf.field(2, convert_to(p_decision, 'UTF8'))
      || cf.field(2, convert_to(p_person::text, 'UTF8'))
$$;

-- Validates a cast without appending it. Returns the bytes to sign.
create function cf.check_cast(p_user uuid, p_society text, p_seq bigint, p_decision text,
  out me uuid, out seat public.committee_seats, out pr public.chain_entries)
language plpgsql stable security definer set search_path = '' as $$
begin
  me := cf.require_person(p_user, p_society);
  seat := cf.require_seat(p_society, me);
  pr := cf.entry(p_society, p_seq);
  if pr.kind is distinct from 'proposal' then
    perform cf.err('no such proposal');
  end if;
  if cf.proposal_status(p_society, p_seq) <> 'open' then
    perform cf.err('this proposal is no longer open');
  end if;
  if p_decision not in ('approve', 'decline') then
    perform cf.err('decision is approve or decline');
  end if;
  if pr.body->>'tier' = 'pair' and seat.role not in ('treasurer', 'secretary') then
    perform cf.err('below the limit, only the treasurer and the secretary approve');
  end if;
  if exists (select 1 from public.chain_entries where society_id = p_society and kind = 'approval'
               and (body->>'proposal_seq')::bigint = p_seq and actor = me::text) then
    perform cf.err('you have already responded to this proposal');
  end if;
end
$$;

create function public.api_cast_intent(p_user uuid, p_society text, p_seq bigint, p_decision text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  c := cf.check_cast(p_user, p_society, p_seq, p_decision);
  return jsonb_build_object(
    'person', c.me,
    'key_seq', (cf.latest_key(p_society, c.me)).sequence,
    'message', encode(cf.approval_message(p_society, p_seq, (c.pr).entry_hash, p_decision, c.me), 'hex'));
end
$$;

create function public.api_cast(p_user uuid, p_society text, p_seq bigint, p_decision text,
  p_key_seq bigint, p_signature text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  b jsonb;
  ok int;
  no int;
  status text;
begin
  perform cf.lock(p_society);
  c := cf.check_cast(p_user, p_society, p_seq, p_decision);
  if p_key_seq is distinct from (cf.latest_key(p_society, c.me)).sequence then
    perform cf.err('signing key is not this admin''s current key');
  end if;
  perform cf.append(p_society, 'approval', c.me::text, jsonb_build_object(
    'proposal_seq', p_seq, 'decision', p_decision, 'role', (c.seat).role, 'derived', (c.seat).derived,
    'proposal_hash', encode((c.pr).entry_hash, 'hex'), 'key_seq', p_key_seq, 'signature', p_signature));

  b := (c.pr).body;
  if b->>'tier' = 'pair' then
    select count(distinct body->>'role') filter (where body->>'decision' = 'approve'),
           count(*) filter (where body->>'decision' = 'decline')
      into ok, no
      from public.chain_entries
     where society_id = p_society and kind = 'approval' and (body->>'proposal_seq')::bigint = p_seq
       and body->>'role' in ('treasurer', 'secretary');
    if ok = 2 then
      perform cf.post(p_society, c.pr);
    elsif no > 0 then
      perform cf.close(p_society, p_seq, 'declined');
    end if;
  else
    -- A derived admin's vote does not count toward seating further admins,
    -- and counts normally for everything else.
    select count(*) filter (where body->>'decision' = 'approve'
                              and not (b->>'action' = 'seat_admin' and (body->>'derived')::boolean)),
           count(*) filter (where body->>'decision' = 'decline')
      into ok, no
      from public.chain_entries
     where society_id = p_society and kind = 'approval' and (body->>'proposal_seq')::bigint = p_seq;
    if ok >= (b->>'required')::int then
      perform cf.post(p_society, c.pr);
    elsif no > greatest(cf.seated(p_society), (b->>'seated')::int) - (b->>'required')::int then
      perform cf.close(p_society, p_seq, 'declined');
    end if;
  end if;
  status := cf.proposal_status(p_society, p_seq);
  return jsonb_build_object('status', status);
end
$$;

-- The proposer may withdraw an open proposal. Recorded, never removed.
create function public.api_withdraw(p_society text, p_seq bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  pr public.chain_entries;
begin
  perform cf.lock(p_society);
  me := cf.require_person(auth.uid(), p_society);
  pr := cf.entry(p_society, p_seq);
  if pr.kind is distinct from 'proposal' or pr.actor <> me::text then
    perform cf.err('only the proposer can withdraw a proposal');
  end if;
  if cf.proposal_status(p_society, p_seq) <> 'open' then
    perform cf.err('this proposal is no longer open');
  end if;
  perform cf.close(p_society, p_seq, 'withdrawn');
  return jsonb_build_object('status', 'withdrawn');
end
$$;

-- ---------------------------------------------------------------- keys

create function public.api_register_key(p_user uuid, p_society text, p_public_key text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  k public.chain_entries;
begin
  perform cf.lock(p_society);
  me := cf.require_person(p_user, p_society);
  if (cf.active_seat(p_society, me)).person_id is null and not cf.is_auditor(p_society, me) then
    perform cf.err('only committee members and auditors hold signing keys');
  end if;
  k := cf.latest_key(p_society, me);
  if k.body->>'public_key' = p_public_key then
    return k.sequence;
  end if;
  return (cf.append(p_society, 'key_registered', null, jsonb_build_object(
    'person', me::text, 'alg', 'ed25519', 'public_key', p_public_key))).sequence;
end
$$;

-- ---------------------------------------------------------------- sign-off

create function cf.signoff_message(p_society text, p_month text, p_seq bigint, p_hash bytea, p_person uuid)
returns bytea language sql immutable as $$
  select cf.field(2, convert_to('clearfunds/month-signoff', 'UTF8'))
      || cf.field(2, convert_to(p_society, 'UTF8'))
      || cf.field(2, convert_to(p_month, 'UTF8'))
      || cf.field(1, int8send(p_seq))
      || cf.field(3, p_hash)
      || cf.field(2, convert_to(p_person::text, 'UTF8'))
$$;

create function cf.check_signoff(p_user uuid, p_society text, p_month text,
  out me uuid, out head public.chain_entries)
language plpgsql stable security definer set search_path = '' as $$
begin
  me := cf.require_person(p_user, p_society);
  if (cf.active_seat(p_society, me)).role is distinct from 'president' then
    perform cf.err('only the president signs off a month');
  end if;
  if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or (p_month || '-01')::date > cf.today() then
    perform cf.err('choose a month that has started');
  end if;
  if exists (select 1 from public.chain_entries where society_id = p_society
               and kind = 'month_signoff' and body->>'month' = p_month) then
    perform cf.err('that month is already signed off');
  end if;
  select * into head from public.chain_entries where society_id = p_society order by sequence desc limit 1;
end
$$;

create function public.api_signoff_intent(p_user uuid, p_society text, p_month text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  c := cf.check_signoff(p_user, p_society, p_month);
  return jsonb_build_object('person', c.me, 'through_seq', (c.head).sequence,
    'key_seq', (cf.latest_key(p_society, c.me)).sequence,
    'message', encode(cf.signoff_message(p_society, p_month, (c.head).sequence, (c.head).entry_hash, c.me), 'hex'));
end
$$;

create function public.api_signoff(p_user uuid, p_society text, p_month text, p_through_seq bigint,
  p_note text, p_key_seq bigint, p_signature text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  t public.chain_entries;
begin
  perform cf.lock(p_society);
  c := cf.check_signoff(p_user, p_society, p_month);
  t := cf.entry(p_society, p_through_seq);
  if t.sequence is null or p_key_seq is distinct from (cf.latest_key(p_society, c.me)).sequence then
    perform cf.err('sign-off is out of date: try again');
  end if;
  return (cf.append(p_society, 'month_signoff', c.me::text, jsonb_build_object(
    'month', p_month, 'through_seq', t.sequence, 'through_hash', encode(t.entry_hash, 'hex'),
    'note', nullif(btrim(coalesce(p_note, '')), ''), 'key_seq', p_key_seq,
    'signature', p_signature))).sequence;
end
$$;

-- ---------------------------------------------------------------- year close

create function cf.close_message(p_society text, p_fy text, p_opinion text, p_statement text,
  p_seq bigint, p_hash bytea, p_person uuid) returns bytea
language sql immutable as $$
  select cf.field(2, convert_to('clearfunds/year-close', 'UTF8'))
      || cf.field(2, convert_to(p_society, 'UTF8'))
      || cf.field(2, convert_to(p_fy, 'UTF8'))
      || cf.field(2, convert_to(p_opinion, 'UTF8'))
      || cf.field(3, extensions.digest(convert_to(p_statement, 'UTF8'), 'sha256'))
      || cf.field(1, int8send(p_seq))
      || cf.field(3, p_hash)
      || cf.field(2, convert_to(p_person::text, 'UTF8'))
$$;

create function cf.check_close(p_user uuid, p_society text, p_fy text, p_opinion text, p_statement text,
  out me uuid, out appt public.auditor_appointments, out head public.chain_entries)
language plpgsql stable security definer set search_path = '' as $$
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
  if not cf.text_ok(p_statement, 4000) then
    perform cf.err('the auditor''s statement is required');
  end if;
  select * into head from public.chain_entries where society_id = p_society order by sequence desc limit 1;
end
$$;

create function public.api_close_intent(p_user uuid, p_society text, p_fy text, p_opinion text,
  p_statement text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  s text := normalize(btrim(p_statement), nfc);
begin
  c := cf.check_close(p_user, p_society, p_fy, p_opinion, s);
  return jsonb_build_object('person', c.me, 'through_seq', (c.head).sequence,
    'key_seq', (cf.latest_key(p_society, c.me)).sequence,
    'message', encode(cf.close_message(p_society, p_fy, p_opinion, s, (c.head).sequence,
                                        (c.head).entry_hash, c.me), 'hex'));
end
$$;

-- Atomic: the year is sealed by this one entry or not at all.
create function public.api_close_year(p_user uuid, p_society text, p_fy text, p_opinion text,
  p_statement text, p_through_seq bigint, p_key_seq bigint, p_signature text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  t public.chain_entries;
  s text := normalize(btrim(p_statement), nfc);
begin
  perform cf.lock(p_society);
  c := cf.check_close(p_user, p_society, p_fy, p_opinion, s);
  t := cf.entry(p_society, p_through_seq);
  if t.sequence is null or p_key_seq is distinct from (cf.latest_key(p_society, c.me)).sequence then
    perform cf.err('close is out of date: try again');
  end if;
  return (cf.append(p_society, 'year_close', c.me::text, jsonb_build_object(
    'fy', p_fy, 'opinion', p_opinion, 'statement', s,
    'appointment_seq', (c.appt).appointment_seq, 'through_seq', t.sequence,
    'through_hash', encode(t.entry_hash, 'hex'), 'key_seq', p_key_seq,
    'signature', p_signature))).sequence;
end
$$;

-- ---------------------------------------------------------------- flags

create function cf.flag_open(p_society text, f public.chain_entries) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.chain_entries n
    where n.society_id = p_society and n.kind = 'flag_note'
      and (n.body->>'flag_seq')::bigint = f.sequence and n.actor = f.actor
      and n.body->>'note' in ('resolved', 'raised_in_error'))
$$;

create function public.api_raise_flag(p_society text, p jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  ten public.tenures;
  scope text := p->>'scope';
  seqs jsonb := coalesce(p->'target_seqs', '[]');
begin
  perform cf.lock(p_society);
  me := cf.require_person(auth.uid(), p_society);
  ten := cf.open_tenure(p_society, me);
  if ten.id is null then
    perform cf.err('only a resident with a current tenure can raise a dispute');
  end if;
  if not cf.text_ok(p->>'text', 1000) then
    perform cf.err('say what looks wrong');
  end if;
  if scope = 'entries' then
    if jsonb_array_length(seqs) = 0 or exists (
         select 1 from jsonb_array_elements_text(seqs) s(v)
          where (cf.entry(p_society, v::bigint)).kind is distinct from 'posting') then
      perform cf.err('choose the entries this is about');
    end if;
    -- At most one open flag per resident per entry.
    if exists (select 1 from public.chain_entries f, jsonb_array_elements_text(f.body->'target_seqs') t(v)
                where f.society_id = p_society and f.kind = 'flag' and f.actor = ten.handle
                  and exists (select 1 from jsonb_array_elements_text(seqs) x(v) where x.v = t.v)
                  and cf.flag_open(p_society, f)) then
      perform cf.err('you already have an open dispute on this entry: add to it instead');
    end if;
  elsif scope = 'counterparty' then
    if not cf.text_ok(p->>'counterparty', 120) then
      perform cf.err('name the payee');
    end if;
  elsif scope = 'period' then
    if coalesce(p->>'period', '') !~ '^[0-9]{4}-([0-9]{2}|(0[1-9]|1[0-2]))$' then
      perform cf.err('choose a month or a financial year');
    end if;
  else
    perform cf.err('unknown scope');
  end if;
  return (cf.append(p_society, 'flag', ten.handle, jsonb_build_object(
    'scope', scope,
    'target_seqs', (select coalesce(jsonb_agg(v::bigint order by v::bigint), '[]')
                      from (select distinct v from jsonb_array_elements_text(seqs) s(v)) d),
    'counterparty', case when scope = 'counterparty' then btrim(p->>'counterparty') end,
    'period', case when scope = 'period' then p->>'period' end,
    'text', btrim(p->>'text')))).sequence;
end
$$;

-- Flags are append-only: nothing is withdrawn. The author may append
-- 'raised_in_error', 'resolved' or 'comment'; the committee only 'response'.
-- A response does not stop the escalation clock.
create function public.api_flag_note(p_society text, p_flag_seq bigint, p_note text, p_text text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  f public.chain_entries;
  ten public.tenures;
  actor text;
begin
  perform cf.lock(p_society);
  me := cf.require_person(auth.uid(), p_society);
  f := cf.entry(p_society, p_flag_seq);
  if f.kind is distinct from 'flag' then
    perform cf.err('no such dispute');
  end if;
  if p_note = 'response' then
    perform cf.require_seat(p_society, me);
    actor := me::text;
  elsif p_note in ('resolved', 'raised_in_error', 'comment') then
    ten := cf.open_tenure(p_society, me);
    if ten.handle is distinct from f.actor then
      perform cf.err('only the resident who raised this can do that');
    end if;
    if not cf.flag_open(p_society, f) then
      perform cf.err('this dispute is already closed by its author');
    end if;
    actor := ten.handle;
  else
    perform cf.err('unknown note');
  end if;
  if not cf.text_ok(coalesce(nullif(btrim(p_text), ''),
                             case when p_note in ('resolved', 'raised_in_error') then p_note end), 1000) then
    perform cf.err('write a short note');
  end if;
  return (cf.append(p_society, 'flag_note', actor, jsonb_build_object(
    'flag_seq', p_flag_seq, 'note', p_note,
    'text', btrim(coalesce(nullif(btrim(p_text), ''), replace(p_note, '_', ' ')))))).sequence;
end
$$;

-- Committee-only: who is behind a handle.
create function public.api_resolve_handle(p_society text, p_handle text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cf.is_committee(p_society) then
    perform cf.err('only the committee can see who raised a dispute');
  end if;
  return (select jsonb_build_object('name', p.full_name, 'flat', f.label, 'kind', t.kind,
                                    'ended', t.ends_on)
            from public.tenures t join public.people p on p.id = t.person_id
            join public.flats f on f.id = t.flat_id
           where t.society_id = p_society and t.handle = p_handle);
end
$$;

-- The fourth visibility rule: an owner sees what their OWN tenant raised.
create function public.api_my_tenant_flags(p_society text) returns setof bigint
language sql stable security definer set search_path = '' as $$
  select f.sequence from public.chain_entries f
    join public.tenures tt on tt.handle = f.actor and tt.kind = 'tenant'
    join public.tenures ot on ot.id = tt.parent_tenure_id
   where f.society_id = p_society and f.kind = 'flag'
     and ot.person_id = cf.person(auth.uid(), p_society)
$$;

-- What the signed-in person is: their roles, flat and handle.
create function public.api_me(p_society text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.people;
  t public.tenures;
  s public.committee_seats;
begin
  select * into p from public.people
   where auth_user_id = auth.uid() and (p_society is null or society_id = p_society)
   order by created_at limit 1;
  if p.id is null then
    return null;
  end if;
  t := cf.open_tenure(p.society_id, p.id);
  s := cf.active_seat(p.society_id, p.id);
  return jsonb_build_object(
    'person', p.id, 'name', p.full_name, 'email', p.email,
    'society', (select to_jsonb(x) from public.societies x where x.id = p.society_id),
    'seat', case when s.person_id is null then null
                 else jsonb_build_object('role', s.role, 'derived', s.derived) end,
    -- Every year this person was appointed to audit, closed or not: an
    -- auditor who has signed off is still the auditor of that year.
    'auditor_for', (select coalesce(jsonb_agg(a.fy order by a.fy), '[]') from public.auditor_appointments a
                     where a.society_id = p.society_id and a.person_id = p.id),
    'tenure', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'handle', t.handle, 'flat_id', t.flat_id,
      'flat', (select label from public.flats where id = t.flat_id),
      'owner_can_see', t.kind = 'tenant') end,
    'last_seen_seq', (select last_seen_seq from public.seen where person_id = p.id));
end
$$;

-- The head tuple (item 9). The edge function signs it; publication outside
-- admin control is the anchor's job.
create function public.api_head(p_society text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cf.is_member(p_society) and coalesce(auth.role(), '') <> 'service_role' then
    perform cf.err('not a member of this society');
  end if;
  return (select jsonb_build_object('society_id', p_society, 'hash', encode(entry_hash, 'hex'),
            'highest_sequence', sequence, 'entry_count', sequence, 'as_of', recorded_at,
            'format_version', 1)
            from public.chain_entries where society_id = p_society
           order by sequence desc limit 1);
end
$$;
