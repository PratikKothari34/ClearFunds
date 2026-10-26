-- Platform onboarding (#15): only a platform admin creates a society, it
-- starts as a draft with nothing chained, and its president can be replaced
-- before it opens.
begin;
select plan(6);

create temp table u (k text primary key, id uuid);
insert into u values ('plat', gen_random_uuid()), ('pres', gen_random_uuid()), ('other', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@o.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
insert into public.platform_admins (auth_user_id) select id from u where k = 'plat';
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
create temp table soc (id text);

-- ---- platform
select throws_like($$select api_platform_create(pg_temp.uid('pres'), '{"name":"X","flat_count":4}')$$,
  '%platform admin%', 'only a platform admin creates a society');
insert into soc select api_platform_create(pg_temp.uid('plat'), jsonb_build_object('name', 'Neem CHS',
  'city', 'Pune', 'flat_count', 3, 'fy_start_month', 4,
  'president', jsonb_build_object('full_name', 'Asha P', 'personal_email', 'pres@o.test', 'phone', '98')));
create function pg_temp.s() returns text language sql as $$ select id from soc $$;
select is((select status from public.societies where id = pg_temp.s()), 'draft', 'a new society is a draft');
select is((select count(*)::int from public.chain_entries where society_id = pg_temp.s()), 0, 'and nothing is chained');
select is((api_platform_list(pg_temp.uid('plat'))->0->>'president_email_masked'), 'p•••@o.test',
  'the platform list masks the president''s email');

select lives_ok($$select api_platform_president(pg_temp.uid('plat'), pg_temp.s(),
  '{"full_name":"Bina Q","personal_email":"other@o.test"}')$$, 'the president can be replaced before open');
select is((select p.email from public.society_setup ss join public.people p on p.id = ss.president_person_id
            where ss.society_id = pg_temp.s()), 'other@o.test', 'and the setup belongs to the new president');

select * from finish();
rollback;
