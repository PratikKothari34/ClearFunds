-- Lookup (#19): any member finds an entry by fingerprint, prefix, number or
-- id, sees what links to it, and a miss is an empty answer, not an accusation.
begin;
select plan(17);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('res', gen_random_uuid()), ('stranger', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@l.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.cast_(k text, seq bigint) returns text language sql as $$
  select api_register_key(pg_temp.uid(k), 'soc_l', md5(k) || md5(k));
  select api_cast(pg_temp.uid(k), 'soc_l', seq, 'approve',
    (cf.latest_key('soc_l', cf.person(pg_temp.uid(k), 'soc_l'))).sequence, repeat('ab', 64))->>'status';
$$;
select api_open_society(jsonb_build_object('id', 'soc_l', 'name', 'Look CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@l.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@l.test', 'role', 'treasurer', 'tasks', '["propose_expenses"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@l.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('bc', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_l', 1, 'A-1');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_l', api_add_person('soc_l', 'Res', 'res@l.test'), (select id from flats where society_id = 'soc_l'), 'owner');
create temp table s (k text primary key, seq bigint);
insert into s select 'p', (api_propose(pg_temp.uid('tre'), 'soc_l', '{"action":"expense","amount_minor":5000,
  "counterparty":"Om Stationers","category":"office","narration":"Registers"}')->>'seq')::bigint;
select pg_temp.cast_('tre', (select seq from s where k = 'p'));
select pg_temp.cast_('sec', (select seq from s where k = 'p'));
insert into s select 'post', sequence from chain_entries where society_id = 'soc_l' and kind = 'posting';
select pg_temp.as_('res');
insert into s select 'flag', api_raise_flag('soc_l', jsonb_build_object('scope', 'entries',
  'target_seqs', jsonb_build_array((select seq from s where k = 'post')), 'text', 'Which registers?'));
create function pg_temp.seq(k text) returns bigint language sql as $$ select seq from s where s.k = $1 $$;
create function pg_temp.hash(n bigint) returns text language sql as $$
  select encode(entry_hash, 'hex') from chain_entries where society_id = 'soc_l' and sequence = n $$;
create function pg_temp.has(r jsonb, n bigint, m text) returns boolean language sql as $$
  select r @> jsonb_build_array(jsonb_build_object('seq', n, 'matched_on', m)) $$;
create function pg_temp.rel(n bigint, rel text) returns int language sql as $$
  select count(*)::int from jsonb_array_elements(api_entry_context('soc_l', n)->'links') x where x->>'relation' = rel $$;
grant select on u, s to authenticated;
set local role authenticated;

select ok(pg_temp.has(api_lookup('soc_l', pg_temp.hash(pg_temp.seq('p'))), pg_temp.seq('p'), 'entry_hash'),
  'a full fingerprint finds its entry');
select ok(pg_temp.has(api_lookup('soc_l', pg_temp.hash(pg_temp.seq('p'))), pg_temp.seq('p') + 1, 'prev_hash'),
  'and the entry after it, which links to it');
select is((select count(*)::int from jsonb_array_elements(api_lookup('soc_l', pg_temp.hash(pg_temp.seq('p')))) x
            where x->>'matched_on' = 'proposal_hash'), 2, 'and the two approvals that signed it');
select ok(pg_temp.has(api_lookup('soc_l', '  ' || upper(left(pg_temp.hash(pg_temp.seq('post')), 10)) || ' '), pg_temp.seq('post'), 'entry_hash'),
  'a prefix of 8 or more finds it, whatever the case and spacing');
select throws_like($$select api_lookup('soc_l', 'abc123')$$, '%at least its first 8 characters%',
  'a short prefix is refused with what to paste instead');
select ok(pg_temp.has(api_lookup('soc_l', repeat('bc', 32)), 2, 'file_sha256'), 'the minutes'' fingerprint finds its entry');
select ok(pg_temp.has(api_lookup('soc_l', pg_temp.seq('p')::text), pg_temp.seq('p'), 'seq'), 'an entry number finds it');
select is(api_lookup('soc_l', 'V-' || pg_temp.seq('p')), '[]'::jsonb, 'an id of the wrong kind finds nothing');
select is(api_lookup('soc_l', repeat('1', 64)), '[]'::jsonb, 'an unknown fingerprint is an empty answer, not an error');

select is(pg_temp.rel(pg_temp.seq('p'), 'approved_by'), 2, 'a proposal links to its approvals');
select is(pg_temp.rel(pg_temp.seq('p'), 'posted_as'), 1, 'and its posting');
select is(pg_temp.rel(pg_temp.seq('post'), 'flagged_by'), 1, 'a posting links to the dispute about it');
select is(pg_temp.rel(pg_temp.seq('flag'), 'about'), 1, 'and the dispute back to it');
select is(pg_temp.rel(pg_temp.seq('p') + 2, 'signed_with'), 1, 'an approval links to the key that signed it');
select is((select jsonb_agg(x->>'screen' order by x->>'screen') from jsonb_array_elements(api_entry_context('soc_l', pg_temp.seq('post'))->'appears_in') x),
  '["ledger", "year_close"]'::jsonb, 'an expense posting appears in the ledger and its year');
select is(api_entry_context('soc_l', pg_temp.seq('p'))->'entry'->>'entry_hash', pg_temp.hash(pg_temp.seq('p')),
  'the raw entry comes back for the client to recompute');

select pg_temp.as_('stranger');
select throws_like($$select api_lookup('soc_l', '1')$$, '%no account%', 'a stranger looks up nothing');

select * from finish();
rollback;
