-- Open questions per month, for its sign-off (#70): flags, the postings they
-- concern and the residents who raised them are three different numbers, and
-- only the flagging resident closes a flag.
begin;
select plan(9);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('r1', gen_random_uuid()), ('r2', gen_random_uuid()), ('r3', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@s.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_s', 'name', 'Signoff CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@s.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@s.test', 'role', 'treasurer', 'tasks', '["propose_expenses","respond_to_flags"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@s.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_s', 1, 'A-1'), ('soc_s', 2, 'A-2'), ('soc_s', 3, 'A-3');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_s', api_add_person('soc_s', k, k || '@s.test'),
  (select id from public.flats where society_id = 'soc_s' and label = 'A-' || right(k, 1)), 'owner')
  from unnest(array['r1', 'r2', 'r3']) k;

create function pg_temp.spend(payee text, d date) returns bigint language plpgsql as $$
declare s bigint; k text;
begin
  s := (api_propose(pg_temp.uid('tre'), 'soc_s', jsonb_build_object('action', 'expense', 'amount_minor', 10000,
    'counterparty', payee, 'category', 'repairs', 'narration', payee, 'business_date', d))->>'seq')::bigint;
  foreach k in array array['tre', 'sec'] loop
    perform api_register_key(pg_temp.uid(k), 'soc_s', md5(k) || md5(k));
    perform api_cast(pg_temp.uid(k), 'soc_s', s, 'approve',
      (cf.latest_key('soc_s', cf.person(pg_temp.uid(k), 'soc_s'))).sequence, repeat('ab', 64));
  end loop;
  return (select sequence from chain_entries where society_id = 'soc_s' and kind = 'posting' and (body->>'proposal_seq')::bigint = s);
end $$;
create temp table p (k text primary key, seq bigint);
create temp table m as select to_char(cf.today(), 'YYYY-MM') as now_, to_char(cf.today() - interval '1 month', 'YYYY-MM') as prev;
insert into p select 'a', pg_temp.spend('Vendor X', cf.today());
insert into p select 'b', pg_temp.spend('Otis', cf.today());
insert into p select 'c', pg_temp.spend('Otis', (cf.today() - interval '1 month')::date);
grant select on u, p, m to authenticated;

create temp table fl (k text primary key, seq bigint);
grant select, insert on fl to authenticated;
create function pg_temp.flag(who text, p jsonb) returns void language sql as $$
  select pg_temp.as_(who);
  insert into fl values (who || ':' || (p->>'scope'), api_raise_flag('soc_s', p));
$$;
set local role authenticated;
select pg_temp.flag('r1', jsonb_build_object('scope', 'entries', 'target_seqs', jsonb_build_array((select seq from p where k = 'a')), 'text', 'Why so much?'));
select pg_temp.flag('r2', jsonb_build_object('scope', 'entries', 'target_seqs', jsonb_build_array((select seq from p where k = 'a')), 'text', 'Same question'));
select pg_temp.flag('r3', jsonb_build_object('scope', 'counterparty', 'counterparty', 'otis', 'text', 'Every Otis bill'));
select pg_temp.flag('r1', jsonb_build_object('scope', 'period', 'period', (select now_ from m), 'text', 'This month overall'));

create function pg_temp.month(k text) returns text language sql as $$
  select (x->>'open_flags') || '/' || (x->>'open_flag_entries') || '/' || (x->>'open_flag_residents')
    from jsonb_array_elements(api_signoff_months('soc_s')) x where x->>'month' = (select case k when 'now' then now_ else prev end from m) $$;

select pg_temp.as_('r1');
select throws_like($$select api_signoff_months('soc_s')$$, '%only the committee%', 'a resident cannot read sign-off months');
select pg_temp.as_('pres');
select is(pg_temp.month('now'), '4/2/3',
  'this month: four open flags, on two postings, from three residents (two on one posting, one payee flag, one period flag)');
select is(pg_temp.month('prev'), '1/1/1', 'a payee flag also concerns that payee''s posting last month, matched without case');
select is((select (x->>'postings')::int from jsonb_array_elements(api_signoff_months('soc_s')) x
            where x->>'month' = (select now_ from m)), 2, 'each month says how many postings it has');

select pg_temp.as_('tre');
select api_flag_note('soc_s', (select seq from fl where k = 'r2:entries'), 'response', 'Invoice attached');
select pg_temp.as_('pres');
select is(pg_temp.month('now'), '4/2/3', 'an admin response closes nothing');
select pg_temp.as_('r2');
select api_flag_note('soc_s', (select seq from fl where k = 'r2:entries'), 'resolved', 'Thanks');
select pg_temp.as_('pres');
select is(pg_temp.month('now'), '3/2/2', 'the flagging resident resolving it does');
select pg_temp.as_('r3');
select api_flag_note('soc_s', (select seq from fl where k = 'r3:counterparty'), 'raised_in_error', null);
select pg_temp.as_('pres');
select is(pg_temp.month('now') || ' ' || pg_temp.month('prev'), '2/1/1 0/0/0', 'and so does raising it in error');
select is((select x->>'signed_off_seq' from jsonb_array_elements(api_signoff_months('soc_s')) x
            where x->>'month' = (select now_ from m)), null, 'an unsigned month has no sign-off');
select is((select x->>'month' from jsonb_array_elements(api_signoff_months('soc_s')) x limit 1), (select now_ from m),
  'newest month first');
reset role;

select * from finish();
rollback;
