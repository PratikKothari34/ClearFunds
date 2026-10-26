-- Notices (#18): the president drafts, the committee reviews like a pull
-- request, and only ceil(2M/3) approvals of the current revision publish it.
begin;
select plan(19);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('m1', gen_random_uuid()), ('m2', gen_random_uuid()), ('res', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@n.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.pid(k text) returns uuid language sql as $$ select cf.person(pg_temp.uid(k), 'soc_n') $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_n', 'name', 'Notice CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@n.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@n.test', 'role', 'treasurer'),
    jsonb_build_object('name', 'S', 'email', 'sec@n.test', 'role', 'secretary'),
    jsonb_build_object('name', 'M1', 'email', 'm1@n.test'),
    jsonb_build_object('name', 'M2', 'email', 'm2@n.test')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_n', 1, 'A-1'), ('soc_n', 2, 'A-2'), ('soc_n', 3, 'A-3');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_n', api_add_person('soc_n', 'Res', 'res@n.test'), (select id from flats where label = 'A-1'), 'owner');
select api_add_tenure('soc_n', api_add_person('soc_n', 'Two', 'two@n.test'), (select id from flats where label = 'A-2'), 'owner');
create temp table d (k text primary key, id bigint);
create function pg_temp.notice(rev text) returns jsonb language sql as $$
  select jsonb_build_object('title', 'Terrace repair', 'body', 'Quotations attached. ' || rev, 'pinned', true,
    'vote', jsonb_build_object('question', 'Which contractor?', 'options', '["Shree Sai","Aqua Shield"]'::jsonb,
      'max_picks', 1, 'mode', 'anonymous', 'closes_at', (extract(epoch from now() + interval '7 days') * 1000)::bigint))
$$;
create function pg_temp.review(k text, decision text, comment text default null) returns jsonb language sql as $$
  select pg_temp.as_(k);
  select api_notice_review('soc_n', (select id from d where d.k = 'n1'),
    cf.current_revision((select id from d where d.k = 'n1')), decision, comment);
$$;
grant select, insert on u, d to authenticated;
set local role authenticated;

select pg_temp.as_('tre');
select throws_like($$select api_notice_draft('soc_n', null, pg_temp.notice('r1'))$$, '%only the president drafts%',
  'only the president drafts');
select pg_temp.as_('pres');
select throws_like($$select api_notice_draft('soc_n', null, pg_temp.notice('r1') || '{"vote":{"question":"Q","options":["Only"],"max_picks":1,"mode":"named","closes_at":1}}')$$,
  '%2 to 10 different options%', 'a vote needs at least two options');
insert into d select 'n1', (api_notice_draft('soc_n', null, pg_temp.notice('r1'))->>'draft_id')::bigint;
select is((select required from notice_drafts where draft_id = (select id from d where k = 'n1')), 4,
  'five seated: ceil(2*5/3) = 4 approvals needed');
select throws_like($$select api_notice_review('soc_n', (select id from d where k = 'n1'), 1, 'approve', null)$$,
  '%already counts%', 'the president does not review their own notice');
select pg_temp.review('m1', 'approve');
select pg_temp.as_('pres');
select api_notice_draft('soc_n', (select id from d where k = 'n1'), pg_temp.notice('r2'));
select is((select approvals from notice_drafts where draft_id = (select id from d where k = 'n1')), 1,
  'a new revision clears earlier approvals; the president''s own remains');
select pg_temp.as_('m1');
select throws_like($$select api_notice_review('soc_n', (select id from d where k = 'n1'), 1, 'approve', null)$$,
  '%latest revision%', 'approving an old revision is refused');
select throws_like($$select pg_temp.review('m2', 'changes_requested')$$, '%say what should change%',
  'a change request needs a comment');
select pg_temp.review('m2', 'changes_requested', 'Add the third quotation.');
select pg_temp.review('tre', 'approve'); select pg_temp.review('sec', 'approve'); select pg_temp.review('m1', 'approve');
select is((select approvals || '/' || open_change_requests from notice_drafts where draft_id = (select id from d where k = 'n1')),
  '4/1', 'enough approvals, but a change request is open');
select pg_temp.as_('res');
select is((select count(*)::int from notice_drafts), 0, 'residents never see drafts');
reset role;
select throws_like($$select api_publish_notice(pg_temp.uid('pres'), 'soc_n', (select id from d where k = 'n1'))$$,
  '%change request is still open%', 'an open change request blocks publishing');

set local role authenticated;
select pg_temp.as_('pres');
select api_notice_draft('soc_n', (select id from d where k = 'n1'), pg_temp.notice('r3'));
select pg_temp.review('m2', 'approve'); select pg_temp.review('tre', 'approve');
reset role;
select throws_like($$select api_publish_notice(pg_temp.uid('pres'), 'soc_n', (select id from d where k = 'n1'))$$,
  '%3 of 4 approvals%', 'three of four is not enough');
set local role authenticated;
select pg_temp.review('sec', 'approve');
reset role;
select lives_ok($$select api_publish_notice(pg_temp.uid('pres'), 'soc_n', (select id from d where k = 'n1'))$$,
  'the requester''s approval of a later revision clears their request, and it publishes');
select is((select (body->>'revision')::int from chain_entries where society_id = 'soc_n' and kind = 'notice'), 3,
  'the chained notice records the approved revision');
select is((select jsonb_array_length(body->'approvers') from chain_entries where society_id = 'soc_n' and kind = 'notice'), 4,
  'and who approved it, president included');
select is((select (body->>'eligible_flats')::int from chain_entries where society_id = 'soc_n' and kind = 'vote_opened'), 2,
  'its vote opens for the two flats with an open tenure');
select throws_like($$select api_publish_notice(pg_temp.uid('pres'), 'soc_n', (select id from d where k = 'n1'))$$,
  '%already published%', 'a notice publishes once');

set local role authenticated;
select pg_temp.as_('res');
select is((select title || ':' || (vote->>'mode') from notices), 'Terrace repair:anonymous', 'every member reads the notice and its vote');

-- A resignation cannot lower the count a draft needs.
select pg_temp.as_('pres');
insert into d select 'n2', (api_notice_draft('soc_n', null, jsonb_build_object('title', 'Water', 'body', 'Cut on Sunday.'))->>'draft_id')::bigint;
reset role;
update public.committee_seats set unseated_seq = 999 where society_id = 'soc_n' and person_id = pg_temp.pid('m2');
select is((select required from cf.notice_state((select id from d where k = 'n2'))), 4,
  'four seated would need 3, but the draft keeps the 4 it started with');

-- A notice with no vote publishes too, and opens none.
set local role authenticated;
select pg_temp.as_('tre'); select api_notice_review('soc_n', (select id from d where k = 'n2'), 1, 'approve', null);
select pg_temp.as_('sec'); select api_notice_review('soc_n', (select id from d where k = 'n2'), 1, 'approve', null);
select pg_temp.as_('m1'); select api_notice_review('soc_n', (select id from d where k = 'n2'), 1, 'approve', null);
reset role;
select is((api_publish_notice(pg_temp.uid('pres'), 'soc_n', (select id from d where k = 'n2'))->>'vote_seq'), null,
  'a notice without a vote publishes, and opens no vote');

select * from finish();
rollback;
