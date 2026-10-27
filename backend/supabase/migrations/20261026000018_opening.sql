-- Opening entries and one-flat charges (#50, contract #52).
--
-- A proposal with category 'opening' (a balance or arrears carried over from
-- before the society joined) is committee tier whatever its amount
-- (AGENTS.md item 12). A charge may name one flat (flat_set 'flat'), so a
-- flat's own arrears can be recorded. Everything else in propose_core is
-- unchanged from 03; create or replace keeps its privileges.

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
$function$;
