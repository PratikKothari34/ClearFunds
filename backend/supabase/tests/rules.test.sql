-- The approval and correction rules, exercised end to end through the same
-- functions the edge functions call. Signatures are placeholders here: what
-- is under test is who may cast, what counts, and what posts.
begin;
select plan(51);

-- Five admins: president, treasurer, secretary, two members. Ten flats.
create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('m1', gen_random_uuid()), ('m2', gen_random_uuid()), ('res', gen_random_uuid()), ('res2', gen_random_uuid()),
  ('new', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@t.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;

select lives_ok($$select api_open_society(jsonb_build_object('id', 'soc_t', 'name', 'Test CHS',
  'approval_limit_minor', 1000000, 'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@t.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@t.test', 'role', 'treasurer'),
    jsonb_build_object('name', 'S', 'email', 'sec@t.test', 'role', 'secretary'),
    jsonb_build_object('name', 'M1', 'email', 'm1@t.test'),
    jsonb_build_object('name', 'M2', 'email', 'm2@t.test'))))$$, 'a society opens with its committee');

insert into public.flats (society_id, ordinal, label, has_parking, joined_on)
  select 'soc_t', g, 'A-' || (100 + g), g % 2 = 0, '2020-01-01' from generate_series(1, 10) g;

create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.prop(k text, p jsonb) returns bigint language sql as
  $$ select (api_propose(pg_temp.uid(k), 'soc_t', p)->>'seq')::bigint $$;
create function pg_temp.cast_(k text, seq bigint, d text default 'approve') returns text language sql as $$
  select api_register_key(pg_temp.uid(k), 'soc_t', md5(k) || md5(k));
  select api_cast(pg_temp.uid(k), 'soc_t', seq, d,
    (cf.latest_key('soc_t', cf.person(pg_temp.uid(k), 'soc_t'))).sequence, repeat('ab', 64))->>'status';
$$;

select is((select count(*)::int from public.people where society_id = 'soc_t' and auth_user_id is not null), 5,
  'people link to their auth account by email');
select is(cf.seated('soc_t'), 5, 'five seated');
select is(cf.required_committee('soc_t'), 4, 'ceil(2*5/3) = 4, never 3 of 5');

