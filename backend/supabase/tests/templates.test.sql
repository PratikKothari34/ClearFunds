-- Expense templates (#62): a template pre-fills an expense and nothing more.
-- The proposal it makes has the tier and approvals of one typed by hand, and
-- the template itself is never chained.
begin;
select plan(24);

create temp table u (k text primary key, id uuid);
insert into u values ('pres', gen_random_uuid()), ('tre', gen_random_uuid()), ('sec', gen_random_uuid()),
  ('own', gen_random_uuid());
insert into auth.users (id, email, instance_id, aud, role)
  select id, k || '@t.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from u;
create function pg_temp.uid(k text) returns uuid language sql as $$ select id from u where u.k = $1 $$;
create function pg_temp.as_(k text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
$$;
select api_open_society(jsonb_build_object('id', 'soc_t', 'name', 'Template CHS', 'approval_limit_minor', 1000000,
  'committee', jsonb_build_array(
    jsonb_build_object('name', 'P', 'email', 'pres@t.test', 'role', 'president'),
    jsonb_build_object('name', 'T', 'email', 'tre@t.test', 'role', 'treasurer', 'tasks', '["propose_expenses"]'::jsonb),
    jsonb_build_object('name', 'S', 'email', 'sec@t.test', 'role', 'secretary')),
  'minutes', jsonb_build_object('file_name', 'm.pdf', 'media_type', 'application/pdf', 'size_bytes', 1, 'sha256', repeat('aa', 32))));
insert into public.flats (society_id, ordinal, label) values ('soc_t', 1, 'A-1');
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select api_add_tenure('soc_t', api_add_person('soc_t', 'Own', 'own@t.test'),
  (select id from public.flats where society_id = 'soc_t' and label = 'A-1'), 'owner');

create temp table ids (k text primary key, id bigint);
create temp table chained as select count(*) as n from public.chain_entries where society_id = 'soc_t';
grant select, insert on u, ids, chained to authenticated;
create function pg_temp.id(k text) returns bigint language sql as $$ select id from ids where ids.k = $1 $$;
-- Proposes once, as the treasurer, and returns the chained body.
create function pg_temp.prop(p jsonb) returns jsonb language plpgsql as $$
declare s bigint;
begin
  s := (api_propose(pg_temp.uid('tre'), 'soc_t', p)->>'seq')::bigint;
  insert into ids values ('last', s) on conflict (k) do update set id = excluded.id;
  return (select body from public.chain_entries where society_id = 'soc_t' and sequence = s);
end $$;

-- ---- saving
set local role authenticated;
select pg_temp.as_('sec');
select throws_like($$select api_save_template('soc_t', null, '{"name":"Lift AMC"}')$$,
  '%propose expenses is not one of your tasks%', 'only a holder of propose_expenses saves a template');
select pg_temp.as_('tre');
select throws_like($$select api_save_template('soc_t', null, '{"name":"  "}')$$, '%a name of at most 80%',
  'a template needs a name');
select throws_like($$select api_save_template('soc_t', null, jsonb_build_object('name', repeat('x', 81)))$$,
  '%a name of at most 80%', 'and a name of at most 80 characters');
select throws_like($$select api_save_template('soc_t', null, '{"name":"Lift","amount_minor":0}')$$,
  '%positive whole number of minor units%', 'a fixed amount of zero is refused');
select throws_like($$select api_save_template('soc_t', null, '{"name":"Lift","amount_minor":1250.5}')$$,
  '%positive whole number of minor units%', 'so is a fraction of a minor unit');
select throws_like($$select api_save_template('soc_t', null, '{"name":"Lift","amount_minor":"1250"}')$$,
  '%positive whole number of minor units%', 'and an amount sent as a string');
insert into ids select 'lift', (api_save_template('soc_t', null, '{"name":"Lift AMC","counterparty":"Otis",
  "category":"repairs","narration":"Lift AMC, monthly","amount_minor":1250075}')->>'template_id')::bigint;
insert into ids select 'power', (api_save_template('soc_t', null, '{"name":"Electricity","counterparty":"MSEDCL",
  "category":"utilities","narration":"Common-area electricity","amount_minor":null}')->>'template_id')::bigint;
select is((select row(name, counterparty, amount_minor, last_used_seq, retired)::text from expense_templates
            where template_id = pg_temp.id('lift')), '("Lift AMC",Otis,1250075,,f)',
  'the committee reads a saved template, never used yet');
select is((select count(*)::int from public.chain_entries where society_id = 'soc_t'), (select n::int from chained),
  'saving a template chains nothing');
select pg_temp.as_('own');
select is((select count(*)::int from expense_templates), 0, 'a resident sees no templates');
reset role;

-- ---- proposing from a template
create temp table b (k text primary key, body jsonb);
insert into b select 'from_template', pg_temp.prop(jsonb_build_object('action', 'expense', 'template_id', pg_temp.id('lift')));
insert into ids select 'from_template', pg_temp.id('last');
insert into b select 'by_hand', pg_temp.prop('{"action":"expense","counterparty":"Otis","category":"repairs",
  "narration":"Lift AMC, monthly","amount_minor":1250075}');
select is((select body from b where k = 'from_template'), (select body from b where k = 'by_hand'),
  'a proposal from a template is the proposal typed by hand: same body, tier and required approvals');
select is((select last_used_seq from private.expense_templates where id = pg_temp.id('lift')), pg_temp.id('from_template'),
  'last_used_seq is the proposal made from it, not the one typed by hand after');
select is(pg_temp.prop(jsonb_build_object('template_id', pg_temp.id('lift'), 'amount_minor', 1300000,
            'narration', 'Lift AMC, with the new rate'))->>'amount_minor', '1300000',
  'a field given in the proposal wins, and the action defaults to expense');
select is((select body->>'tier' from public.chain_entries where society_id = 'soc_t' and kind = 'proposal'
            order by sequence desc limit 1), 'committee',
  'and the tier follows the amount actually proposed, above the limit');
select is((select body->>'narration' from public.chain_entries where society_id = 'soc_t' and kind = 'proposal'
            order by sequence desc limit 1), 'Lift AMC, with the new rate', 'the given description is the one chained');
select throws_like($$select pg_temp.prop(jsonb_build_object('template_id', pg_temp.id('power')))$$,
  '%no fixed amount: give one%', 'a template for a bill that varies needs the amount at proposal time');
select is(pg_temp.prop(jsonb_build_object('template_id', pg_temp.id('power'), 'amount_minor', 845000))->>'counterparty',
  'MSEDCL', 'given one, it proposes');
select throws_like($$select pg_temp.prop(jsonb_build_object('action', 'receipt', 'template_id', pg_temp.id('lift')))$$,
  '%fills an expense only%', 'a template never fills a receipt or a charge');
select throws_like($$select api_propose(pg_temp.uid('sec'), 'soc_t', jsonb_build_object('template_id', pg_temp.id('lift')))$$,
  '%propose expenses is not one of your tasks%', 'proposing from a template needs the task, as any expense does');
select is((select count(*)::int from public.chain_entries where society_id = 'soc_t' and kind = 'posting'), 0,
  'nothing posts by itself: every proposal still waits for its approvals');

-- ---- editing and retiring
set local role authenticated;
select pg_temp.as_('tre');
select api_save_template('soc_t', pg_temp.id('lift'), '{"name":"Lift AMC (Otis)","counterparty":"Otis",
  "category":"repairs","narration":"Lift AMC, monthly","amount_minor":1300000}');
select is((select row(name, amount_minor)::text from expense_templates where template_id = pg_temp.id('lift')),
  '("Lift AMC (Otis)",1300000)', 'saving over a template edits it in place');
select api_retire_template('soc_t', pg_temp.id('lift'));
select is((select retired from expense_templates where template_id = pg_temp.id('lift')), true,
  'a retired template is flagged, never deleted');
select throws_like($$select api_save_template('soc_t', pg_temp.id('lift'), '{"name":"Lift"}')$$, '%retired%',
  'a retired template cannot be edited');
reset role;
select throws_like($$select pg_temp.prop(jsonb_build_object('template_id', pg_temp.id('lift')))$$, '%retired%',
  'nor proposed from');

-- ---- another society's template
insert into public.societies (id, name) values ('soc_x', 'Elsewhere CHS');
with x as (insert into private.expense_templates (society_id, name, amount_minor, created_by)
  values ('soc_x', 'Theirs', 500, cf.person(pg_temp.uid('tre'), 'soc_t')) returning id)
insert into ids select 'other', id from x;
select throws_like($$select pg_temp.prop(jsonb_build_object('template_id', pg_temp.id('other'), 'counterparty', 'X',
  'category', 'repairs', 'narration', 'x'))$$, '%no such template in this society%',
  'a template from another society is refused');

select * from finish();
rollback;
