-- Tasks gate who may start work (#10, #15). A task never completes a money
-- movement, so the approval rules are untouched: the existing writes move
-- into cf and gain a task check in front.

alter table public.people add column tour_done_at timestamptz;

create function cf.has_task(p_society text, p_person uuid, p_task text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts po
      join public.committee_seats s on s.society_id = po.society_id and s.person_id = po.holder
                                   and s.unseated_seq is null
     where po.society_id = p_society and po.holder = p_person and p_task = any(po.tasks))
$$;

-- Appends the full state of one post and updates its projection.
-- ---------------------------------------------------------------- after open

create function public.api_set_post(p_society text, p_post_id text, p_title text,
  p_holder uuid, p_tasks jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  po public.posts;
  hs public.committee_seats;
  rec public.chain_entries;
begin
  perform cf.lock(p_society);
  me := cf.require_person(auth.uid(), p_society);
  if (cf.active_seat(p_society, me)).role is distinct from 'president' then
    perform cf.err('only the president can change posts and tasks');
  end if;
  if p_post_id is null then
    po.post_id := cf.new_post_id();
    po.seat_role := 'member';
  else
    select * into po from public.posts where society_id = p_society and post_id = p_post_id;
    if po.post_id is null then
      perform cf.err('no such post');
    end if;
  end if;
  if p_holder is not null then
    hs := cf.active_seat(p_society, p_holder);
    if hs.person_id is null or (po.seat_role = 'member' and hs.role <> 'member') then
      perform cf.err('a post''s holder must hold that post''s seat');
    end if;
  end if;
  if po.seat_role <> 'member' and p_holder is distinct from po.holder then
    perform cf.err('the holder of a fixed post changes only when the seat changes');
  end if;
  rec := cf.set_post(p_society, me::text, po.post_id, p_title, po.seat_role, p_holder, p_tasks);
  return jsonb_build_object('seq', rec.sequence, 'post_id', po.post_id);
end
$$;

create function public.api_tour_done(p_society text) returns jsonb
language sql security definer set search_path = '' as $$
  update public.people set tour_done_at = now()
   where society_id = p_society and auth_user_id = auth.uid() and tour_done_at is null;
  select jsonb_build_object('ok', true);
$$;

-- ---------------------------------------------------------------- task checks

-- The cores keep every rule they had; only these wrappers are callable.
alter function public.api_propose(uuid, text, jsonb) set schema cf;
alter function cf.api_propose(uuid, text, jsonb) rename to propose_core;
alter function public.api_flag_note(text, bigint, text, text) set schema cf;
alter function cf.api_flag_note(text, bigint, text, text) rename to flag_note_core;
alter function public.api_add_person(text, text, text, text) set schema cf;
alter function cf.api_add_person(text, text, text, text) rename to add_person_core;
alter function public.api_add_tenure(text, uuid, text, text, date) set schema cf;
alter function cf.api_add_tenure(text, uuid, text, text, date) rename to add_tenure_core;
alter function public.api_close_tenure(text, text, date) set schema cf;
alter function cf.api_close_tenure(text, text, date) rename to close_tenure_core;

create function cf.require_task(p_society text, p_person uuid, p_task text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cf.has_task(p_society, p_person, p_task) then
    perform cf.err(format('%s is not one of your tasks', replace(p_task, '_', ' ')));
  end if;
end
$$;

-- Service calls (seed, setup) skip the task check, as they skipped the
-- committee check before.
create function cf.as_service() returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.role(), '') = 'service_role'
$$;

create function public.api_propose(p_user uuid, p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform cf.lock(p_society);
  if p->>'action' = 'expense' then
    perform cf.require_task(p_society, cf.require_person(p_user, p_society), 'propose_expenses');
  elsif p->>'action' = 'charge' then
    perform cf.require_task(p_society, cf.require_person(p_user, p_society), 'raise_monthly_charges');
  end if;
  return cf.propose_core(p_user, p_society, p);
end
$$;

create function public.api_flag_note(p_society text, p_flag_seq bigint, p_note text, p_text text)
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  perform cf.lock(p_society);
  if p_note = 'response' then
    perform cf.require_task(p_society, cf.require_person(auth.uid(), p_society), 'respond_to_flags');
  end if;
  return cf.flag_note_core(p_society, p_flag_seq, p_note, p_text);
end
$$;

create function public.api_add_person(p_society text, p_name text, p_email text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform cf.lock(p_society);
  if not cf.as_service() then
    perform cf.require_task(p_society, cf.require_person(auth.uid(), p_society), 'manage_residents');
  end if;
  return cf.add_person_core(p_society, p_name, p_email, p_phone);
end
$$;

create function public.api_add_tenure(p_society text, p_person uuid, p_flat text, p_kind text,
  p_starts date default null) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform cf.lock(p_society);
  if not cf.as_service() then
    perform cf.require_task(p_society, cf.require_person(auth.uid(), p_society), 'manage_residents');
  end if;
  return cf.add_tenure_core(p_society, p_person, p_flat, p_kind, p_starts);
end
$$;

create function public.api_close_tenure(p_society text, p_tenure text, p_ends date default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform cf.lock(p_society);
  if not cf.as_service() then
    perform cf.require_task(p_society, cf.require_person(auth.uid(), p_society), 'manage_residents');
  end if;
  perform cf.close_tenure_core(p_society, p_tenure, p_ends);
end
$$;

-- ---------------------------------------------------------------- me

create or replace function public.api_me(p_society text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.people;
  t public.tenures;
  s public.committee_seats;
begin
  select * into p from public.people
   where auth_user_id = auth.uid() and (p_society is null or society_id = p_society)
   order by created_at limit 1;
  if p.id is null then
    return null;
  end if;
  t := cf.open_tenure(p.society_id, p.id);
  s := cf.active_seat(p.society_id, p.id);
  return jsonb_build_object(
    'person', p.id, 'name', p.full_name, 'email', p.email,
    'society', (select to_jsonb(x) from public.societies x where x.id = p.society_id),
    'seat', case when s.person_id is null then null
                 else jsonb_build_object('role', s.role, 'derived', s.derived) end,
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('post_id', po.post_id, 'post_title', po.post_title,
                'seat_role', po.seat_role, 'tasks', to_jsonb(po.tasks)) order by po.ordinal), '[]')
                from public.posts po
               where po.society_id = p.society_id and po.holder = p.id and s.person_id is not null),
    -- Every year this person was appointed to audit, closed or not: an
    -- auditor who has signed off is still the auditor of that year.
    'auditor_for', (select coalesce(jsonb_agg(a.fy order by a.fy), '[]') from public.auditor_appointments a
                     where a.society_id = p.society_id and a.person_id = p.id),
    'tenure', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'handle', t.handle, 'flat_id', t.flat_id,
      'flat', (select label from public.flats where id = t.flat_id),
      'owner_can_see', t.kind = 'tenant') end,
    'tour_done_at', (extract(epoch from p.tour_done_at) * 1000)::bigint,
    'last_seen_seq', (select last_seen_seq from public.seen where person_id = p.id));
end
$$;

-- ---------------------------------------------------------------- privileges

revoke all on function cf.propose_core(uuid, text, jsonb), cf.flag_note_core(text, bigint, text, text),
  cf.add_person_core(text, text, text, text), cf.add_tenure_core(text, uuid, text, text, date),
  cf.close_tenure_core(text, text, date), cf.has_task(text, uuid, text),
  cf.require_task(text, uuid, text), cf.as_service()
  from public, anon, authenticated, service_role;
revoke all on function public.api_propose(uuid, text, jsonb), public.api_flag_note(text, bigint, text, text),
  public.api_add_person(text, text, text, text), public.api_add_tenure(text, uuid, text, text, date),
  public.api_close_tenure(text, text, date), public.api_set_post(text, text, text, uuid, jsonb),
  public.api_tour_done(text)
  from public, anon;

grant execute on function public.api_flag_note(text, bigint, text, text),
  public.api_add_person(text, text, text, text), public.api_add_tenure(text, uuid, text, text, date),
  public.api_close_tenure(text, text, date), public.api_set_post(text, text, text, uuid, jsonb),
  public.api_tour_done(text)
  to authenticated;
grant execute on function public.api_propose(uuid, text, jsonb), public.api_add_person(text, text, text, text),
  public.api_add_tenure(text, uuid, text, text, date)
  to service_role;
-- Supabase's default privileges grant new public functions to authenticated;
-- the signing-only propose must stay unreachable from a client.
revoke all on function public.api_propose(uuid, text, jsonb) from authenticated;
