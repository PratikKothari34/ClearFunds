-- The president's setup draft and opening it (#10, #15). The draft writes no
-- chain entries; "Open the ledger" turns it into api_open_society's payload,
-- then the flats and tenures, in one transaction.

insert into storage.buckets (id, name, public) values ('society-docs', 'society-docs', false)
  on conflict (id) do nothing;

-- ---------------------------------------------------------------- helpers

create function cf.my_setup(p_user uuid, p_society text) returns public.society_setup
language plpgsql security definer set search_path = '' as $$
declare
  s public.society_setup;
begin
  select ss.* into s from public.society_setup ss join public.societies so on so.id = ss.society_id
   where ss.society_id = p_society and so.status <> 'open'
     and ss.president_person_id = cf.person(p_user, p_society)
   for update of ss;
  if s.society_id is null then
    perform cf.err('only the president can set up this society, and only before it opens');
  end if;
  return s;
end
$$;

-- Every problem that blocks opening, across the whole draft.
create function cf.setup_problems(d jsonb, m jsonb) returns jsonb
language sql stable set search_path = '' as $$
  with posts as (select x from jsonb_array_elements(coalesce(d->'posts', '[]')) x),
       com as (select x from jsonb_array_elements(coalesce(d->'committee', '[]')) x),
       res as (select x from jsonb_array_elements(coalesce(d->'residents', '[]')) x),
       flats as (select x from jsonb_array_elements(coalesce(d->'flats', '[]')) x),
       people as (select lower(btrim(x->>'personal_email')) e, lower(btrim(x->>'full_name')) n from com
                  union all select lower(btrim(x->>'personal_email')), lower(btrim(x->>'full_name')) from res),
       p(step, path, message) as (
    select 'details', 'details.name', 'The society needs a name.'
     where not coalesce(length(btrim(d#>>'{details,name}')) between 1 and 120, false)
    union all
    select 'committee', 'committee', 'A committee needs at least 3 members.'
     where (select count(*) from com) < 3
    union all
    select 'committee', 'committee', 'Nobody holds the post of ' || initcap(r) || '.'
      from unnest(array['president', 'treasurer', 'secretary']) r
     where not exists (select 1 from com join posts on posts.x->>'post_id' = com.x->>'post_id'
                        where posts.x->>'seat_role' = r)
    union all
    select 'committee', 'committee', e || ' holds more than one committee post.'
      from (select lower(btrim(x->>'personal_email')) e from com) c group by e having count(*) > 1
    union all
    select 'committee', 'committee', coalesce(x->>'full_name', 'A member') || ' needs a valid email.'
      from com where not cf.email_ok(x->>'personal_email')
    union all
    select 'residents', 'residents', coalesce(x->>'full_name', 'A resident') || ' needs a valid email.'
      from res where not cf.email_ok(x->>'personal_email')
    union all
    select 'residents', 'residents', e || ' is used for different names.'
      from people where e <> '' group by e having count(distinct n) > 1
    union all
    select 'flats', 'flats', 'Add at least one flat.' where not exists (select 1 from flats)
    union all
    select 'flats', 'flats', 'Flat ' || l || ' appears twice.'
      from (select x->>'label' l from flats) f group by l having count(*) > 1
    union all
    select 'residents', 'residents', 'Flat ' || (f.x->>'label') || ' has no owner.'
      from flats f where not exists (select 1 from res where res.x->>'flat_key' = f.x->>'flat_key'
                                                         and res.x->>'kind' = 'owner')
    union all
    select 'residents', 'residents', coalesce(t.x->>'full_name', 'A tenant') || '''s owner is not an owner of the same flat.'
      from res t where t.x->>'kind' = 'tenant' and not exists (
        select 1 from res o where o.x->>'person_key' = t.x->>'owner_key' and o.x->>'kind' = 'owner'
                              and o.x->>'flat_key' = t.x->>'flat_key')
    union all
    select 'tasks', 'tasks', 'Unknown task ' || t || '.'
      from jsonb_array_elements(coalesce(d->'tasks', '[]')) x, jsonb_array_elements_text(x->'tasks') t
     where t not in ('manage_residents', 'propose_expenses', 'raise_monthly_charges',
                     'respond_to_flags', 'review_payment_claims', 'send_dues_reminders')
    union all
    select 'minutes', 'minutes', 'Upload the election minutes.' where m is null)
  select coalesce(jsonb_agg(jsonb_build_object('step', step, 'path', path, 'message', message)), '[]') from p
$$;

-- ---------------------------------------------------------------- setup

create function public.api_setup_get(p_society text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.society_setup := cf.my_setup(auth.uid(), p_society);
begin
  return jsonb_build_object('status', (select status from public.societies where id = p_society),
    'draft', s.draft, 'minutes', s.minutes, 'problems', cf.setup_problems(s.draft, s.minutes));
end
$$;

create function public.api_setup_save(p_society text, p_step text, p_value jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.society_setup := cf.my_setup(auth.uid(), p_society);
  v jsonb := p_value;
begin
  if p_step not in ('details', 'posts', 'committee', 'flats', 'residents', 'money', 'tasks') then
    perform cf.err('unknown setup step');
  end if;
  if p_step = 'posts' then
    -- The three fixed posts cannot be removed; a new post gets its id here.
    if (select count(distinct x->>'seat_role') from jsonb_array_elements(v) x
         where x->>'seat_role' in ('president', 'treasurer', 'secretary')) <> 3
       or exists (select 1 from jsonb_array_elements(v) x
                   where x->>'seat_role' in ('president', 'treasurer', 'secretary')
                     and x->>'post_id' is distinct from (select y->>'post_id' from jsonb_array_elements(s.draft->'posts') y
                                                          where y->>'seat_role' = x->>'seat_role')) then
      perform cf.err('the President, Treasurer and Secretary posts cannot be removed');
    end if;
    select jsonb_agg(case when x->>'post_id' is null
                          then x || jsonb_build_object('post_id', cf.new_post_id(), 'seat_role', 'member')
                          else x end) into v
      from jsonb_array_elements(v) x;
    if exists (select 1 from jsonb_array_elements(v) x where not cf.text_ok(x->>'post_title', 60)) then
      perform cf.err('every post needs a title of at most 60 characters');
    end if;
  elsif p_step = 'money' then
    if jsonb_typeof(v->'approval_limit_minor') <> 'number' or (v->>'approval_limit_minor') !~ '^[0-9]{1,16}$'
       or jsonb_typeof(v->'monthly_charge_minor') <> 'number' or (v->>'monthly_charge_minor') !~ '^[0-9]{1,16}$' then
      perform cf.err('amounts must be whole numbers of paise');
    end if;
  end if;
  update public.society_setup set draft = jsonb_set(draft, array[p_step], v), updated_at = now()
   where society_id = p_society returning * into s;
  update public.societies set status = 'setup' where id = p_society and status = 'draft';
  return jsonb_build_object('draft', s.draft, 'problems', cf.setup_problems(s.draft, s.minutes));
end
$$;

-- Service only: the edge function stores the file and hashes it itself.
create function public.api_setup_minutes(p_user uuid, p_society text, p_minutes jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform cf.my_setup(p_user, p_society);
  update public.society_setup set minutes = p_minutes, updated_at = now() where society_id = p_society;
end
$$;

-- ---------------------------------------------------------------- open

-- Service only. p_minutes is the hash the edge function computed from the
-- stored object just now; it must match what was recorded at upload.
create function public.api_setup_open(p_user uuid, p_society text, p_confirm text, p_minutes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  s public.society_setup := cf.my_setup(p_user, p_society);
  d jsonb := s.draft;
  problems jsonb := cf.setup_problems(s.draft, s.minutes);
  r jsonb;
  fid jsonb := '{}';
  pid jsonb := '{}';
  ten jsonb := '{}';
  t text;
  i int := 0;
begin
  if jsonb_array_length(problems) > 0 then
    perform cf.err(problems->0->>'message');
  end if;
  if p_confirm is distinct from d#>>'{details,name}' then
    perform cf.err('type the society''s name exactly to open the ledger');
  end if;
  if p_minutes->>'sha256' is distinct from s.minutes->>'sha256' then
    perform cf.err('the stored minutes changed after upload: upload them again');
  end if;

  perform public.api_open_society(jsonb_build_object(
    'id', p_society, 'name', d#>>'{details,name}', 'city', d#>>'{details,city}',
    'fy_start_month', coalesce((d#>>'{details,fy_start_month}')::int, 4),
    'approval_limit_minor', coalesce((d#>>'{money,approval_limit_minor}')::bigint, 0),
    'minutes', s.minutes || jsonb_build_object('media_type', 'application/pdf'),
    'committee', (select jsonb_agg(jsonb_build_object(
        'name', c->>'full_name', 'email', c->>'personal_email', 'phone', c->>'phone',
        'role', po->>'seat_role', 'post_title', po->>'post_title',
        'tasks', coalesce((select tk->'tasks' from jsonb_array_elements(coalesce(d->'tasks', '[]')) tk
                            where tk->>'post_id' = po->>'post_id'), '[]'))
        order by po.o)
      from jsonb_array_elements(d->'posts') with ordinality po(po, o)
      join jsonb_array_elements(d->'committee') c on c->>'post_id' = po->>'post_id')));

  update public.societies set address = d#>>'{details,address}', registration_no = d#>>'{details,registration_no}',
    monthly_charge_minor = (d#>>'{money,monthly_charge_minor}')::bigint
   where id = p_society;

  for r in select x from jsonb_array_elements(d->'flats') x loop
    i := i + 1;
    insert into public.flats (society_id, ordinal, label, has_parking)
      values (p_society, i, btrim(r->>'label'), coalesce((r->>'has_parking')::boolean, false))
      returning to_jsonb(id) into r;
    fid := fid || jsonb_build_object((d->'flats'->(i - 1))->>'flat_key', r);
  end loop;

  -- Owners first, so each tenant can be held under the owner it names.
  for r in select x from jsonb_array_elements(d->'residents') x order by x->>'kind' = 'tenant' loop
    insert into public.people (society_id, full_name, email, phone)
      values (p_society, btrim(r->>'full_name'), lower(btrim(r->>'personal_email')), r->>'phone')
      on conflict (society_id, email) do update set full_name = public.people.full_name
      returning to_jsonb(id) into pid;
    insert into public.tenures (society_id, flat_id, person_id, kind, parent_tenure_id, resides)
      values (p_society, fid->>(r->>'flat_key'), (pid #>> '{}')::uuid, r->>'kind',
              case when r->>'kind' = 'tenant' then ten->>(r->>'owner_key') end,
              coalesce((r->>'resides')::boolean, true))
      returning id into t;
    ten := ten || jsonb_build_object(r->>'person_key', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------- privileges

revoke all on function cf.my_setup(uuid, text), cf.setup_problems(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.api_setup_minutes(uuid, text, jsonb), public.api_setup_open(uuid, text, text, jsonb),
  public.api_setup_get(text), public.api_setup_save(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.api_setup_get(text), public.api_setup_save(text, text, jsonb) to authenticated;
grant execute on function public.api_setup_minutes(uuid, text, jsonb), public.api_setup_open(uuid, text, text, jsonb)
  to service_role;
