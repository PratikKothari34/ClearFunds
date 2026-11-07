-- #81: RLS calls auth.uid() once per query, foreign keys are indexed, and
-- every table has a primary key. The access rules themselves are covered by
-- the other files, which must still pass unchanged.
begin;
select plan(4);

select is((select count(*)::int from pg_policies
            where schemaname = 'public' and tablename in ('people', 'tenures', 'seen')
              and (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
              and (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT auth\.uid\(\)'), 0,
  'no policy on people, tenures or seen calls auth.uid() per row');

select is((select count(*)::int from pg_policies
            where (coalesce(qual, '') || coalesce(with_check, '')) ~ '[^(]auth\.uid\(\)'
              and (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT auth\.uid\(\)'), 0,
  'nor does any other policy');

-- Foreign keys in public and private whose leading index columns don't cover
-- them, except chain_entries.kind (cf.kinds rows are never deleted).
select is((select coalesce(string_agg(c.conname, ', '), '') from pg_constraint c
            join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
           where c.contype = 'f' and n.nspname in ('public', 'private') and c.conname <> 'chain_entries_kind_fkey'
             and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
                              and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
                              and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)), '',
  'every foreign key has a covering index');

select is((select coalesce(string_agg(n.nspname || '.' || t.relname, ', '), '') from pg_class t
            join pg_namespace n on n.oid = t.relnamespace
           where t.relkind = 'r' and n.nspname in ('public', 'private')
             and not exists (select 1 from pg_constraint c where c.conrelid = t.oid and c.contype = 'p')), '',
  'every table has a primary key');

select * from finish();
rollback;
