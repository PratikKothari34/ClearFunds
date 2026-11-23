-- A year's budget (#76, contracts/chain/kinds/budget.v1.md): set by the
-- committee, chained so approvals sign the amounts, invisible to every
-- balance, and reported beside actual figures as it moved.
begin;
select plan(38);

create temp table u (k text primary key, id uuid);
insert into u select k, gen_random_uuid() from unnest(array['pres', 'tre', 'sec', 'm1', 'm2', 'aud']) k;
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@b.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.cast_(k text, seq bigint) returns text language sql as $$
  select api_register_key(pg_temp.uid(k), 'soc_b', md5(k) || md5(k));
  select api_cast(pg_temp.uid(k), 'soc_b', seq, 'approve',
    (cf.latest_key('soc_b', cf.person(pg_temp.uid(k), 'soc_b'))).sequence, repeat('ab', 64))->>'status';
$$;
select api_open_society(jsonb_build_object('id', 'soc_b', 'name', 'Budget CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@b.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@b.test', 'role', 'treasurer', 'tasks', '["propose_expenses"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@b.test', 'role', 'secretary'),
    jsonb_build_object('name', 'M1', 'email', 'm1@b.test'), jsonb_build_object('name', 'M2', 'email', 'm2@b.test')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table s (k text primary key, seq bigint);
create function pg_temp.prop(k text, p jsonb) returns bigint language sql as $$
  select (api_propose(pg_temp.uid(k), 'soc_b', p)->>'seq')::bigint $$;
create function pg_temp.e(n bigint) returns chain_entries language sql as $$
  select * from chain_entries where society_id = 'soc_b' and sequence = n $$;
create function pg_temp.seq(k text) returns bigint language sql as $$ select seq from s where s.k = $1 $$;
create function pg_temp.fy() returns text language sql as $$ select cf.fy_of('soc_b', cf.today()) $$;
create function pg_temp.last_fy() returns text language sql as $$
  select cf.fy_of('soc_b', (cf.fy_bounds('soc_b', pg_temp.fy())).starts - 1) $$;
create function pg_temp.budget() returns jsonb language sql as $$
  select api_report('soc_b', pg_temp.fy())->'budget' $$;
create function pg_temp.line(side text, cat text) returns jsonb language sql as $$
  select x from jsonb_array_elements(pg_temp.budget()->side) x where x->>'category' = cat $$;

-- ---- what a budget proposal chains
insert into s select 'b1', pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.fy(),
  'narration', 'Budget as adopted at the AGM',
  'lines', '[{"category":"security","amount_minor":800000},{"category":" Lift ","amount_minor":100000}]'::jsonb,
  'income_lines', '[{"category":"hall","amount_minor":20000}]'::jsonb));
select is((pg_temp.e(pg_temp.seq('b1') - 1)).kind, 'budget_lines', 'the lines are the entry immediately before the proposal');
select is((pg_temp.e(pg_temp.seq('b1'))).prev_hash, (pg_temp.e(pg_temp.seq('b1') - 1)).entry_hash,
  'so the proposal''s hash, which every approval signs, covers the lines');
select is((pg_temp.e(pg_temp.seq('b1') - 1)).body - 'currency',
  jsonb_build_object('fy', pg_temp.fy(), 'categories', '["Lift","security"]'::jsonb, 'amounts_minor', '[100000,800000]'::jsonb,
    'income_categories', '["hall"]'::jsonb, 'income_amounts_minor', '[20000]'::jsonb),
  'trimmed, and in ascending byte order: capitals before lower case');
select is((pg_temp.e(pg_temp.seq('b1') - 1)).actor, (pg_temp.e(pg_temp.seq('b1'))).actor, 'both carry the proposer');
select is((select tier || ':' || required from proposals where society_id = 'soc_b' and seq = pg_temp.seq('b1')),
  'committee:4', 'a budget is committee tier: ceil(2*5/3) = 4, whatever the total');
select ok((pg_temp.e(pg_temp.seq('b1'))).body->'amount_minor' = 'null'::jsonb
      and (pg_temp.e(pg_temp.seq('b1'))).body->'category' = 'null'::jsonb, 'and it carries no amount and no category');
select is((select lines from proposals where society_id = 'soc_b' and seq = pg_temp.seq('b1')),
  '[{"category":"Lift","amount_minor":100000},{"category":"security","amount_minor":800000}]'::jsonb,
  'the proposals view shows the lines an approver is signing');
select is((select income_lines from proposals where society_id = 'soc_b' and seq = pg_temp.seq('b1')),
  '[{"category":"hall","amount_minor":20000}]'::jsonb, 'and the income lines');

-- ---- what is refused
select throws_like($$select pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.fy(), 'narration', 'x',
  'lines', '[{"category":"security","amount_minor":1},{"category":"security ","amount_minor":2}]'::jsonb))$$,
  '%security appears twice%', 'a category appears once');
