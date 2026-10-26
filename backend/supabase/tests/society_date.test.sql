-- Tenures are open by the society's date, not the database's (#53). Between
-- 00:00 and 05:30 IST cf.today() is a day ahead of UTC's current_date.
--
-- Only the FOURTH assertion tests the fix at every hour: it reads the live
-- definitions and fails if either function or the starts_on default uses
-- current_date. The first three fail without the fix only when the suite runs
-- in that window, so a green run at 14:00 proves nothing on its own. Do not
-- trim the fourth as redundant with them.
begin;
select plan(4);

insert into auth.users (id, email, instance_id, aud, role)
  values ('00000000-0000-4000-8000-0000000000d1', 'd@d.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
select api_open_society(jsonb_build_object('id', 'soc_d', 'name', 'Date CHS', 'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'p@d.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 't@d.test', 'role', 'treasurer'),
    jsonb_build_object('name', 'S', 'email', 's@d.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_d', 1, 'A-1');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_d', api_add_person('soc_d', 'Dee', 'd@d.test'), (select id from flats where society_id = 'soc_d'), 'owner');

select is((select starts_on from tenures where society_id = 'soc_d'), cf.today(), 'a tenure starts on the society''s date');
select ok((cf.open_tenure('soc_d', (select id from people where email = 'd@d.test'))).id is not null,
  'and is open on that date, whatever the database''s UTC date is');
select ok(cf.login_email((select clearfunds_id from logins where society_id = 'soc_d' and kind = 'resident')) is not null,
  'so its ID can sign in');
select ok(pg_get_functiondef('cf.open_tenure(text, uuid)'::regprocedure) not like '%current_date%'
      and pg_get_functiondef('cf.login_email(text)'::regprocedure) not like '%current_date%'
      and pg_get_expr(d.adbin, d.adrelid) like '%today()%',
  'no open-tenure check, and not the starts_on default, uses the UTC date')
  from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
 where d.adrelid = 'public.tenures'::regclass and a.attname = 'starts_on';

select * from finish();
rollback;
