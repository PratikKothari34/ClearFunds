-- Platform onboarding (#10, #15). A platform admin creates a society in
-- 'draft' and registers its president, and can do nothing to it once it is
-- open. The president's draft lives in society_setup; the next migration
-- edits and opens it.

create table public.platform_admins (
  auth_user_id uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.societies add column address text, add column registration_no text,
  add column flat_count int, add column monthly_charge_minor bigint;

create table public.society_setup (
  society_id text primary key references public.societies,
  president_person_id uuid not null references public.people,
  draft jsonb not null default '{}',
  -- The uploaded minutes as the server hashed them: file_name, size_bytes, sha256.
  minutes jsonb,
  updated_at timestamptz not null default now()
);

-- Neither table is read over REST; only the functions below touch them.
alter table public.platform_admins enable row level security;
alter table public.society_setup enable row level security;
revoke all on public.platform_admins, public.society_setup from anon, authenticated;

-- ---------------------------------------------------------------- helpers

create function cf.mask_email(e text) returns text language sql immutable set search_path = '' as $$
  select left(e, 1) || '•••@' || split_part(e, '@', 2)
$$;

create function cf.email_ok(e text) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(e, '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
$$;

create function cf.require_platform(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.platform_admins where auth_user_id = p_user) then
    perform cf.err('only a ClearFunds platform admin can do this');
  end if;
end
$$;

-- The setup row, if the caller is its president and the society is not open.
-- ---------------------------------------------------------------- platform

create function public.api_platform_create(p_user uuid, p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  sid text := 'soc_' || substr(md5(gen_random_uuid()::text), 1, 8);
  pr jsonb := p->'president';
  pid uuid;
begin
  perform cf.require_platform(p_user);
  if not cf.text_ok(p->>'name', 120) then
    perform cf.err('a society needs a name of at most 120 characters');
  end if;
  if coalesce((p->>'flat_count')::int, 0) not between 1 and 500 then
    perform cf.err('flat count must be between 1 and 500');
  end if;
  if coalesce((p->>'fy_start_month')::int, 4) not between 1 and 12 then
    perform cf.err('the financial year starts in a month from 1 to 12');
  end if;
  if not cf.text_ok(pr->>'full_name', 120) or not cf.email_ok(pr->>'personal_email') then
    perform cf.err('the president needs a name and a valid email');
  end if;
  insert into public.societies (id, name, city, address, registration_no, flat_count, fy_start_month)
    values (sid, btrim(p->>'name'), p->>'city', p->>'address', p->>'registration_no',
            (p->>'flat_count')::int, coalesce((p->>'fy_start_month')::int, 4));
  insert into private.society_secrets (society_id) values (sid);
  insert into public.people (society_id, full_name, email, phone)
    values (sid, btrim(pr->>'full_name'), lower(btrim(pr->>'personal_email')), pr->>'phone')
    returning id into pid;
  insert into public.society_setup (society_id, president_person_id, draft) values (sid, pid,
    jsonb_build_object(
      'details', jsonb_build_object('name', btrim(p->>'name'), 'city', p->>'city', 'address', p->>'address',
                                    'registration_no', p->>'registration_no',
                                    'fy_start_month', coalesce((p->>'fy_start_month')::int, 4)),
      'posts', jsonb_build_array(
        jsonb_build_object('post_id', cf.new_post_id(), 'post_title', 'President', 'seat_role', 'president'),
        jsonb_build_object('post_id', cf.new_post_id(), 'post_title', 'Treasurer', 'seat_role', 'treasurer'),
        jsonb_build_object('post_id', cf.new_post_id(), 'post_title', 'Secretary', 'seat_role', 'secretary')),
      'committee', '[]'::jsonb));
  -- The president holds the President post from the start.
  update public.society_setup set draft = jsonb_set(draft, '{committee}', jsonb_build_array(jsonb_build_object(
      'post_id', draft#>>'{posts,0,post_id}', 'full_name', btrim(pr->>'full_name'),
      'personal_email', lower(btrim(pr->>'personal_email')), 'phone', pr->>'phone')))
   where society_id = sid;
  return sid;
end
$$;

create function public.api_platform_list(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform cf.require_platform(p_user);
  return (select coalesce(jsonb_agg(jsonb_build_object('society', s.id, 'name', s.name, 'status', s.status,
            'president_name', p.full_name, 'president_email_masked', cf.mask_email(p.email),
            'created_at', (extract(epoch from s.created_at) * 1000)::bigint) order by s.created_at desc), '[]')
            from public.societies s
            left join public.society_setup ss on ss.society_id = s.id
            left join public.people p on p.id = ss.president_person_id);
end
$$;

create function public.api_platform_president(p_user uuid, p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
begin
  perform cf.require_platform(p_user);
  if (select status from public.societies where id = p_society for update) is distinct from 'draft'
     and (select status from public.societies where id = p_society) is distinct from 'setup' then
    perform cf.err('the president of an open society changes only by a committee vote');
  end if;
  if not cf.text_ok(p->>'full_name', 120) or not cf.email_ok(p->>'personal_email') then
    perform cf.err('the president needs a name and a valid email');
  end if;
  insert into public.people (society_id, full_name, email, phone)
    values (p_society, btrim(p->>'full_name'), lower(btrim(p->>'personal_email')), p->>'phone')
    on conflict (society_id, email) do update set full_name = excluded.full_name, phone = excluded.phone
    returning id into pid;
  update public.society_setup ss set president_person_id = pid,
    draft = jsonb_set(draft, '{committee}', coalesce((
      select jsonb_agg(case when c->>'post_id' = (select x->>'post_id' from jsonb_array_elements(ss.draft->'posts') x
                                                   where x->>'seat_role' = 'president')
                            then c || jsonb_build_object('full_name', btrim(p->>'full_name'),
                                       'personal_email', lower(btrim(p->>'personal_email')), 'phone', p->>'phone')
                            else c end)
        from jsonb_array_elements(ss.draft->'committee') c), '[]')),
    updated_at = now()
   where society_id = p_society;
  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------- privileges

revoke all on function cf.mask_email(text), cf.email_ok(text), cf.require_platform(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.api_platform_create(uuid, jsonb), public.api_platform_list(uuid),
  public.api_platform_president(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.api_platform_create(uuid, jsonb), public.api_platform_list(uuid),
  public.api_platform_president(uuid, text, jsonb) to service_role;
