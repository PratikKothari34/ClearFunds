-- Sign-in codes and sending mail (#11, #16). The edge function asks here
-- where a code goes, records each result, and sends the enrolment mail the
-- previous migration queues.

-- Request and failure counts per typed ID, known or not, so the answer never
-- depends on whether an ID exists.
create table private.code_requests (
  clearfunds_id text primary key,
  last_at timestamptz not null,
  failed int not null default 0,
  failed_since timestamptz
);

-- ---------------------------------------------------------------- codes

-- The personal email a code goes to, or null. Same refusals for every ID.
create function public.api_auth_request(p_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r private.code_requests;
  lid text := lower(btrim(p_id));
begin
  select * into r from private.code_requests where clearfunds_id = lid for update;
  if r.last_at > now() - interval '60 seconds' then
    perform cf.err('Wait a minute before asking for another code.');
  end if;
  insert into private.code_requests (clearfunds_id, last_at) values (lid, now())
    on conflict (clearfunds_id) do update set last_at = now();
  return cf.login_email(lid);
end
$$;

create function public.api_auth_verify(p_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r private.code_requests;
  lid text := lower(btrim(p_id));
begin
  select * into r from private.code_requests where clearfunds_id = lid;
  if r.failed >= 5 and r.failed_since > now() - interval '15 minutes' then
    perform cf.err(format('Too many attempts. Try again in %s minutes.',
      ceil(extract(epoch from r.failed_since + interval '15 minutes' - now()) / 60)));
  end if;
  return cf.login_email(lid);
end
$$;

create function public.api_auth_result(p_id text, p_ok boolean) returns void
language sql security definer set search_path = '' as $$
  insert into private.code_requests (clearfunds_id, last_at, failed, failed_since)
    values (lower(btrim(p_id)), now(), case when p_ok then 0 else 1 end, case when p_ok then null else now() end)
  on conflict (clearfunds_id) do update set
    failed = case when p_ok then 0
                  when private.code_requests.failed_since < now() - interval '15 minutes' then 1
                  else private.code_requests.failed + 1 end,
    failed_since = case when p_ok then null
                        when private.code_requests.failed_since is null
                          or private.code_requests.failed_since < now() - interval '15 minutes' then now()
                        else private.code_requests.failed_since end;
$$;

-- ---------------------------------------------------------------- mail

create function public.api_mail_take(p_limit int default 20)
returns table (id bigint, to_email text, subject text, body text)
language sql security definer set search_path = '' as $$
  update private.mail_outbox o set attempts = o.attempts + 1
   where o.id in (select x.id from private.mail_outbox x where x.sent_at is null and x.attempts < 5
                   order by x.id limit p_limit for update skip locked)
  returning o.id, o.to_email, o.subject, o.body;
$$;

-- Every minute, ask the edge function to send what is queued. Does nothing
-- until the project's Vault holds clearfunds_mailer_url and
-- clearfunds_mailer_secret (backend/README.md).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create function cf.kick_mailer() returns void
language plpgsql security definer set search_path = '' as $$
declare
  u text := (select decrypted_secret from vault.decrypted_secrets where name = 'clearfunds_mailer_url');
  k text := (select decrypted_secret from vault.decrypted_secrets where name = 'clearfunds_mailer_secret');
begin
  if u is not null and k is not null
     and exists (select 1 from private.mail_outbox where sent_at is null and attempts < 5) then
    perform net.http_post(u, '{}'::jsonb, '{}'::jsonb,
      jsonb_build_object('Content-Type', 'application/json', 'X-Mailer-Secret', k));
  end if;
end
$$;
select cron.schedule('clearfunds-mailer', '* * * * *', 'select cf.kick_mailer()');

create function public.api_mail_done(p_id bigint, p_error text) returns void
language sql security definer set search_path = '' as $$
  update private.mail_outbox set sent_at = case when p_error is null then now() end, last_error = p_error
   where id = p_id;
$$;

-- ---------------------------------------------------------------- privileges

revoke all on function cf.kick_mailer() from public, anon, authenticated, service_role;
revoke all on function public.api_auth_request(text), public.api_auth_verify(text),
  public.api_auth_result(text, boolean), public.api_mail_take(int), public.api_mail_done(bigint, text)
  from public, anon, authenticated;
grant execute on function public.api_auth_request(text), public.api_auth_verify(text),
  public.api_auth_result(text, boolean), public.api_mail_take(int), public.api_mail_done(bigint, text)
  to service_role;
