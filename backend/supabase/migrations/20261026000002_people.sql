-- People, flats, occupancy and the committee.
--
-- Access derives from an open tenure, a committee seat or an auditor
-- appointment, never from a stored permission flag (AGENTS.md item 11).

create table public.people (
  id uuid primary key default gen_random_uuid(),
  society_id text not null references public.societies,
  full_name text not null,
  email text not null check (email = lower(email)),
  phone text,
  auth_user_id uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (society_id, email)
);
create index people_auth on public.people (auth_user_id);

-- An account is created by the society's admins, never by sign-up: a
-- signed-in user with no people row sees nothing. This links the row once
-- the person first signs in with that email.
create function cf.link_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.people set auth_user_id = new.id
    where email = lower(new.email) and auth_user_id is null;
  return new;
end
$$;
create trigger link_people after insert or update of email on auth.users
  for each row execute function cf.link_auth_user();

-- And the other order: an admin adds someone who already has a login.
create function cf.link_person() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.auth_user_id is null then
    select id into new.auth_user_id from auth.users where lower(email) = new.email;
  end if;
  return new;
end
$$;
create trigger people_link before insert on public.people
  for each row execute function cf.link_person();

create table public.flats (
  id text primary key default 'flt_' || substr(md5(gen_random_uuid()::text), 1, 10),
  society_id text not null references public.societies,
  -- The permanent registry ordinal: remainder ties break on it.
  ordinal int not null check (ordinal >= 1),
  label text not null,
  has_parking boolean not null default false,
  joined_on date not null default current_date,
  unique (society_id, ordinal),
  unique (society_id, label)
);

create table public.tenures (
  id text primary key default 'ten_' || substr(md5(gen_random_uuid()::text), 1, 12),
  society_id text not null references public.societies,
  flat_id text not null references public.flats,
  person_id uuid not null references public.people,
  kind text not null check (kind in ('owner', 'tenant')),
  -- Owner-tenant link: server-side only, never in a preimage.
  parent_tenure_id text references public.tenures,
  starts_on date not null default current_date,
  ends_on date,
  handle text not null,
  check ((kind = 'tenant') = (parent_tenure_id is not null)),
  check (ends_on is null or ends_on >= starts_on)
);
-- Tenures may overlap on a flat (joint owners, a buyer moving in early), but
-- one person holds one active tenure, which keeps distinct-resident counts
-- honest.
create unique index tenures_one_active_per_person on public.tenures (person_id) where ends_on is null;
create index tenures_flat on public.tenures (flat_id);
create unique index tenures_handle on public.tenures (handle);

-- H(society_salt || person_id || tenure_id), field-encoded so no two inputs
-- concatenate to the same bytes. The salt is never served.
create function cf.tenure_handle() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  salt bytea;
begin
  select s.salt into salt from private.society_secrets s where s.society_id = new.society_id;
  new.handle := 'r_' || left(encode(extensions.digest(
    cf.field(3, salt) || cf.field(2, convert_to(new.person_id::text, 'UTF8'))
      || cf.field(2, convert_to(new.id, 'UTF8')), 'sha256'), 'hex'), 16);
  return new;
end
$$;
create trigger tenures_handle before insert on public.tenures
  for each row execute function cf.tenure_handle();

-- A tenure is never deleted (past flags depend on its handle) and the only
-- change it accepts is being closed once.
create function cf.tenure_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a tenure is closed, never deleted' using errcode = '42501';
  end if;
  if old.ends_on is not null
     or (new.id, new.society_id, new.flat_id, new.person_id, new.kind,
         new.parent_tenure_id, new.starts_on, new.handle)
        is distinct from
        (old.id, old.society_id, old.flat_id, old.person_id, old.kind,
         old.parent_tenure_id, old.starts_on, old.handle) then
    raise exception 'a tenure only changes by being closed' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger tenures_guard before update or delete on public.tenures
  for each row execute function cf.tenure_guard();

-- Closing an owner tenure closes its tenants', or a tenant keeps access
-- under a landlord who no longer owns the flat.
create function cf.tenure_cascade() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'owner' and old.ends_on is null and new.ends_on is not null then
    update public.tenures set ends_on = greatest(new.ends_on, starts_on)
      where parent_tenure_id = new.id and ends_on is null;
  end if;
  return new;
end
$$;
create trigger tenures_cascade after update of ends_on on public.tenures
  for each row execute function cf.tenure_cascade();

-- Projections of the chain. Rebuildable from chain_entries; written only by
-- cf.post().
create table public.committee_seats (
  society_id text not null references public.societies,
  person_id uuid not null references public.people,
  role text not null check (role in ('president', 'treasurer', 'secretary', 'member')),
  derived boolean not null default false,
  seated_seq bigint not null,
  unseated_seq bigint,
  primary key (society_id, person_id, seated_seq)
);
create unique index seats_one_active on public.committee_seats (society_id, person_id) where unseated_seq is null;
create unique index seats_one_officer on public.committee_seats (society_id, role)
  where unseated_seq is null and role <> 'member';

