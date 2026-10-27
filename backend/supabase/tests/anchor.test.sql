-- The monthly published head (#1, contracts/anchor/v1.md): which months are
-- due, what each month's head is, and that a month is recorded only once.
begin;
select plan(16);

-- Raw rows with chosen timestamps: only sequence, recorded_at and the hash
-- matter here, so the bodies are not real entries.
insert into public.societies (id, name, status) values ('soc_a', 'Anchor CHS', 'open'), ('soc_b', 'Draft CHS', 'draft');
create temp table m as select date_trunc('month', now() at time zone 'Asia/Kolkata') as m0;
create function pg_temp.ms(t timestamp) returns bigint language sql as $$
  select (extract(epoch from (t at time zone 'Asia/Kolkata')) * 1000)::bigint $$;
create function pg_temp.p(k int) returns text language sql as $$
  select to_char((select m0 from m) - make_interval(months => k), 'YYYY-MM') $$;
insert into public.chain_entries (society_id, sequence, prev_hash, kind, recorded_at, body, entry_hash)
select 'soc_a', s, decode(repeat('00', 32), 'hex'), 'society_opened', t, '{}', extensions.digest(s::text, 'sha256')
  from (values
    (1, pg_temp.ms((select m0 from m) - interval '3 months' + interval '9 days')),
    (2, pg_temp.ms((select m0 from m) - interval '3 months' + interval '20 days')),
    (3, cf.period_end_ms(pg_temp.p(2)) - 1),      -- the last millisecond of month -2
    (4, cf.period_end_ms(pg_temp.p(2))),          -- the first of month -1
    (5, (extract(epoch from now()) * 1000)::bigint)) v(s, t);
insert into public.chain_entries (society_id, sequence, prev_hash, kind, recorded_at, body, entry_hash)
  values ('soc_b', 1, decode(repeat('00', 32), 'hex'), 'society_opened', 0, '{}', extensions.digest('b', 'sha256'));

select is(cf.period_end_ms('2026-10'), (extract(epoch from timestamptz '2026-10-31 18:30:00+00') * 1000)::bigint,
  'a month ends at midnight in Asia/Kolkata, not UTC');

create temp table d as select x from jsonb_array_elements(api_anchor_due()) x where x->>'society_id' = 'soc_a';
select is((select string_agg((x->>'period') || ':' || (x->>'head_seq'), ' ' order by x->>'period') from d),
  pg_temp.p(3) || ':2 ' || pg_temp.p(2) || ':3 ' || pg_temp.p(1) || ':4',
  'every ended month since the first entry is due, oldest first, each with the last entry before it ended');
select ok(not exists (select 1 from d where x->>'period' = pg_temp.p(0)), 'the current month is not due until it ends');
select ok(not exists (select 1 from jsonb_array_elements(api_anchor_due()) x where x->>'society_id' = 'soc_b'),
  'a society that is not open publishes nothing');
select is((select (x->>'entry_count')::bigint - (x->>'head_seq')::bigint from d where x->>'period' = pg_temp.p(2)), 0::bigint,
  'entry_count equals head_seq: sequences have no gaps');
select is((select x->>'head_hash' from d where x->>'period' = pg_temp.p(2)), encode(extensions.digest('3', 'sha256'), 'hex'),
  'head_hash is the head entry''s hash, in hex');
select is((select (x->>'as_of')::bigint from d where x->>'period' = pg_temp.p(1)), cf.period_end_ms(pg_temp.p(2)),
  'as_of is the head entry''s recorded_at');

-- ---- recording
create function pg_temp.rec(period text, seq bigint, hash text, body text) returns jsonb language sql as $$
  select api_anchor_record('soc_a', period, seq, hash, body, 'https://example.test/' || period) $$;
select throws_like(format($$select pg_temp.rec(%L, 3, %L, 'x')$$, pg_temp.p(3), encode(extensions.digest('3', 'sha256'), 'hex')),
  '%not the head of the month%', 'a head that is not the month''s own is refused');
select throws_like(format($$select pg_temp.rec(%L, 2, %L, 'x')$$, pg_temp.p(3), repeat('ab', 32)),
  '%not the head of the month%', 'so is the right sequence with the wrong hash');
select is(pg_temp.rec(pg_temp.p(3), 2, encode(extensions.digest('2', 'sha256'), 'hex'), 'file-bytes')->>'recorded', 'true',
  'the real head is recorded');
select is(pg_temp.rec(pg_temp.p(3), 2, encode(extensions.digest('2', 'sha256'), 'hex'), 'file-bytes')->>'recorded', 'false',
  'the same bytes again are a retry, not a second publication');
select throws_like(format($$select pg_temp.rec(%L, 2, %L, 'other-bytes')$$, pg_temp.p(3), encode(extensions.digest('2', 'sha256'), 'hex')),
  '%already published with different bytes%', 'a month is never published twice with different bytes');
select ok(not exists (select 1 from jsonb_array_elements(api_anchor_due()) x
                       where x->>'society_id' = 'soc_a' and x->>'period' = pg_temp.p(3)),
  'a recorded month is no longer due');
select api_anchor_witnessed('soc_a', pg_temp.p(3));
select ok((select witnessed_at is not null from private.anchor_publications where period = pg_temp.p(3)),
  'a Wayback capture is recorded beside it');

-- ---- who can reach it
select ok(not has_function_privilege('authenticated', 'public.api_anchor_due()', 'execute')
          and not has_function_privilege('authenticated', 'public.api_anchor_record(text,text,bigint,text,text,text)', 'execute'),
  'only the server lists or records publications');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
select is((select count(*)::int from anchor_publications), 0, 'a stranger reads no society''s publications');
reset role;

select * from finish();
rollback;