select throws_like($$select pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.fy(), 'narration', 'x',
  'lines', '[{"category":"security","amount_minor":-1}]'::jsonb))$$, '%whole number of minor units%', 'no negative line');
select throws_like($$select pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.fy(), 'narration', 'x',
  'lines', '[{"category":"security","amount_minor":10.5}]'::jsonb))$$, '%whole number of minor units%', 'no fractional line');
select throws_like($$select pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.fy(), 'narration', 'x',
  'lines', '[{"category":"security","amount_minor":9007199254740992}]'::jsonb))$$, '%whole number of minor units%',
  'no line past 2^53 - 1');
select throws_like($$select pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.fy(), 'narration', 'x',
  'lines', '[{"category":"  ","amount_minor":1}]'::jsonb))$$, '%needs a category%', 'no blank category');
select throws_like($$select pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.fy(), 'narration', 'x',
  'lines', '[]'::jsonb, 'income_lines', '[]'::jsonb))$$, '%at least one line%', 'no empty budget');
select throws_like($$select pg_temp.prop('m1', '{"action":"budget","fy":"2026-28","narration":"x",
  "lines":[{"category":"a","amount_minor":1}]}')$$, '%look like 2025-26%', 'the year is a real financial year');

select throws_like($$select pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.fy(), 'narration', 'x',
  'lines', jsonb_build_array(jsonb_build_object('category', U&'caf\00e9', 'amount_minor', 1),
                             jsonb_build_object('category', U&'cafe\0301', 'amount_minor', 2))))$$,
  '%appears twice%', 'two spellings of one category are one category: NFC before the duplicate check');
select is(cf.budget_list(jsonb_build_array(jsonb_build_object('category', U&'e\0301x', 'amount_minor', 1),
                                           jsonb_build_object('category', U&'\00e9a', 'amount_minor', 2))),
  jsonb_build_array(jsonb_build_object('category', U&'\00e9a', 'amount_minor', 2),
                    jsonb_build_object('category', U&'\00e9x', 'amount_minor', 1)),
  'stored NFC, and sorted after normalising, so the chained list is strictly ascending');

-- ---- approval, and no balance sees it
select is(pg_temp.cast_('m1', pg_temp.seq('b1')) || pg_temp.cast_('m2', pg_temp.seq('b1')) || pg_temp.cast_('tre', pg_temp.seq('b1')),
  'openopenopen', 'three approvals do not set it');
select is(pg_temp.cast_('sec', pg_temp.seq('b1')), 'posted', 'the fourth does');
insert into s select 'p1', posted_seq from proposals where society_id = 'soc_b' and seq = pg_temp.seq('b1');
select is((pg_temp.e(pg_temp.seq('p1'))).body - 'proposal_seq',
  '{"effect":"budget","amount_minor":null,"currency":null,"limit_minor":null,"person":null,"role":null,"derived":null}'::jsonb,
  'it posts with effect budget and no amount');
select is((select count(*) from ledger where society_id = 'soc_b'), 0::bigint, 'and the ledger, so every balance, never sees it');
select is((api_report('soc_b', pg_temp.fy())->'balance_sheet'->>'cash_and_bank_minor')::bigint, 0::bigint,
  'cash is unchanged');

-- ---- the report, against actual figures
-- An expense in a budgeted category, one in a category with no line, and a
-- receipt against the income line. Below the limit: the pair posts them.
create function pg_temp.pair(p jsonb) returns text language sql as $$
  select pg_temp.cast_('tre', pg_temp.prop('tre', p)); select pg_temp.cast_('sec', (select max(sequence) from chain_entries
    where society_id = 'soc_b' and kind = 'proposal')) $$;
select pg_temp.pair('{"action":"expense","amount_minor":850000,"counterparty":"Guards","category":"security","narration":"Guards"}');
select pg_temp.pair('{"action":"expense","amount_minor":30000,"counterparty":"Plumber","category":"repairs","narration":"Leak"}');
select pg_temp.pair('{"action":"receipt","amount_minor":25000,"counterparty":"Hall booking","category":"hall","narration":"Hall"}');
select is(pg_temp.line('expenditure', 'security'),
  '{"category":"security","first_minor":800000,"final_minor":800000,"actual_minor":850000,"variance_minor":50000}'::jsonb,
  'an overspend is a positive variance, computed by the server');
select is(pg_temp.line('expenditure', 'Lift'),
  '{"category":"Lift","first_minor":100000,"final_minor":100000,"actual_minor":0,"variance_minor":-100000}'::jsonb,
  'a budgeted category with no spend reads 0 actual');
select is(pg_temp.budget()->'unbudgeted_expenditure', '[{"category":"repairs","actual_minor":30000}]'::jsonb,
  'spend with no budget line is listed as unbudgeted, never dropped');