create table public.auditor_appointments (
  society_id text not null references public.societies,
  person_id uuid not null references public.people,
  fy text not null check (fy ~ '^[0-9]{4}-[0-9]{2}$'),
  appointment_seq bigint not null,
  -- Sorted ids of the committee that appointed this auditor: decides
  -- whether a later opinion may govern over an earlier one.
  appointing_set uuid[] not null,
  primary key (society_id, appointment_seq)
);

create table public.seen (
  person_id uuid primary key references public.people,
  last_seen_seq bigint not null default 0
);

-- ---------------------------------------------------------------- who am I

create function cf.person(p_user uuid, p_society text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.people where auth_user_id = p_user and society_id = p_society
$$;

create function cf.active_seat(p_society text, p_person uuid) returns public.committee_seats
language sql stable security definer set search_path = '' as $$
  select * from public.committee_seats
   where society_id = p_society and person_id = p_person and unseated_seq is null
$$;

create function cf.open_tenure(p_society text, p_person uuid) returns public.tenures
language sql stable security definer set search_path = '' as $$
  select * from public.tenures
   where society_id = p_society and person_id = p_person
     and starts_on <= current_date and (ends_on is null or ends_on >= current_date)
$$;

create function cf.is_auditor(p_society text, p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.auditor_appointments a
     where a.society_id = p_society and a.person_id = p_person
       and not exists (select 1 from public.chain_entries c
                        where c.society_id = p_society and c.kind = 'year_close'
                          and (c.body->>'appointment_seq')::bigint = a.appointment_seq))
$$;

create function cf.is_member(p_society text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.people p
     where p.society_id = p_society and p.auth_user_id = auth.uid()
       and ((cf.open_tenure(p_society, p.id)).id is not null
            or (cf.active_seat(p_society, p.id)).person_id is not null
            or exists (select 1 from public.auditor_appointments a
                        where a.society_id = p_society and a.person_id = p.id)))
$$;

create function cf.is_committee(p_society text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (cf.active_seat(p_society, cf.person(auth.uid(), p_society))).person_id is not null
$$;

-- Set-returning forms for RLS: evaluated once per query as a hashed
-- subplan, not once per row.
create function cf.my_societies() returns setof text
language sql stable security definer set search_path = '' as $$
  select p.society_id from public.people p
   where p.auth_user_id = auth.uid() and cf.is_member(p.society_id)
$$;

create function cf.my_committee_societies() returns setof text
language sql stable security definer set search_path = '' as $$
  select p.society_id from public.people p
   where p.auth_user_id = auth.uid() and (cf.active_seat(p.society_id, p.id)).person_id is not null
$$;

-- ---------------------------------------------------------------- RLS

alter table public.societies enable row level security;
alter table public.chain_entries enable row level security;
alter table public.people enable row level security;
alter table public.flats enable row level security;
alter table public.tenures enable row level security;
alter table public.committee_seats enable row level security;
alter table public.auditor_appointments enable row level security;
alter table public.seen enable row level security;

create policy members_read on public.societies for select to authenticated using (id in (select cf.my_societies()));
create policy members_read on public.chain_entries for select to authenticated using (society_id in (select cf.my_societies()));
create policy members_read on public.flats for select to authenticated using (society_id in (select cf.my_societies()));
create policy members_read on public.committee_seats for select to authenticated using (society_id in (select cf.my_societies()));
create policy members_read on public.auditor_appointments for select to authenticated using (society_id in (select cf.my_societies()));

-- Committee and auditors are named in the record they act on; residents are
-- not. A resident reads only their own row.
create policy self_or_officials on public.people for select to authenticated using (
  auth_user_id = auth.uid()
  or society_id in (select cf.my_committee_societies())
  or (society_id in (select cf.my_societies()) and (
       exists (select 1 from public.committee_seats s where s.person_id = people.id)
       or exists (select 1 from public.auditor_appointments a where a.person_id = people.id))));

-- A tenure maps a handle to a flat, so only its holder and the committee
-- read it. (Owners see their tenant's flags through api_my_tenant_flags.)
create policy self_or_committee on public.tenures for select to authenticated using (
  person_id in (select id from public.people where auth_user_id = auth.uid())
  or society_id in (select cf.my_committee_societies()));

create policy self on public.seen for all to authenticated
  using (person_id in (select id from public.people where auth_user_id = auth.uid()))
  with check (person_id in (select id from public.people where auth_user_id = auth.uid()));

grant select on public.societies, public.chain_entries, public.people, public.flats,
  public.tenures, public.committee_seats, public.auditor_appointments to authenticated;
grant select, insert, update on public.seen to authenticated;
revoke all on public.societies, public.chain_entries, public.people, public.flats,
  public.tenures, public.committee_seats, public.auditor_appointments, public.seen from anon;
