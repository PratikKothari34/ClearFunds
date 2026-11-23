-- Budget vs actual (#76, contracts/chain/kinds/budget.v1.md).
--
-- A year's budget is set by the committee through the ordinary approval path:
-- budget_lines, then as the very next entry a proposal with action 'budget',
-- then approvals, then a posting with effect 'budget' and no amount. The lines
-- come first so the proposal's prev_hash is their entry_hash: an approval
-- signs the proposal's hash, so it commits to the amounts.
--
-- No balance sees a budget. The ledger view selects five money effects by
-- name, and a 'budget' posting is not one of them, exactly as 'limit' and
-- 'seat' are not. Do not widen that filter without the frontend parser
-- shipping first (#76).

insert into cf.kinds (kind, layout, chainable) values
('budget_lines', '[["fy","text"],["currency","text"],["categories","list<text>"],["amounts_minor","list<int>"],
  ["income_categories","list<text>"],["income_amounts_minor","list<int>"]]', true);

-- ---------------------------------------------------------------- input

-- One list of budget lines from a request: [{category, amount_minor}] ->
-- the same, trimmed, checked and in ascending byte order of the category.
create function cf.budget_list(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  x jsonb;
  c text;
  acc jsonb := '[]';
begin
  if p is null or p = 'null'::jsonb then
    return acc;
  end if;
  if jsonb_typeof(p) <> 'array' then
    perform cf.err('budget lines must be a list');
  end if;
  if jsonb_array_length(p) > 200 then
    perform cf.err('a budget has at most 200 lines on each side');
  end if;
  for x in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(x) <> 'object' then
      perform cf.err('each budget line is a category and an amount');
    end if;
    -- NFC first, exactly as cf.append will store it, so the length, the
    -- duplicate check and the sort all see the text the chain will hold.
    c := btrim(normalize(x->>'category', nfc));
    if c is null or c = '' then
      perform cf.err('each budget line needs a category');
    end if;
    if length(c) > 80 then
      perform cf.err('a category is at most 80 characters');
    end if;
    if jsonb_typeof(x->'amount_minor') is distinct from 'number'
       or (x->>'amount_minor') !~ '^[0-9]{1,16}$'
       or (x->>'amount_minor')::numeric > 9007199254740991 then
      perform cf.err(format('the budget for %s must be a whole number of minor units, from 0 to 9007199254740991', c));
    end if;
    if acc @> jsonb_build_array(jsonb_build_object('category', c)) then
      perform cf.err(format('%s appears twice in one budget', c));
    end if;
    acc := acc || jsonb_build_array(jsonb_build_object('category', c, 'amount_minor', (x->>'amount_minor')::bigint));
  end loop;
  -- Ascending byte order of the UTF-8, whatever the database collation.
  return (select coalesce(jsonb_agg(y order by convert_to(y->>'category', 'UTF8')), '[]')
            from jsonb_array_elements(acc) y);
end
$$;

-- Two parallel chained lists -> [{category, amount_minor}], in chain order.
create function cf.budget_pairs(p_cats jsonb, p_amts jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', c.v, 'amount_minor', (p_amts->>(c.o::int - 1))::bigint)
           order by c.o), '[]')
    from jsonb_array_elements_text(p_cats) with ordinality c(v, o)
$$;

-- ---------------------------------------------------------------- propose

-- Unchanged from 18 except the 'budget' action and the budget_lines append.
create or replace function cf.propose_core(p_user uuid, p_society text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  lines jsonb;
  income jsonb;
begin
  perform cf.lock(p_society);
  me := cf.require_person(p_user, p_society);
  seat := cf.require_seat(p_society, me);
  select * into soc from public.societies where id = p_society;
  lim := cf.limit_in_force(p_society);
  m := cf.seated(p_society);

  if act not in ('expense', 'receipt', 'charge', 'reversal', 'limit_change',
                 'seat_admin', 'unseat_admin', 'appoint_auditor', 'budget') then
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
    -- Money owed from before the society joined goes to the committee
    -- whatever its size (AGENTS.md item 12).
    tier := case when amt <= lim.limit_minor and body->>'category' is distinct from 'opening'
                 then 'pair' else 'committee' end;
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
    if coalesce(p->>'flat_set', 'all') not in ('all', 'parking', 'flat') then
      perform cf.err('unknown flat set');
    end if;
    if p->>'flat_set' = 'flat' then
      -- One flat, the whole amount: nothing to divide, so no remainder. The
      -- allocation is still stored in the chain like any other (item 10).
      if not exists (select 1 from public.flats where id = p->>'flat_id' and society_id = p_society) then
        perform cf.err('unknown flat');
      end if;
      body := body || jsonb_build_object('flat_set', 'flat', 'flat_id', p->>'flat_id',
        'counterparty', (select label from public.flats where id = p->>'flat_id'),
        'flat_ids', jsonb_build_array(p->>'flat_id'), 'line_amounts', jsonb_build_array(amt),
        'remainder_flats', '[]'::jsonb);
    else
      alloc := cf.allocate(p_society, coalesce(p->>'flat_set', 'all'), amt, bdate);
      body := body || jsonb_build_object('flat_set', coalesce(p->>'flat_set', 'all'),
        'counterparty', 'Residents', 'flat_ids', alloc.flat_ids,
        'line_amounts', alloc.line_amounts, 'remainder_flats', alloc.remainder_flats);
    end if;
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
  elsif act = 'budget' then
    -- A year's budget (#76, contracts/chain/kinds/budget.v1.md). Not money:
    -- no amount, and always the committee tier.
    if coalesce(p->>'fy', '') !~ '^[0-9]{4}-[0-9]{2}$'
       or right(p->>'fy', 2)::int <> (left(p->>'fy', 4)::int + 1) % 100 then
      perform cf.err('financial year must look like 2025-26');
    end if;
    if cf.fy_closed(p_society, p->>'fy') then
      perform cf.err('that financial year is closed by its auditor: its budget can no longer change');
    end if;
    lines := cf.budget_list(p->'lines');
    income := cf.budget_list(p->'income_lines');
    if jsonb_array_length(lines) + jsonb_array_length(income) = 0 then
      perform cf.err('a budget needs at least one line');
    end if;
    body := body || jsonb_build_object('fy', p->>'fy', 'business_date', cf.today()::text);
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
  if act = 'budget' then
    -- The lines go first, so the proposal's prev_hash is their entry_hash and
    -- every approval, which signs the proposal's hash, commits to them.
    perform cf.append(p_society, 'budget_lines', me::text, jsonb_build_object(
      'fy', p->>'fy', 'currency', soc.currency,
      'categories', (select coalesce(jsonb_agg(x->'category' order by o), '[]') from jsonb_array_elements(lines) with ordinality t(x, o)),
      'amounts_minor', (select coalesce(jsonb_agg(x->'amount_minor' order by o), '[]') from jsonb_array_elements(lines) with ordinality t(x, o)),
      'income_categories', (select coalesce(jsonb_agg(x->'category' order by o), '[]') from jsonb_array_elements(income) with ordinality t(x, o)),
      'income_amounts_minor', (select coalesce(jsonb_agg(x->'amount_minor' order by o), '[]') from jsonb_array_elements(income) with ordinality t(x, o))));
  end if;
  rec := cf.append(p_society, 'proposal', me::text, body);
  return jsonb_build_object('seq', rec.sequence, 'hash', encode(rec.entry_hash, 'hex'));
end
$function$;

-- ---------------------------------------------------------------- post

-- Unchanged from 03 except the 'budget' branch.
create or replace function cf.post(p_society text, pr public.chain_entries) returns void
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
  elsif act = 'budget' then
    -- Still open when its year was closed: the closed year's budget stays as
    -- it was when the auditor signed.
    if cf.fy_closed(p_society, b->>'fy') then
      perform cf.close(p_society, pr.sequence, 'year_closed');
      return;
    end if;
    perform cf.append(p_society, 'posting', null, jsonb_build_object('proposal_seq', pr.sequence,
      'effect', 'budget'));
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

-- ---------------------------------------------------------------- proposals

-- Two columns appended: a budget proposal's lines, null for any other action.
create or replace view public.proposals as
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
       coalesce(ap.decline, 0) as decline_count,
       bl.lines,
       bl.income_lines
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
  left join lateral (
    select cf.budget_pairs(l.body->'categories', l.body->'amounts_minor') as lines,
           cf.budget_pairs(l.body->'income_categories', l.body->'income_amounts_minor') as income_lines
      from public.chain_entries l
     where pr.body->>'action' = 'budget'
       and l.society_id = pr.society_id and l.sequence = pr.sequence - 1 and l.kind = 'budget_lines') bl on true
 where pr.kind = 'proposal'
   and (pr.society_id in (select cf.my_societies()) or current_user in ('postgres', 'service_role'));

-- ---------------------------------------------------------------- report

-- The year's budget as it moved, beside what was actually spent and received.
-- Actual figures are read from the report's own income and expenditure lines,
-- so the two can never disagree.
create function cf.year_budget(p_society text, p_fy text, p_ie jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  ends date := (cf.fy_bounds(p_society, p_fy)).ends;
  revs jsonb;
  f public.chain_entries;
  l public.chain_entries;
  fl public.chain_entries;
  ll public.chain_entries;
begin
  select coalesce(jsonb_agg(jsonb_build_object('posting_seq', po.sequence, 'proposal_seq', pr.sequence,
           'recorded_at', po.recorded_at,
           'after_year_end', (to_timestamp(po.recorded_at / 1000.0) at time zone 'Asia/Kolkata')::date > ends) order by po.sequence), '[]')
    into revs
    from public.chain_entries po
    join public.chain_entries pr on pr.society_id = po.society_id
                                and pr.sequence = (po.body->>'proposal_seq')::bigint
   where po.society_id = p_society and po.kind = 'posting' and po.body->>'effect' = 'budget'
     and pr.body->>'fy' = p_fy;
  if jsonb_array_length(revs) = 0 then
    return null;
  end if;
  f := cf.entry(p_society, (revs->0->>'posting_seq')::bigint);
  -- The final budget is the one in force at the year's end: the last posted
  -- on or before its last day. A revision chained after that is listed and
  -- marked, but never becomes what the year is measured against, or a budget
  -- lowered after the money was spent would turn an overrun into no variance.
  -- If every revision came after the year ended, none was in force, and the
  -- first one recorded stands.
  l := cf.entry(p_society, coalesce(
    (select (r->>'posting_seq')::bigint from jsonb_array_elements(revs) with ordinality t(r, i)
      where not (r->>'after_year_end')::boolean order by i desc limit 1),
    (revs->0->>'posting_seq')::bigint));
  fl := cf.entry(p_society, (f.body->>'proposal_seq')::bigint - 1);
  ll := cf.entry(p_society, (l.body->>'proposal_seq')::bigint - 1);
  return jsonb_build_object(
    'first_seq', f.sequence, 'final_seq', l.sequence, 'revisions', revs,
    'expenditure', cf.budget_lines_report(
      cf.budget_pairs(fl.body->'categories', fl.body->'amounts_minor'),
      cf.budget_pairs(ll.body->'categories', ll.body->'amounts_minor'), p_ie->'expenditure'),
    'income', cf.budget_lines_report(
      cf.budget_pairs(fl.body->'income_categories', fl.body->'income_amounts_minor'),
      cf.budget_pairs(ll.body->'income_categories', ll.body->'income_amounts_minor'), p_ie->'income'),
    'unbudgeted_expenditure', cf.budget_unbudgeted(
      cf.budget_pairs(fl.body->'categories', fl.body->'amounts_minor'),
      cf.budget_pairs(ll.body->'categories', ll.body->'amounts_minor'), p_ie->'expenditure'),
    'unbudgeted_income', cf.budget_unbudgeted(
      cf.budget_pairs(fl.body->'income_categories', fl.body->'income_amounts_minor'),
      cf.budget_pairs(ll.body->'income_categories', ll.body->'income_amounts_minor'), p_ie->'income'));
end
$$;

-- One line per category in the first or the final budget. A null is a line
-- that budget did not have, never a zero.
create function cf.budget_lines_report(p_first jsonb, p_final jsonb, p_actual jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  with cats as (
    select x->>'category' as category from jsonb_array_elements(p_first) x
    union
    select x->>'category' from jsonb_array_elements(p_final) x),
  r as (
    select c.category,
           (select (x->>'amount_minor')::bigint from jsonb_array_elements(p_first) x where x->>'category' = c.category) as first_minor,
           (select (x->>'amount_minor')::bigint from jsonb_array_elements(p_final) x where x->>'category' = c.category) as final_minor,
           coalesce((select (x->>'amount_minor')::bigint from jsonb_array_elements(p_actual) x where x->>'category' = c.category), 0) as actual_minor
      from cats c)
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'first_minor', first_minor,
           'final_minor', final_minor, 'actual_minor', actual_minor,
           'variance_minor', actual_minor - final_minor) order by convert_to(category, 'UTF8')), '[]')
    from r
$$;

-- Actual figures in a category neither budget had a line for. Never dropped.
create function cf.budget_unbudgeted(p_first jsonb, p_final jsonb, p_actual jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', a->>'category', 'actual_minor', (a->>'amount_minor')::bigint)
           order by convert_to(a->>'category', 'UTF8')), '[]')
    from jsonb_array_elements(p_actual) a
   where not exists (select 1 from jsonb_array_elements(p_first) x where x->>'category' = a->>'category')
     and not exists (select 1 from jsonb_array_elements(p_final) x where x->>'category' = a->>'category')
$$;

-- api_report keeps its signature and grants; the body moves to cf.
alter function public.api_report(text, text) set schema cf;
alter function cf.api_report(text, text) rename to report_core;

create function public.api_report(p_society text, p_fy text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb;
begin
  -- report_core checks membership and the shape of p_fy.
  r := cf.report_core(p_society, p_fy);
  return r || jsonb_build_object('budget', cf.year_budget(p_society, p_fy, r->'income_expenditure'));
end
$$;

-- ---------------------------------------------------------------- privileges

revoke all on function cf.budget_list(jsonb), cf.budget_pairs(jsonb, jsonb), cf.year_budget(text, text, jsonb),
  cf.budget_lines_report(jsonb, jsonb, jsonb), cf.budget_unbudgeted(jsonb, jsonb, jsonb), cf.report_core(text, text)
  from public, anon, authenticated, service_role;
grant execute on function cf.budget_pairs(jsonb, jsonb) to authenticated, service_role;
revoke all on function public.api_report(text, text) from public, anon;
grant execute on function public.api_report(text, text) to authenticated, service_role;
