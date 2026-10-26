-- ClearFunds IDs and enrolment (#11, #16).
--
-- An ID follows a post or a tenure (contracts/api/v1.md, Sign-in). It decides
-- where a code is sent and what its holder is told at enrolment; access still
-- comes only from an open tenure, a seat or an appointment (AGENTS.md item 11).

alter table public.societies add column slug text unique check (slug ~ '^[a-z0-9]{1,24}$');

create table public.logins (
  clearfunds_id text primary key check (clearfunds_id ~ '^[a-z0-9.-]+@[a-z0-9]+\.com$'),
  society_id text not null references public.societies,
  kind text not null check (kind in ('post', 'resident')),
  post_id text,
  tenure_id text unique references public.tenures,
  person_id uuid references public.people,
  created_at timestamptz not null default now(),
  check ((kind = 'post') = (post_id is not null) and (kind = 'resident') = (tenure_id is not null)),
  unique (society_id, post_id)
);

-- Enrolment mail waiting to be sent by the edge function.
create table private.mail_outbox (
  id bigint generated always as identity primary key,
  to_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text
);

alter table public.logins enable row level security;
create policy committee_read on public.logins for select to authenticated
  using (society_id in (select cf.my_committee_societies()));
grant select (clearfunds_id, society_id, kind, post_id, tenure_id, person_id) on public.logins to authenticated;
revoke all on public.logins from anon;

-- ---------------------------------------------------------------- ids

create function cf.slug(t text, keep text default '') returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9' || keep || ']+', keep, 'g'), keep)
$$;

