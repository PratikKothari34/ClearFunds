-- Opening entries and one-flat charges (#50): money owed from before the
-- society joined needs the committee whatever its size, and a flat's own
-- arrears can be charged to that flat alone, allocation stored as usual.
begin;
select plan(11);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('m1', gen_random_uuid()), ('m2', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@o.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.cast_(k text, seq bigint) returns text language sql as $$
  select api_register_key(pg_temp.uid(k), 'soc_o', md5(k) || md5(k));
  select api_cast(pg_temp.uid(k), 'soc_o', seq, 'approve',
    (cf.latest_key('soc_o', cf.person(pg_temp.uid(k), 'soc_o'))).sequence, repeat('ab', 64))->>'status';
$$;
select api_open_society(jsonb_build_object('id', 'soc_o', 'name', 'Opening CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@o.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@o.test', 'role', 'treasurer',
      'tasks', '["propose_expenses","raise_monthly_charges"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@o.test', 'role', 'secretary'),
    jsonb_build_object('name', 'M1', 'email', 'm1@o.test'), jsonb_build_object('name', 'M2', 'email', 'm2@o.test')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_o', 1, 'A-1'), ('soc_o', 2, 'A-2'), ('soc_o', 3, 'A-3');
create temp table s (k text primary key, seq bigint);
create function pg_temp.prop(p jsonb) returns bigint language sql as $$
  select (api_propose(pg_temp.uid('tre'), 'soc_o', p)->>'seq')::bigint $$;
create function pg_temp.body(k text) returns jsonb language sql as $$
  select body from chain_entries where society_id = 'soc_o' and sequence = (select seq from s where s.k = $1) $$;

-- ---- opening goes to the committee, whatever its size
insert into s select 'bal', pg_temp.prop('{"action":"receipt","amount_minor":50000,"counterparty":"Previous committee",
  "category":"opening","narration":"Balance brought forward"}');
select is(pg_temp.body('bal')->>'tier' || ':' || (pg_temp.body('bal')->>'required'), 'committee:4',
  'an opening balance below the limit still needs ceil(2*5/3) = 4');
insert into s select 'rcpt', pg_temp.prop('{"action":"receipt","amount_minor":50000,"counterparty":"Hall booking",
  "category":"hall","narration":"Hall hire"}');
select is(pg_temp.body('rcpt')->>'tier', 'pair', 'the same amount under any other category is the pair, as before');
select is(pg_temp.cast_('tre', (select seq from s where k = 'bal')) || '/' || pg_temp.cast_('sec', (select seq from s where k = 'bal')),
  'open/open', 'so the treasurer and secretary together do not post it');

-- ---- one flat's arrears
select throws_like($$select pg_temp.prop('{"action":"charge","amount_minor":750000,"flat_set":"flat",
  "flat_id":"flt_nope","category":"opening","narration":"Arrears"}')$$, '%unknown flat%', 'a one-flat charge names a real flat');
select throws_like($$select pg_temp.prop('{"action":"charge","amount_minor":100,"flat_set":"tower-b","narration":"x"}')$$,
  '%unknown flat set%', 'other flat sets are still refused');
insert into s select 'arr', pg_temp.prop(jsonb_build_object('action', 'charge', 'amount_minor', 750001, 'flat_set', 'flat',
  'flat_id', (select id from flats where label = 'A-2'), 'category', 'opening', 'narration', 'Arrears to March 2026'));
select is(pg_temp.body('arr')->'flat_ids', jsonb_build_array((select id from flats where label = 'A-2')),
  'the allocation names that flat alone');
select is((pg_temp.body('arr')->'line_amounts') || (pg_temp.body('arr')->'remainder_flats'), '[750001]'::jsonb,
  'for the whole amount, odd paisa included, with no remainder to rotate');
select is(pg_temp.body('arr')->>'tier', 'committee', 'opening arrears are committee tier too');
select pg_temp.cast_(k, (select seq from s where k = 'arr')) from unnest(array['tre', 'sec', 'pres']) k;
select is(pg_temp.cast_('m1', (select seq from s where k = 'arr')), 'posted', 'four approvals post it');
select is((select jsonb_object_agg(label, outstanding_minor) from flat_dues where society_id = 'soc_o'),
  '{"A-1": 0, "A-2": 750001, "A-3": 0}'::jsonb, 'only that flat owes it');

-- ---- reversing it needs the committee as well
insert into s select 'rev', pg_temp.prop(jsonb_build_object('action', 'reversal',
  'target_seq', (select sequence from chain_entries where society_id = 'soc_o' and kind = 'posting'
                  and (body->>'proposal_seq')::bigint = (select seq from s where k = 'arr')),
  'reason', 'Wrong flat', 'narration', 'Reverse arrears'));
select is(pg_temp.body('rev')->>'tier', 'committee', 'a reversal of an opening entry is at least its tier');

select * from finish();
rollback;