-- ---- pair tier
create temp table s (k text primary key, seq bigint);
insert into s values ('e1', pg_temp.prop('tre', '{"action":"expense","amount_minor":250000,
  "counterparty":"Shree Sai Plumbing","category":"repairs","narration":"Pump repair"}'));
select is((select body->>'tier' from chain_entries where society_id = 'soc_t' and sequence = (select seq from s where k = 'e1')),
  'pair', 'at or below the limit is the pair tier');
select throws_like($$select pg_temp.cast_('m1', (select seq from s where k = 'e1'))$$,
  '%only the treasurer and the secretary%', 'a member cannot approve a pair-tier entry');
select is(pg_temp.cast_('tre', (select seq from s where k = 'e1')), 'open', 'treasurer alone does not post');
select throws_like($$select pg_temp.cast_('tre', (select seq from s where k = 'e1'))$$,
  '%already responded%', 'no admin approves twice');
select is(pg_temp.cast_('sec', (select seq from s where k = 'e1')), 'posted', 'treasurer and secretary together post');
select is((select amount_minor from ledger where society_id = 'soc_t' and proposal_seq = (select seq from s where k = 'e1')),
  -250000::bigint, 'an expense posts as a negative cash movement');

-- ---- committee tier
insert into s values ('e2', pg_temp.prop('tre', '{"action":"expense","amount_minor":5000000,
  "counterparty":"Otis","category":"lift","narration":"Lift overhaul"}'));
select is((select body->>'tier' from chain_entries where society_id = 'soc_t' and sequence = (select seq from s where k = 'e2')),
  'committee', 'above the limit is the committee tier');
select is(pg_temp.cast_('tre', (select seq from s where k = 'e2')), 'open', '1 of 4');
select is(pg_temp.cast_('sec', (select seq from s where k = 'e2')), 'open', '2 of 4');
select is(pg_temp.cast_('m1', (select seq from s where k = 'e2')), 'open', '3 of 4 does not post');

-- Snapshot: an admin resigns mid-approval. M drops to 4 (ceil = 3) but the
-- proposal still needs the 4 it asked for.
insert into s values ('un', pg_temp.prop('pres', jsonb_build_object('action', 'unseat_admin',
  'person', cf.person(pg_temp.uid('m2'), 'soc_t'), 'narration', 'M2 resigned')));
select pg_temp.cast_('pres', (select seq from s where k = 'un'));
select pg_temp.cast_('tre', (select seq from s where k = 'un'));
select pg_temp.cast_('sec', (select seq from s where k = 'un'));
select is(pg_temp.cast_('m1', (select seq from s where k = 'un')), 'posted', 'unseat posts at 4 of 5');
select is(cf.seated('soc_t'), 4, 'four seated after resignation');
select is((select state from proposals where society_id = 'soc_t' and seq = (select seq from s where k = 'e2')),
  'open', 'three approvals collected under M=5 do not become sufficient when M drops');
select is(pg_temp.cast_('pres', (select seq from s where k = 'e2')), 'posted', 'the fourth approval posts it');

-- ---- reversal
insert into s values ('r1', pg_temp.prop('tre', jsonb_build_object('action', 'reversal',
  'target_seq', (select seq from ledger where society_id = 'soc_t' and proposal_seq = (select seq from s where k = 'e2')),
  'narration', 'Reverse duplicate', 'reason', 'Invoice entered twice')));
select is((select body->>'tier' from chain_entries where society_id = 'soc_t' and sequence = (select seq from s where k = 'r1')),
  'committee', 'a reversal needs at least the tier of what it reverses');
insert into s values ('r2', pg_temp.prop('sec', jsonb_build_object('action', 'reversal',
  'target_seq', (select seq from ledger where society_id = 'soc_t' and proposal_seq = (select seq from s where k = 'e2')),
  'narration', 'Reverse it', 'reason', 'Same')));
select pg_temp.cast_('tre', (select seq from s where k = 'r1'));
select pg_temp.cast_('sec', (select seq from s where k = 'r1'));
select is(pg_temp.cast_('pres', (select seq from s where k = 'r1')), 'posted', 'reversal posts at 3 of 4 (snapshot M=4)');
select is((select state from proposals where society_id = 'soc_t' and seq = (select seq from s where k = 'r2')),
  'superseded', 'the competing in-flight reversal is superseded, not posted');
select is((select sum(amount_minor)::bigint from ledger where society_id = 'soc_t'
            and (proposal_seq = (select seq from s where k = 'e2') or proposal_seq = (select seq from s where k = 'r1'))),
  0::bigint, 'a reversed pair nets to zero by construction');
select throws_like($$select pg_temp.prop('tre', jsonb_build_object('action', 'reversal',
  'target_seq', (select seq from ledger where society_id = 'soc_t' and proposal_seq = (select seq from s where k = 'e2')),
  'narration', 'Again', 'reason', 'x'))$$, '%at most once%', 'an entry is reversed at most once');
select throws_like($$select pg_temp.prop('tre', jsonb_build_object('action', 'reversal',
  'target_seq', (select seq from ledger where society_id = 'soc_t' and proposal_seq = (select seq from s where k = 'r1')),
  'narration', 'Undo', 'reason', 'x'))$$, '%only a posted expense%', 'a reversal cannot itself be reversed');
select throws_like($$select pg_temp.prop('tre', jsonb_build_object('action', 'reversal',
  'target_seq', (select seq from ledger where society_id = 'soc_t' and proposal_seq = (select seq from s where k = 'e1')),
  'narration', 'Undo'))$$, '%reason is required%', 'a reversal carries a mandatory reason');

-- ---- allocation
insert into s values ('c1', pg_temp.prop('tre', '{"action":"charge","amount_minor":100003,
  "narration":"Maintenance Nov","flat_set":"all"}'));
select is((select jsonb_array_length(body->'remainder_flats') from chain_entries
            where society_id = 'soc_t' and sequence = (select seq from s where k = 'c1')),
  3, 'remainder of 3 paise goes to 3 flats');
select is((select sum(v::bigint)::bigint from chain_entries, jsonb_array_elements_text(body->'line_amounts') v
            where society_id = 'soc_t' and sequence = (select seq from s where k = 'c1')),
  100003::bigint, 'lines sum to the total exactly');
select pg_temp.cast_('tre', (select seq from s where k = 'c1'));
select pg_temp.cast_('sec', (select seq from s where k = 'c1'));
insert into s values ('c2', pg_temp.prop('tre', '{"action":"charge","amount_minor":100003,
  "narration":"Maintenance Dec","flat_set":"all"}'));
select is((select count(*)::int from chain_entries c1, chain_entries c2,
             jsonb_array_elements_text(c1.body->'remainder_flats') a, jsonb_array_elements_text(c2.body->'remainder_flats') b
            where c1.society_id = 'soc_t' and c2.society_id = 'soc_t'
              and c1.sequence = (select seq from s where k = 'c1') and c2.sequence = (select seq from s where k = 'c2')
              and a = b), 0, 'the next remainder goes to flats that have not had it');
select pg_temp.cast_('tre', (select seq from s where k = 'c2'));
select pg_temp.cast_('sec', (select seq from s where k = 'c2'));
select is((select sum(outstanding_minor)::bigint from flat_dues where society_id = 'soc_t'), 200006::bigint,
  'dues outstanding equal the two charges');
insert into s values ('cr', pg_temp.prop('tre', jsonb_build_object('action', 'reversal',
  'target_seq', (select seq from ledger where society_id = 'soc_t' and proposal_seq = (select seq from s where k = 'c2')),
  'narration', 'Wrong month', 'reason', 'Raised twice')));
select is((select body->'line_amounts' from chain_entries where society_id = 'soc_t' and sequence = (select seq from s where k = 'cr')),
  (select (select jsonb_agg(-(v::bigint) order by o) from jsonb_array_elements_text(body->'line_amounts') with ordinality x(v, o))
     from chain_entries where society_id = 'soc_t' and sequence = (select seq from s where k = 'c2')),
  'a charge reversal negates the stored lines one by one');
select pg_temp.cast_('tre', (select seq from s where k = 'cr'));
select pg_temp.cast_('sec', (select seq from s where k = 'cr'));
select is((select sum(outstanding_minor)::bigint from flat_dues where society_id = 'soc_t'), 100003::bigint,
  'every flat is back to exactly one charge, no residue');
select is((select count(*)::int from flat_dues where society_id = 'soc_t' and outstanding_minor not in (10000, 10001)), 0,
  'no flat carries a one-paisa residue after the reversal');

-- ---- limit
insert into s values ('l1', pg_temp.prop('pres', '{"action":"limit_change","amount_minor":0,"narration":"Safer"}'));
select is((select body->>'tier' from chain_entries where society_id = 'soc_t' and sequence = (select seq from s where k = 'l1')),
  'committee', 'changing the limit is the committee tier');
select pg_temp.cast_('pres', (select seq from s where k = 'l1'));
select pg_temp.cast_('tre', (select seq from s where k = 'l1'));
select is(pg_temp.cast_('sec', (select seq from s where k = 'l1')), 'posted', 'the limit change posts');
select is((cf.limit_in_force('soc_t')).limit_minor, 0::bigint, 'the limit in force is read from the chain');
insert into s values ('e3', pg_temp.prop('tre', '{"action":"expense","amount_minor":100,
  "counterparty":"Tea","category":"misc","narration":"Tea"}'));
select is((select body->>'tier' from chain_entries where society_id = 'soc_t' and sequence = (select seq from s where k = 'e3')),
  'committee', 'a limit of zero makes every entry N-of-M');

-- ---- flags
insert into public.people (society_id, full_name, email) values ('soc_t', 'R', 'res@t.test');
update public.people set auth_user_id = pg_temp.uid('res') where email = 'res@t.test';
insert into public.tenures (society_id, flat_id, person_id, kind)
  values ('soc_t', (select id from flats where society_id = 'soc_t' and ordinal = 1),
          (select id from people where email = 'res@t.test'), 'owner');
grant select on u, s to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('res'), 'role', 'authenticated')::text, true);
select ok(api_raise_flag('soc_t', jsonb_build_object('scope', 'entries', 'target_seqs',
  jsonb_build_array((select seq from ledger where proposal_seq = (select seq from s where k = 'e1'))), 'text', 'Why so much?')) > 0,
  'a resident raises a dispute');
select throws_like($$select api_raise_flag('soc_t', jsonb_build_object('scope', 'entries', 'target_seqs',
  jsonb_build_array((select seq from ledger where proposal_seq = (select seq from s where k = 'e1'))), 'text', 'Again'))$$,
  '%already have an open dispute%', 'at most one open flag per resident per entry');
select matches((select handle from disputes limit 1), '^r_[0-9a-f]{16}$', 'the dispute carries a pseudonym, not an identity');
select is((select count(*)::int from people where society_id = 'soc_t'), 6, 'a resident sees committee members and themselves only');
select throws_like($$select api_resolve_handle('soc_t', (select handle from disputes limit 1))$$,
  '%only the committee%', 'a resident cannot unmask a handle');
select is((select count(*)::int from ledger where society_id = 'soc_t') > 0, true, 'a member reads the ledger view');

-- A signed-in stranger: an auth user with no people row anywhere.
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('new'), 'role', 'authenticated')::text, true);
select is((select count(*)::int from ledger), 0, 'a stranger reads nothing from the ledger view');
select is((select count(*)::int from proposals), 0, 'a stranger reads no proposals');
select is((select count(*)::int from disputes), 0, 'a stranger reads no disputes');
select is((select count(*)::int from flat_dues), 0, 'a stranger reads no dues');
select is((select count(*)::int from chain_entries), 0, 'a stranger reads no chain entries');
select throws_ok($$select api_propose(pg_temp.uid('new'), 'soc_t', '{}')$$, '42501', null,
  'a signed-in user cannot call the signing-only propose function directly');
select throws_ok($$select api_cast(pg_temp.uid('tre'), 'soc_t', 1, 'approve', 1, 'ab')$$, '42501', null,
  'nor cast an approval with a signature of their choosing');
reset role;

-- ---- append-only
select throws_ok($$update chain_entries set actor = 'x' where society_id = 'soc_t' and sequence = 1$$,
  '42501', null, 'an entry cannot be updated');
select throws_ok($$delete from chain_entries where society_id = 'soc_t'$$, '42501', null, 'an entry cannot be deleted');

select * from finish();
rollback;