select is(pg_temp.line('income', 'hall')->>'variance_minor', '5000', 'more income than budgeted is positive too');
select is(pg_temp.line('expenditure', 'security')->>'actual_minor',
  (select x->>'amount_minor' from jsonb_array_elements(api_report('soc_b', pg_temp.fy())->'income_expenditure'->'expenditure') x
    where x->>'category' = 'security'), 'actual is the report''s own expenditure line, so the two cannot disagree');
select is(api_report('soc_b', pg_temp.last_fy())->'budget', 'null'::jsonb, 'a year with no budget reports null');

-- ---- a revision
insert into s select 'b2', pg_temp.prop('tre', jsonb_build_object('action', 'budget', 'fy', pg_temp.fy(), 'narration', 'Revised',
  'lines', '[{"category":"security","amount_minor":900000},{"category":"gardening","amount_minor":50000}]'::jsonb));
select pg_temp.cast_(k, pg_temp.seq('b2')) from unnest(array['tre', 'sec', 'pres', 'm1']) k;
select is(jsonb_array_length(pg_temp.budget()->'revisions'), 2, 'both budgets stay in the report');
select ok((pg_temp.budget()->>'final_seq')::bigint > (pg_temp.budget()->>'first_seq')::bigint, 'the later one is in force');
select is(pg_temp.line('expenditure', 'Lift') - 'category' - 'actual_minor',
  '{"first_minor":100000,"final_minor":null,"variance_minor":null}'::jsonb,
  'a line the revision dropped keeps its first figure and has no final, not a zero');
select is(pg_temp.line('expenditure', 'gardening')->'first_minor', 'null'::jsonb, 'a line the revision added had no first');
select is(pg_temp.line('income', 'hall')->'final_minor', 'null'::jsonb, 'the revision budgeted no income, so hall has no final');

-- ---- revisions after the year ended
-- Every posting for last year lands after its last day. The second one lowers
-- security after the fact; it is disclosed, and the year is still measured
-- against the first.
create function pg_temp.late() returns jsonb language sql as $$
  select api_report('soc_b', pg_temp.last_fy())->'budget' $$;
insert into s select 'l1', pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.last_fy(),
  'narration', 'Recorded late', 'lines', '[{"category":"security","amount_minor":800000}]'::jsonb));
select pg_temp.cast_(k, pg_temp.seq('l1')) from unnest(array['m1', 'm2', 'tre', 'sec']) k;
insert into s select 'l2', pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.last_fy(),
  'narration', 'Lowered after the spend', 'lines', '[{"category":"security","amount_minor":1}]'::jsonb));
select pg_temp.cast_(k, pg_temp.seq('l2')) from unnest(array['m1', 'm2', 'tre', 'sec']) k;
select is((select bool_and((r->>'after_year_end')::boolean) || ':' || count(*) from jsonb_array_elements(pg_temp.late()->'revisions') r),
  'true:2', 'both revisions are listed, each marked as after the year ended');
select is(pg_temp.late()->>'final_seq', pg_temp.late()->>'first_seq',
  'a revision after the year ended is never the one in force');
select is(pg_temp.late()->'expenditure'->0->>'final_minor', '800000', 'so the lowered figure does not become the final');

-- ---- a closed year
select api_add_person('soc_b', 'Auditor', 'aud@b.test');
insert into s select 'b0', pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.last_fy(), 'narration', 'Late',
  'lines', '[{"category":"security","amount_minor":1}]'::jsonb));
select pg_temp.cast_(k, pg_temp.seq('b0')) from unnest(array['m1', 'm2', 'tre']) k;
insert into public.auditor_appointments (society_id, person_id, fy, appointment_seq, appointing_set)
  values ('soc_b', cf.person(pg_temp.uid('aud'), 'soc_b'), pg_temp.last_fy(), 1, array[gen_random_uuid()]);
select api_register_key(pg_temp.uid('aud'), 'soc_b', md5('aud') || md5('aud'));
select api_close_year(pg_temp.uid('aud'), 'soc_b', pg_temp.last_fy(), 'clean', 'Reasonable assurance.',
  (i->>'through_seq')::bigint, (i->>'key_seq')::bigint, repeat('ab', 64))
  from api_close_intent(pg_temp.uid('aud'), 'soc_b', pg_temp.last_fy(), 'clean', 'Reasonable assurance.') i;
select pg_temp.cast_('sec', pg_temp.seq('b0'));
select is((select state from proposals where society_id = 'soc_b' and seq = pg_temp.seq('b0')), 'year_closed',
  'a budget still open when its year closes is closed, not posted');
select throws_like($$select pg_temp.prop('m1', jsonb_build_object('action', 'budget', 'fy', pg_temp.last_fy(), 'narration', 'x',
  'lines', '[{"category":"security","amount_minor":1}]'::jsonb))$$, '%closed by its auditor%',
  'and no budget is proposed for a closed year');

select * from finish();
rollback;
