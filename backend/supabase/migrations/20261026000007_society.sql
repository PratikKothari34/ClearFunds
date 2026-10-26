-- Society lifecycle and the setup kinds (#10, #15).
--
-- A society is 'draft' or 'setup' until it opens, and nothing writes to it
-- before then. Opening chains society_opened, the election minutes and one
-- tasks_set per post (contracts/chain/kinds/society.v1.md). The tasks are
-- recorded here and enforced by the next migration.

alter table public.societies add column status text not null default 'draft'
  check (status in ('draft', 'setup', 'open'));
update public.societies set status = 'open'
 where exists (select 1 from public.chain_entries c where c.society_id = societies.id);

alter table public.tenures add column resides boolean not null default true;

insert into cf.kinds (kind, layout, chainable) values
('document_attached', '[["purpose","text"],["file_name","text"],["media_type","text"],
  ["size_bytes","int"],["sha256","bytes"]]', true),
('tasks_set', '[["post_id","text"],["post_title","text"],["seat_role","text"],["holder","text?"],
  ["tasks","list<text>"]]', true);

-- Projection of the latest tasks_set per post. Written only by cf.set_post.
create table public.posts (
  society_id text not null references public.societies,
  post_id text not null check (post_id ~ '^pst_[a-z0-9]{8}$'),
  post_title text not null,
  seat_role text not null check (seat_role in ('president', 'treasurer', 'secretary', 'member')),
  holder uuid references public.people,
  tasks text[] not null,
  ordinal int not null,
  set_seq bigint not null,
  primary key (society_id, post_id)
);
create unique index posts_one_fixed on public.posts (society_id, seat_role) where seat_role <> 'member';

alter table public.posts enable row level security;
create policy members_read on public.posts for select to authenticated using (society_id in (select cf.my_societies()));
grant select on public.posts to authenticated;
revoke all on public.posts from anon;

-- ---------------------------------------------------------------- helpers

-- Every write takes this lock, so this is where an unopened society refuses.
create or replace function cf.lock(p_society text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.societies where id = p_society and status = 'open' for update;
  if not found then
    perform cf.err('This society is not open yet.');
  end if;
end
$$;

create function cf.tasks(p jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  t text;
begin
  if jsonb_typeof(coalesce(p, '[]')) <> 'array' then
    perform cf.err('tasks must be a list');
  end if;
  for t in select jsonb_array_elements_text(coalesce(p, '[]')) loop
    if t not in ('manage_residents', 'propose_expenses', 'raise_monthly_charges',
                 'respond_to_flags', 'review_payment_claims', 'send_dues_reminders') then
      perform cf.err(format('unknown task %s', t));
    end if;
  end loop;
  -- Distinct and ascending by UTF-8 bytes, as the layout requires.
  return (select coalesce(jsonb_agg(v order by v collate "C"), '[]')
            from (select distinct jsonb_array_elements_text(coalesce(p, '[]')) v) x);
end
$$;

create function cf.set_post(p_society text, p_actor text, p_post_id text, p_title text,
  p_role text, p_holder uuid, p_tasks jsonb) returns public.chain_entries
language plpgsql security definer set search_path = '' as $$
declare
  t jsonb := cf.tasks(p_tasks);
  rec public.chain_entries;
begin
  if not cf.text_ok(p_title, 60) then
    perform cf.err('a post needs a title of at most 60 characters');
  end if;
  rec := cf.append(p_society, 'tasks_set', p_actor, jsonb_build_object(
    'post_id', p_post_id, 'post_title', btrim(p_title), 'seat_role', p_role,
    'holder', p_holder::text, 'tasks', t));
  insert into public.posts (society_id, post_id, post_title, seat_role, holder, tasks, ordinal, set_seq)
    values (p_society, p_post_id, rec.body->>'post_title', p_role, p_holder,
            array(select jsonb_array_elements_text(t)),
            coalesce((select max(ordinal) + 1 from public.posts where society_id = p_society), 1), rec.sequence)
    on conflict (society_id, post_id) do update
      set post_title = excluded.post_title, holder = excluded.holder,
          tasks = excluded.tasks, set_seq = excluded.set_seq;
  return rec;
end
$$;

create function cf.new_post_id() returns text language sql volatile set search_path = '' as $$
  select 'pst_' || substr(md5(gen_random_uuid()::text), 1, 8)
$$;

-- ---------------------------------------------------------------- open

-- Service only. The setup route (#15 part B) builds `p` from the draft;
-- the seed and tests call it directly. Fails whole or not at all.
create or replace function public.api_open_society(p jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  sid text := coalesce(p->>'id', 'soc_' || substr(md5(gen_random_uuid()::text), 1, 8));
  m jsonb := p->'minutes';
  c jsonb;
  pid uuid;
  ids jsonb := '[]';
  roles jsonb := '[]';
  pids uuid[] := '{}';
  st text;
  rec public.chain_entries;
  i int := 0;
begin
  select status into st from public.societies where id = sid for update;
  if st = 'open' then
    perform cf.err('this society is already open');
  end if;
  if jsonb_array_length(coalesce(p->'committee', '[]')) < 3 then
    perform cf.err('a committee needs at least 3 members');
  end if;
  if (select count(*) filter (where x->>'role' = 'president') <> 1
          or count(*) filter (where x->>'role' = 'treasurer') <> 1
          or count(*) filter (where x->>'role' = 'secretary') <> 1
        from jsonb_array_elements(p->'committee') x) then
    perform cf.err('the committee needs exactly one president, one treasurer and one secretary');
  end if;
  if m is null or coalesce(m->>'sha256', '') !~ '^[0-9a-f]{64}$' or m->>'media_type' <> 'application/pdf'
     or coalesce((m->>'size_bytes')::bigint, 0) <= 0 or not cf.text_ok(m->>'file_name', 200) then
    perform cf.err('upload the election minutes before opening');
  end if;

  if st is null then
    insert into public.societies (id, name, city, currency, fy_start_month)
      values (sid, p->>'name', p->>'city', coalesce(p->>'currency', 'INR'), coalesce((p->>'fy_start_month')::int, 4));
    insert into private.society_secrets (society_id) values (sid);
  else
    update public.societies set name = p->>'name', city = p->>'city',
      fy_start_month = coalesce((p->>'fy_start_month')::int, 4) where id = sid;
  end if;

  for c in select value from jsonb_array_elements(p->'committee') loop
    insert into public.people (society_id, full_name, email, phone, auth_user_id)
      values (sid, c->>'name', lower(c->>'email'), c->>'phone',
              (select id from auth.users where email = lower(c->>'email')))
      on conflict (society_id, email) do update set full_name = excluded.full_name
      returning id into pid;
    ids := ids || to_jsonb(pid::text);
    roles := roles || to_jsonb(coalesce(c->>'role', 'member'));
    pids := pids || pid;
  end loop;
  rec := cf.append(sid, 'society_opened', null, jsonb_build_object(
    'name', p->>'name', 'currency', coalesce(p->>'currency', 'INR'),
    'fy_start_month', coalesce((p->>'fy_start_month')::int, 4),
    'approval_limit_minor', coalesce((p->>'approval_limit_minor')::bigint, 0),
    'committee', ids, 'roles', roles));
  insert into public.committee_seats (society_id, person_id, role, seated_seq)
    select sid, (i.v #>> '{}')::uuid, r.v #>> '{}', rec.sequence
      from jsonb_array_elements(ids) with ordinality i(v, o)
      join jsonb_array_elements(roles) with ordinality r(v, o2) on r.o2 = i.o;

  perform cf.append(sid, 'document_attached', pids[array_position(
      array(select x->>'role' from jsonb_array_elements(p->'committee') x), 'president')]::text,
    jsonb_build_object('purpose', 'election_minutes', 'file_name', m->>'file_name',
      'media_type', m->>'media_type', 'size_bytes', (m->>'size_bytes')::bigint, 'sha256', m->>'sha256'));

  -- One post per committee member, in committee order.
  for c in select value from jsonb_array_elements(p->'committee') loop
    i := i + 1;
    perform cf.set_post(sid, pids[array_position(
        array(select x->>'role' from jsonb_array_elements(p->'committee') x), 'president')]::text,
      cf.new_post_id(),
      coalesce(c->>'post_title', initcap(coalesce(c->>'role', 'member'))),
      coalesce(c->>'role', 'member'), pids[i], c->'tasks');
  end loop;

  update public.societies set status = 'open' where id = sid;
  return sid;
end
$$;

-- ---------------------------------------------------------------- holders

-- A seat or unseat posting moves the matching post's holder, recorded with
-- the actor absent in the same transaction (society.v1.md).
create function cf.follow_seats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  po public.posts;
begin
  if tg_op = 'INSERT' and new.role <> 'member' then
    select * into po from public.posts where society_id = new.society_id and seat_role = new.role;
    if po.post_id is not null and po.holder is distinct from new.person_id then
      perform cf.set_post(new.society_id, null, po.post_id, po.post_title, po.seat_role,
                          new.person_id, to_jsonb(po.tasks));
    end if;
  elsif tg_op = 'UPDATE' and old.unseated_seq is null and new.unseated_seq is not null then
    for po in select * from public.posts where society_id = new.society_id and holder = new.person_id loop
      perform cf.set_post(new.society_id, null, po.post_id, po.post_title, po.seat_role,
                          null, to_jsonb(po.tasks));
    end loop;
  end if;
  return null;
end
$$;

create trigger follow_seats after insert or update on public.committee_seats
  for each row execute function cf.follow_seats();

-- ---------------------------------------------------------------- privileges

revoke all on function cf.set_post(text, text, text, text, text, uuid, jsonb), cf.tasks(jsonb),
  cf.new_post_id(), cf.follow_seats()
  from public, anon, authenticated, service_role;
