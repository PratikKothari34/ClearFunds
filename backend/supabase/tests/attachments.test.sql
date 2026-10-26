-- Notice attachments (#59): only the president attaches to an unpublished
-- draft, the list is part of the approved revision, publishing chains it,
-- and residents read a draft's files only once it is published.
begin;
select plan(12);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()), ('res', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@a.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_a', 'name', 'Attach CHS', 'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@a.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@a.test', 'role', 'treasurer'),
    jsonb_build_object('name', 'S', 'email', 'sec@a.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_a', 1, 'A-1');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_a', api_add_person('soc_a', 'Res', 'res@a.test'), (select id from flats where society_id = 'soc_a'), 'owner');
create temp table d (id bigint);
grant select, insert on u, d to authenticated;
create function pg_temp.file(sha text) returns jsonb language sql as $$
  select jsonb_build_object('sha256', sha, 'file_name', 'Quote.pdf', 'media_type', 'application/pdf', 'size_bytes', 2048,
    'path', 'soc_a/notices/' || (select id from d) || '/' || sha) $$;

set local role authenticated;
select pg_temp.as_('pres');
insert into d select (api_notice_draft('soc_a', null, '{"title":"Lift repair","body":"Quotes attached."}')->>'draft_id')::bigint;
reset role;

select throws_like($$select api_notice_attachment_store(pg_temp.uid('tre'), 'soc_a', (select id from d), '{}')$$,
  '%only the president attaches%', 'only the president attaches files');
select lives_ok($$select api_notice_attachment_store(pg_temp.uid('pres'), 'soc_a', (select id from d), '{}')$$,
  'the check before storing passes for the president');
select is((select count(*)::int from private.notice_attachments), 0, 'and records nothing');
select api_notice_attachment_store(pg_temp.uid('pres'), 'soc_a', (select id from d), pg_temp.file(repeat('ab', 32)));
select throws_like($$select api_notice_attachment_store(pg_temp.uid('pres'), 'soc_a', (select id from d),
  '{"sha256":"ef","size_bytes":20969473}')$$, '%at most 20 MB%', 'a draft''s files together stay under 20 MB');

set local role authenticated;
select pg_temp.as_('pres');
select throws_like($$select api_notice_draft('soc_a', (select id from d), jsonb_build_object('title', 'Lift repair',
  'body', 'Quotes attached.', 'attachments', jsonb_build_array(repeat('cd', 32))))$$,
  '%uploaded to this draft%', 'a draft lists only files uploaded to it');
select is((api_notice_draft('soc_a', (select id from d), jsonb_build_object('title', 'Lift repair',
  'body', 'Quotes attached.', 'attachments', jsonb_build_array(repeat('ab', 32))))->>'revision')::int, 2,
  'adding a file is a new revision');
select pg_temp.as_('tre');
select api_notice_review('soc_a', (select id from d), 2, 'approve', null);
reset role;

select throws_like($$select api_notice_attachment_find(pg_temp.uid('res'), 'soc_a', repeat('ab', 32))$$,
  '%cannot read it%', 'a resident cannot read a draft''s file');
select is(api_notice_attachment_find(pg_temp.uid('sec'), 'soc_a', repeat('ab', 32))->>'file_name', 'Quote.pdf',
  'the committee can, while reviewing');
select lives_ok($$select api_publish_notice(pg_temp.uid('pres'), 'soc_a', (select id from d))$$, 'it publishes');
select is((select body->'attachments' from chain_entries where society_id = 'soc_a' and kind = 'notice'),
  jsonb_build_array(repeat('ab', 32)), 'the chained notice carries the approved file''s hash');
select is(api_notice_attachment_find(pg_temp.uid('res'), 'soc_a', upper(repeat('ab', 32)))->>'path',
  'soc_a/notices/' || (select id from d) || '/' || repeat('ab', 32), 'once published, a resident can read it');
select throws_like($$select api_notice_attachment_store(pg_temp.uid('pres'), 'soc_a', (select id from d), '{}')$$,
  '%unpublished draft%', 'a published notice takes no more files');

select * from finish();
rollback;
