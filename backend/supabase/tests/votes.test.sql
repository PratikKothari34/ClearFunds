-- Votes (#18): one ballot per eligible flat, never naming a person; tallies
-- hidden until close; a carried option may be cited without changing the
-- proposal's approvals.
begin;
select plan(19);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('own', gen_random_uuid()), ('ten', gen_random_uuid()), ('two', gen_random_uuid()), ('late', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@v.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_v', 'name', 'Vote CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@v.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@v.test', 'role', 'treasurer', 'tasks', '["propose_expenses"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@v.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_v', 1, 'A-1'), ('soc_v', 2, 'A-2'), ('soc_v', 3, 'A-3');
create temp table f as select label, id from public.flats where society_id = 'soc_v';
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_v', api_add_person('soc_v', 'Own', 'own@v.test'), (select id from f where label = 'A-1'), 'owner');
select api_add_tenure('soc_v', api_add_person('soc_v', 'Ten', 'ten@v.test'), (select id from f where label = 'A-1'), 'tenant');
select api_add_tenure('soc_v', api_add_person('soc_v', 'Two', 'two@v.test'), (select id from f where label = 'A-2'), 'owner');

-- Publish a notice carrying a vote: the president's draft and the treasurer's approval make 2 of 3.
create temp table vs (k text primary key, seq bigint);
create function pg_temp.publish(k text, mode text, picks int) returns bigint language plpgsql as $$
declare d bigint;
begin
  perform pg_temp.as_('pres');
  d := (api_notice_draft('soc_v', null, jsonb_build_object('title', 'Vote ' || k, 'body', 'Please vote.',
    'vote', jsonb_build_object('question', 'Which?', 'options', '["Alpha","Beta","Gamma"]'::jsonb, 'max_picks', picks,
      'mode', mode, 'closes_at', (extract(epoch from now() + interval '2 days') * 1000)::bigint)))->>'draft_id')::bigint;
  perform pg_temp.as_('tre');
  perform api_notice_review('soc_v', d, 1, 'approve', null);
  return (api_publish_notice(pg_temp.uid('pres'), 'soc_v', d)->>'vote_seq')::bigint;
end $$;
insert into vs select 'anon', pg_temp.publish('anon', 'anonymous', 1);
create function pg_temp.v(k text) returns bigint language sql as $$ select seq from vs where vs.k = $1 $$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_v', api_add_person('soc_v', 'Late', 'late@v.test'), (select id from f where label = 'A-3'), 'owner');
select throws_like($$select api_ballot(pg_temp.uid('late'), 'soc_v', pg_temp.v('anon'), '{0}')$$,
  '%eligible when the vote opened%', 'a flat that joined after the vote opened cannot vote');
select throws_like($$select api_ballot(pg_temp.uid('own'), 'soc_v', pg_temp.v('anon'), '{0,1}')$$,
  '%pick 1 to 1%', 'a single-choice vote takes one option');
select throws_like($$select api_ballot(pg_temp.uid('own'), 'soc_v', pg_temp.v('anon'), '{3}')$$,
  '%pick 1 to 1%', 'an option that does not exist is refused');
select lives_ok($$select api_ballot(pg_temp.uid('ten'), 'soc_v', pg_temp.v('anon'), '{1}')$$,
  'a tenant who lives there votes for the flat');
select throws_like($$select api_ballot(pg_temp.uid('own'), 'soc_v', pg_temp.v('anon'), '{0}')$$,
  '%already voted%', 'then the owner cannot: one ballot per flat');
select lives_ok($$select api_ballot(pg_temp.uid('two'), 'soc_v', pg_temp.v('anon'), '{1}')$$, 'a second flat votes');

select ok((select actor is null and body->'flat_id' = 'null'::jsonb
              and body->>'flat_token' = cf.flat_token('soc_v', pg_temp.v('anon'), (select id from f where label = 'A-1'))
             from chain_entries where society_id = 'soc_v' and kind = 'ballot' order by sequence limit 1),
  'an anonymous ballot carries only the flat token: no actor, no flat');
select ok(not exists (select 1 from chain_entries where society_id = 'soc_v' and kind = 'ballot'
                       and (body::text like '%r\_%' or body::text like '%' || pg_temp.uid('ten')::text || '%')),
  'no ballot names a person or a pseudonym');

grant select on u, f, vs to authenticated;
set local role authenticated;
select pg_temp.as_('own');
select is((select (vote->>'tallies') is null and (vote->>'my_flat_voted')::boolean from notices where title = 'Vote anon'), true,
  'before close: tallies hidden, but my flat sees it has voted');
reset role;

update public.votes set closes_at = now() - interval '1 second' where vote_seq = pg_temp.v('anon');
select cf.close_due_votes();
select is((select body->'tallies' from chain_entries where society_id = 'soc_v' and kind = 'vote_closed'), '[0, 2, 0]'::jsonb,
  'closing chains the tallies');
select is((select (body->>'carried')::int from chain_entries where society_id = 'soc_v' and kind = 'vote_closed'), 1,
  'and the carried option');
select throws_like($$select api_ballot(pg_temp.uid('own'), 'soc_v', pg_temp.v('anon'), '{0}')$$, '%closed%',
  'no ballot after close');

-- ---- citing
select throws_like($$select api_propose(pg_temp.uid('tre'), 'soc_v', jsonb_build_object('action', 'expense',
  'amount_minor', 5000, 'counterparty', 'Beta Ltd', 'category', 'repairs', 'narration', 'Terrace',
  'vote_seq', pg_temp.v('anon'), 'vote_option', 0))$$, '%did not carry that option%', 'citing an option that did not carry is refused');
select lives_ok($$select api_propose(pg_temp.uid('tre'), 'soc_v', jsonb_build_object('action', 'expense',
  'amount_minor', 5000, 'counterparty', 'Beta Ltd', 'category', 'repairs', 'narration', 'Terrace',
  'vote_seq', pg_temp.v('anon'), 'vote_option', 1))$$, 'citing the carried option works');
select is((select actor from chain_entries where society_id = 'soc_v' and kind = 'proposal_ref'),
  cf.person(pg_temp.uid('tre'), 'soc_v')::text, 'the citation is chained under the proposer');
select is((select body->>'tier' || ':' || (body->>'required') from chain_entries where society_id = 'soc_v' and kind = 'proposal'),
  'pair:2', 'and the proposal still needs the pair: a vote is evidence, not an approval');

-- ---- a tie carries nothing; a named multi-choice vote shows each flat's choice
insert into vs select 'named', pg_temp.publish('named', 'named', 2);
select api_ballot(pg_temp.uid('own'), 'soc_v', pg_temp.v('named'), '{2,0}');
select api_ballot(pg_temp.uid('two'), 'soc_v', pg_temp.v('named'), '{1}');
select is((select body->'options' from chain_entries where society_id = 'soc_v' and kind = 'ballot'
            and (body->>'vote_seq')::bigint = pg_temp.v('named') and body->>'flat_id' = (select id from f where label = 'A-1')),
  '[0, 2]'::jsonb, 'a named ballot carries its flat, options in ascending order');
update public.votes set closes_at = now() - interval '1 second' where vote_seq = pg_temp.v('named');
select cf.close_due_votes();
select is((select carried from votes where vote_seq = pg_temp.v('named')), null, 'a multi-choice vote carries nothing');
set local role authenticated;
select pg_temp.as_('two');
select is((select jsonb_array_length(vote->'ballots') from notices where title = 'Vote named'), 2,
  'after close, a named vote shows each flat''s ballot');
reset role;

select * from finish();
rollback;
