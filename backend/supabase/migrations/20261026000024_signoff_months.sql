-- The open questions in each month, for its sign-off (#70). Flags are counted
-- three ways because they mean different things: two residents can flag one
-- posting, and one flag can cover a payee's every posting. Open is
-- cf.flag_open: only the flagging resident closes a flag (AGENTS.md item 11).

create function public.api_signoff_months(p_society text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cf.is_committee(p_society) and coalesce(auth.role(), '') <> 'service_role' then
    perform cf.err('only the committee reads sign-off months');
  end if;
  return (
    with posts as (
      select l.seq, l.counterparty, to_char(l.business_date, 'YYYY-MM') as month,
             cf.fy_of(p_society, l.business_date) as fy
        from public.ledger l where l.society_id = p_society),
    open_flags as (
      select f.* from public.chain_entries f
       where f.society_id = p_society and f.kind = 'flag' and cf.flag_open(p_society, f)),
    -- Each open flag against each posting it concerns.
    on_posts as (
      select f.sequence as flag_seq, f.actor, p.month, p.seq
        from open_flags f join posts p
          on (f.body->>'scope' = 'entries'
              and p.seq in (select v::bigint from jsonb_array_elements_text(f.body->'target_seqs') t(v)))
          or (f.body->>'scope' = 'counterparty' and lower(btrim(p.counterparty)) = lower(btrim(f.body->>'counterparty')))),
    -- A period flag is about the month or year as a whole, not an entry.
    on_months as (
      select distinct f.sequence as flag_seq, f.actor, p.month
        from open_flags f join posts p on f.body->>'scope' = 'period'
         and (f.body->>'period' = p.month or f.body->>'period' = p.fy)),
    concerned as (
      select flag_seq, actor, month from on_posts union select flag_seq, actor, month from on_months),
    months as (
      select month from posts
      union select body->>'month' from public.chain_entries where society_id = p_society and kind = 'month_signoff')
    select coalesce(jsonb_agg(jsonb_build_object(
             'month', m.month,
             'signed_off_seq', (select min(sequence) from public.chain_entries
                                 where society_id = p_society and kind = 'month_signoff' and body->>'month' = m.month),
             'postings', (select count(*) from posts p where p.month = m.month),
             'open_flags', (select count(distinct flag_seq) from concerned c where c.month = m.month),
             'open_flag_entries', (select count(distinct seq) from on_posts o where o.month = m.month),
             'open_flag_residents', (select count(distinct actor) from concerned c where c.month = m.month))
           order by m.month desc), '[]')
      from months m);
end
$$;

revoke all on function public.api_signoff_months(text) from public, anon, authenticated;
grant execute on function public.api_signoff_months(text) to authenticated, service_role;