create function cf.society_slug(p_society text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  s public.societies;
  base text;
  cand text;
  n int := 1;
begin
  select * into s from public.societies where id = p_society for update;
  if s.slug is not null then
    return s.slug;
  end if;
  base := left(nullif(cf.slug(regexp_replace(lower(s.name), '\m(chs|society|co-?op|housing)\M', '', 'g')), ''), 20);
  base := coalesce(base, 'society');
  cand := base;
  while exists (select 1 from public.societies where slug = cand) loop
    n := n + 1;
    cand := base || n;
  end loop;
  update public.societies set slug = cand where id = p_society;
  return cand;
end
$$;

-- `local` gains 2, 3, ... on the part before the first dot until the ID is free.
create function cf.free_id(p_local text, p_domain text) returns text
language plpgsql stable set search_path = '' as $$
declare
  head text := split_part(p_local, '.', 1);
  tail text := substr(p_local, length(head) + 1);
  cand text := p_local || '@' || p_domain || '.com';
  n int := 1;
begin
  while exists (select 1 from public.logins where clearfunds_id = cand) loop
    n := n + 1;
    cand := head || n || tail || '@' || p_domain || '.com';
  end loop;
  return cand;
end
$$;

-- ---------------------------------------------------------------- enrolment

create function cf.task_text(t text) returns text language sql immutable set search_path = '' as $$
  select case t
    when 'manage_residents' then 'add residents and close their occupancy when they leave'
    when 'propose_expenses' then 'propose expenses for approval'
    when 'raise_monthly_charges' then 'propose the monthly maintenance charge'
    when 'respond_to_flags' then 'reply to residents'' disputes on the committee''s behalf'
    when 'review_payment_claims' then 'check residents'' "I''ve paid" claims against the bank'
    when 'send_dues_reminders' then 'send reminders for unpaid dues' end
$$;

create function cf.enrol(p_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.logins;
  p public.people;
  s public.societies;
  po public.posts;
  t public.tenures;
  what text;
begin
  select * into l from public.logins where clearfunds_id = p_id;
  select * into p from public.people where id = l.person_id;
  select * into s from public.societies where id = l.society_id;
  if p.id is null or s.status <> 'open' then
    return;
  end if;
  if l.kind = 'post' then
    select * into po from public.posts where society_id = l.society_id and post_id = l.post_id;
    what := format(E'You are the %s of %s.\n\n', po.post_title, s.name) || case po.seat_role
      when 'president' then E'As President you sign off each month''s expense sheet and vote with the committee on entries above the approval limit.'
      when 'treasurer' then E'As Treasurer you approve entries at or below the approval limit together with the Secretary - always both of you, never one alone - and vote with the committee above it.'
      when 'secretary' then E'As Secretary you approve entries at or below the approval limit together with the Treasurer - always both of you, never one alone - and vote with the committee above it.'
      else E'As a committee member you vote on entries above the approval limit, on changes to the limit and on seating admins.' end
      || coalesce(E'\n\nYour tasks:\n' || (select string_agg('- ' || cf.task_text(x), E'\n' order by x)
                                           from unnest(po.tasks) x), '');
  else
    select * into t from public.tenures where id = l.tenure_id;
    what := format(E'You are registered as the %s of flat %s at %s.\n\n', t.kind,
                   (select label from public.flats where id = t.flat_id), s.name)
      || E'You can read the society''s full ledger and running balance, see your flat''s dues, tell the treasurer when you have paid, and raise a dispute about any entry.'
      || case when t.kind = 'tenant' then
           E'\n\nThe owner of your flat can see the disputes you raise. No other resident can see who raised them.' else '' end;
  end if;
  insert into private.mail_outbox (to_email, subject, body) values (p.email,
    format('Your ClearFunds ID for %s', s.name),
    format(E'Hello %s,\n\nYour ClearFunds ID is %s\n\n%s\n\nTo sign in, enter your ClearFunds ID; a 6-digit code will be sent to this email address. Nothing is sent to the ID itself.\n\nClearFunds',
           p.full_name, l.clearfunds_id, what));
end
$$;

-- ---------------------------------------------------------------- follow posts and tenures

create function cf.post_login() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lid text;
  old_user uuid;
begin
  if tg_op = 'INSERT' then
    lid := cf.free_id(coalesce(nullif(cf.slug(new.post_title, '-'), ''), 'post'), cf.society_slug(new.society_id));
    insert into public.logins (clearfunds_id, society_id, kind, post_id, person_id)
      values (lid, new.society_id, 'post', new.post_id, new.holder);
    perform cf.enrol(lid);
  elsif new.holder is distinct from old.holder then
    update public.logins set person_id = new.holder
     where society_id = new.society_id and post_id = new.post_id returning clearfunds_id into lid;
    -- The old holder's sessions end; they sign in again with any ID they still hold.
    select auth_user_id into old_user from public.people where id = old.holder;
    delete from auth.sessions where user_id = old_user;
    perform cf.enrol(lid);
  end if;
  return null;
end
$$;

create function cf.tenure_login() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lid text;
begin
  lid := cf.free_id(coalesce(nullif(cf.slug(split_part(btrim((select full_name from public.people where id = new.person_id)), ' ', 1)), ''), 'resident')
                   || '.' || coalesce(nullif(cf.slug((select label from public.flats where id = new.flat_id)), ''), 'flat'),
                   cf.society_slug(new.society_id));
  insert into public.logins (clearfunds_id, society_id, kind, tenure_id, person_id)
    values (lid, new.society_id, 'resident', new.id, new.person_id);
  perform cf.enrol(lid);
  return null;
end
$$;

create trigger post_login after insert or update of holder on public.posts
  for each row execute function cf.post_login();
create trigger tenure_login after insert on public.tenures
  for each row execute function cf.tenure_login();

-- api_open_society creates posts before the society is open, so their
-- enrolment waits until it is: send it now for any ID not yet mailed.
create function cf.enrol_on_open() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  lid text;
begin
  for lid in select clearfunds_id from public.logins where society_id = new.id and kind = 'post' loop
    perform cf.enrol(lid);
  end loop;
  return null;
end
$$;
create trigger enrol_on_open after update of status on public.societies
  for each row when (old.status <> 'open' and new.status = 'open') execute function cf.enrol_on_open();

create function cf.login_email(p_id text) returns text
language sql stable security definer set search_path = '' as $$
  select p.email from public.logins l join public.people p on p.id = l.person_id
   where l.clearfunds_id = p_id and case l.kind
     when 'post' then (cf.active_seat(l.society_id, l.person_id)).person_id is not null
     else exists (select 1 from public.tenures t where t.id = l.tenure_id
                    and t.starts_on <= current_date and (t.ends_on is null or t.ends_on >= current_date)) end
$$;

-- Before a code is checked: the email, or a refusal after 5 misses in 15 minutes.
-- ---------------------------------------------------------------- me

create function public.api_my_ids(p_society text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('clearfunds_id', l.clearfunds_id, 'kind', l.kind,
           'post_title', po.post_title, 'flat', f.label) order by l.kind, l.clearfunds_id), '[]')
    from public.logins l
    left join public.posts po on po.society_id = l.society_id and po.post_id = l.post_id
    left join public.tenures t on t.id = l.tenure_id
    left join public.flats f on f.id = t.flat_id
   where l.society_id = p_society and l.person_id = cf.person(auth.uid(), p_society)
     and cf.login_email(l.clearfunds_id) is not null
$$;

-- ---------------------------------------------------------------- privileges

revoke all on function cf.slug(text, text), cf.society_slug(text), cf.free_id(text, text), cf.task_text(text),
  cf.enrol(text), cf.post_login(), cf.tenure_login(), cf.enrol_on_open(), cf.login_email(text)
  from public, anon, authenticated, service_role;
revoke all on function public.api_my_ids(text) from public, anon, authenticated;
grant execute on function public.api_my_ids(text) to authenticated;
