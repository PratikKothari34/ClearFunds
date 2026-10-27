-- The chain head published monthly outside admin control (#1, AGENTS.md
-- items 2 and 9, contracts/anchor/v1.md). The database decides which months
-- are due and keeps what was published; the edge function writes the files.
-- Nothing here publishes until the anchor repo and its token are configured.

create table private.anchor_publications (
  society_id text not null references public.societies,
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  head_seq bigint not null,
  head_hash bytea not null,
  -- The exact bytes written, so a retry can recognise its own file.
  body text not null,
  url text not null,
  published_at timestamptz not null default now(),
  -- The Wayback capture: best effort, and never a condition of publishing.
  witnessed_at timestamptz,
  primary key (society_id, period)
);

-- When a month ends, in Unix milliseconds, in the society's time zone (the
-- same one cf.today() reads).
create function cf.period_end_ms(p_period text) returns bigint
language sql immutable set search_path = '' as $$
  select (extract(epoch from ((to_date(p_period, 'YYYY-MM') + interval '1 month')::timestamp
            at time zone 'Asia/Kolkata')) * 1000)::bigint
$$;

-- The head a month publishes: the last entry recorded before it ended.
create function cf.period_head(p_society text, p_period text) returns public.chain_entries
language sql stable security definer set search_path = '' as $$
  select * from public.chain_entries
   where society_id = p_society and recorded_at < cf.period_end_ms(p_period)
   order by sequence desc limit 1
$$;

-- Every month that has ended since an open society's first entry and is not
-- yet published, oldest first. A month with no new entries is still due, with
-- the previous head, so a quiet month never reads as an overdue publisher.
create function public.api_anchor_due() returns jsonb
language sql stable security definer set search_path = '' as $$
  with first as (
    select c.society_id,
           date_trunc('month', to_timestamp(min(c.recorded_at) / 1000.0) at time zone 'Asia/Kolkata') as m
      from public.chain_entries c join public.societies s on s.id = c.society_id and s.status = 'open'
     group by c.society_id),
  due as (
    select f.society_id, to_char(g, 'YYYY-MM') as period
      from first f,
           generate_series(f.m, date_trunc('month', now() at time zone 'Asia/Kolkata') - interval '1 month',
                           interval '1 month') g
     where not exists (select 1 from private.anchor_publications a
                        where a.society_id = f.society_id and a.period = to_char(g, 'YYYY-MM')))
  select coalesce(jsonb_agg(jsonb_build_object(
           'society_id', d.society_id, 'period', d.period, 'head_seq', h.sequence, 'entry_count', h.sequence,
           'head_hash', encode(h.entry_hash, 'hex'), 'format_version', h.format_version, 'as_of', h.recorded_at)
           order by d.society_id, d.period), '[]')
    from due d cross join lateral cf.period_head(d.society_id, d.period) h
$$;

-- Records a written file. The head must be the month's real head, and a
-- month is only ever recorded once: the same bytes again are a retry, other
-- bytes are refused.
create function public.api_anchor_record(p_society text, p_period text, p_head_seq bigint, p_head_hash text,
                                         p_body text, p_url text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  h public.chain_entries := cf.period_head(p_society, p_period);
  prior private.anchor_publications;
begin
  if h.sequence is distinct from p_head_seq or encode(h.entry_hash, 'hex') is distinct from p_head_hash then
    perform cf.err(format('%s %s: that is not the head of the month', p_society, p_period));
  end if;
  select * into prior from private.anchor_publications where society_id = p_society and period = p_period;
  if prior.period is not null then
    if prior.body is distinct from p_body then
      perform cf.err(format('%s %s was already published with different bytes', p_society, p_period));
    end if;
    return jsonb_build_object('recorded', false);
  end if;
  insert into private.anchor_publications (society_id, period, head_seq, head_hash, body, url)
    values (p_society, p_period, p_head_seq, h.entry_hash, p_body, p_url);
  return jsonb_build_object('recorded', true);
end
$$;

create function public.api_anchor_witnessed(p_society text, p_period text) returns void
language sql security definer set search_path = '' as $$
  update private.anchor_publications set witnessed_at = coalesce(witnessed_at, now())
   where society_id = p_society and period = p_period
$$;

-- What has been published, for members. Informational: a client checks the
-- file at the fixed host, never this view.
create view public.anchor_publications as
select a.society_id, a.period, a.head_seq, encode(a.head_hash, 'hex') as head_hash, a.url, a.published_at,
       a.witnessed_at is not null as witnessed
  from private.anchor_publications a
 where a.society_id in (select cf.my_societies());

-- Daily. Does nothing until the project's Vault holds clearfunds_anchor_url
-- and clearfunds_anchor_secret (backend/README.md).
create function cf.kick_anchor() returns void
language plpgsql security definer set search_path = '' as $$
declare
  u text := (select decrypted_secret from vault.decrypted_secrets where name = 'clearfunds_anchor_url');
  k text := (select decrypted_secret from vault.decrypted_secrets where name = 'clearfunds_anchor_secret');
begin
  if u is not null and k is not null then
    perform net.http_post(u, '{}'::jsonb, '{}'::jsonb,
      jsonb_build_object('Content-Type', 'application/json', 'X-Anchor-Secret', k));
  end if;
end
$$;
-- 00:30 UTC is 06:00 in Asia/Kolkata, so each month goes out on the 1st.
select cron.schedule('clearfunds-anchor', '30 0 * * *', 'select cf.kick_anchor()');

-- ---------------------------------------------------------------- privileges

grant select on public.anchor_publications to authenticated;
revoke all on public.anchor_publications from anon;
revoke all on function cf.period_end_ms(text), cf.period_head(text, text), cf.kick_anchor()
  from public, anon, authenticated, service_role;
revoke all on function public.api_anchor_due(), public.api_anchor_record(text, text, bigint, text, text, text),
  public.api_anchor_witnessed(text, text) from public, anon, authenticated;
grant execute on function public.api_anchor_due(), public.api_anchor_record(text, text, bigint, text, text, text),
  public.api_anchor_witnessed(text, text) to service_role;
