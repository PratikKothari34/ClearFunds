-- Notices reviewed by the committee before they are published (#13, #18).
--
-- The president drafts; every save is a new revision; committee members
-- approve a revision or ask for changes. Publishing needs ceil(2M/3)
-- approvals of the current revision, the president's own included, and
-- chains the notice and any vote it carries (contracts/chain/kinds/notices.v1.md).

insert into cf.kinds (kind, layout, chainable) values
('notice', '[["title","text"],["body","text"],["attachments","list<bytes>"],["revision","int"],
  ["approvers","list<text>"],["corrects_seq","int?"]]', true),
('vote_opened', '[["notice_seq","int"],["question","text"],["options","list<text>"],["max_picks","int"],
  ["mode","text"],["eligible_flats","int"],["closes_at","int"]]', true);

create table private.notice_drafts (
  id bigint generated always as identity primary key,
  society_id text not null references public.societies,
  author uuid not null references public.people,
  -- ceil(2M/3) when first saved; publishing uses the higher of this and now.
  required int not null,
  pinned boolean not null default false,
  published_seq bigint,
  created_at timestamptz not null default now()
);

create table private.notice_revisions (
  draft_id bigint not null references private.notice_drafts,
  revision int not null,
  content jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (draft_id, revision)
);

create table private.notice_reviews (
  id bigint generated always as identity primary key,
  draft_id bigint not null references private.notice_drafts,
  revision int not null,
  reviewer uuid not null references public.people,
  decision text not null check (decision in ('approve', 'changes_requested')),
  comment text,
  at timestamptz not null default now()
);

-- The vote a published notice opened, and the flats eligible when it did.
create table public.votes (
  society_id text not null references public.societies,
  vote_seq bigint not null,
  notice_seq bigint not null,
  options text[] not null,
  max_picks int not null,
  mode text not null,
  closes_at timestamptz not null,
  eligible int not null,
  closed_seq bigint,
  tallies int[],
  carried int,
  primary key (society_id, vote_seq)
);
create table private.vote_flats (
  society_id text not null,
  vote_seq bigint not null,
  flat_id text not null,
  primary key (society_id, vote_seq, flat_id)
);

alter table public.votes enable row level security;
revoke all on public.votes from anon, authenticated;

-- ---------------------------------------------------------------- helpers

create function cf.current_revision(p_draft bigint) returns int
language sql stable security definer set search_path = '' as $$
  select max(revision) from private.notice_revisions where draft_id = p_draft
$$;

-- Approvals of the current revision (the author's counts) and open change
-- requests: a reviewer whose latest word is changes_requested.
create function cf.notice_state_raw(p_draft bigint) returns table (approvers uuid[], open_requests int, required int)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (reviewer) reviewer, revision, decision from private.notice_reviews
     where draft_id = p_draft order by reviewer, id desc)
  select array(select d.author union select l.reviewer from latest l
                where l.decision = 'approve' and l.revision = cf.current_revision(p_draft)
                  and (cf.active_seat(d.society_id, l.reviewer)).person_id is not null order by 1),
         (select count(*)::int from latest where decision = 'changes_requested'),
         greatest(d.required, cf.required_committee(d.society_id))
    from private.notice_drafts d
   where d.id = p_draft
$$;

-- The same, answered only for the reader's own committee: the view calls it.
create function cf.notice_state(p_draft bigint) returns table (approvers uuid[], open_requests int, required int)
language sql stable security definer set search_path = '' as $$
  select r.* from cf.notice_state_raw(p_draft) r
   where (select society_id from private.notice_drafts where id = p_draft) in (select cf.my_committee_societies())
$$;

create function cf.check_notice(p jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v jsonb := p->'vote';
  n int;
begin
  if not cf.text_ok(p->>'title', 120) or not cf.text_ok(p->>'body', 5000) then
    perform cf.err('a notice needs a title of at most 120 characters and a body of at most 5,000');
  end if;
  if v is not null and v <> 'null'::jsonb then
    n := jsonb_array_length(coalesce(v->'options', '[]'));
    if not cf.text_ok(v->>'question', 300) or n not between 2 and 10
       or exists (select 1 from jsonb_array_elements_text(v->'options') o where not cf.text_ok(o, 100))
       or (select count(distinct lower(btrim(o))) from jsonb_array_elements_text(v->'options') o) <> n then
      perform cf.err('a vote needs a question and 2 to 10 different options of at most 100 characters');
    end if;
    if coalesce((v->>'max_picks')::int, 0) not between 1 and n then
      perform cf.err('a voter picks at least 1 option and no more than there are');
    end if;
    if v->>'mode' is null or v->>'mode' not in ('named', 'anonymous') then
      perform cf.err('a vote is named or anonymous');
    end if;
    if (v->>'closes_at') !~ '^[0-9]{13}$' then
      perform cf.err('a vote needs a closing time');
    end if;
  end if;
  return jsonb_build_object('title', btrim(p->>'title'), 'body', btrim(p->>'body'),
    'corrects_seq', p->'corrects_seq', 'vote', case when v = 'null'::jsonb then null else v end);
end
$$;

-- ---------------------------------------------------------------- draft and review

create function public.api_notice_draft(p_society text, p_draft_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  d private.notice_drafts;
  c jsonb := cf.check_notice(p);
  rev int;
begin
  perform cf.lock(p_society);
  me := cf.require_person(auth.uid(), p_society);
  if (cf.active_seat(p_society, me)).role is distinct from 'president' then
    perform cf.err('only the president drafts notices');
  end if;
  if c->'corrects_seq' <> 'null'::jsonb and not exists (select 1 from public.chain_entries
       where society_id = p_society and sequence = (c->>'corrects_seq')::bigint and kind = 'notice') then
    perform cf.err('a correction names a published notice');
  end if;
  if p_draft_id is null then
    insert into private.notice_drafts (society_id, author, required)
      values (p_society, me, cf.required_committee(p_society)) returning * into d;
  else
    select * into d from private.notice_drafts where id = p_draft_id and society_id = p_society for update;
    if d.id is null or d.published_seq is not null then
      perform cf.err('no such draft, or it is already published');
    end if;
  end if;
  update private.notice_drafts set pinned = coalesce((p->>'pinned')::boolean, false) where id = d.id;
  rev := coalesce(cf.current_revision(d.id), 0) + 1;
  insert into private.notice_revisions (draft_id, revision, content) values (d.id, rev, c);
  return jsonb_build_object('draft_id', d.id, 'revision', rev);
end
$$;

create function public.api_notice_review(p_society text, p_draft_id bigint, p_revision int,
  p_decision text, p_comment text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  d private.notice_drafts;
begin
  perform cf.lock(p_society);
  me := cf.require_person(auth.uid(), p_society);
  perform cf.require_seat(p_society, me);
  select * into d from private.notice_drafts where id = p_draft_id and society_id = p_society;
  if d.id is null or d.published_seq is not null then
    perform cf.err('no such draft, or it is already published');
  end if;
  if me = d.author then
    perform cf.err('the president''s own revision already counts as their approval');
  end if;
  if p_revision is distinct from cf.current_revision(d.id) then
    perform cf.err('review the latest revision');
  end if;
  if p_decision not in ('approve', 'changes_requested') then
    perform cf.err('approve or request changes');
  end if;
  if p_decision = 'changes_requested' and not cf.text_ok(p_comment, 1000) then
    perform cf.err('say what should change');
  end if;
  insert into private.notice_reviews (draft_id, revision, reviewer, decision, comment)
    values (d.id, p_revision, me, p_decision, nullif(btrim(p_comment), ''));
  return jsonb_build_object('ok', true);
end
$$;

-- ---------------------------------------------------------------- publish

-- Service only: the edge route /publish-notice.
create function public.api_publish_notice(p_user uuid, p_society text, p_draft_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  d private.notice_drafts;
  c jsonb;
  st record;
  rec public.chain_entries;
  vrec public.chain_entries;
  v jsonb;
begin
  perform cf.lock(p_society);
  me := cf.require_person(p_user, p_society);
  select * into d from private.notice_drafts where id = p_draft_id and society_id = p_society for update;
  if d.published_seq is not null then
    perform cf.err('this notice is already published');
  end if;
  if d.id is null or d.author <> me or (cf.active_seat(p_society, me)).role is distinct from 'president' then
    perform cf.err('only the president publishes their own draft');
  end if;
  select * into st from cf.notice_state_raw(d.id);
  if st.open_requests > 0 then
    perform cf.err('a change request is still open');
  end if;
  if cardinality(st.approvers) < st.required then
    perform cf.err(format('%s of %s approvals so far', cardinality(st.approvers), st.required));
  end if;
  select content into c from private.notice_revisions where draft_id = d.id and revision = cf.current_revision(d.id);
  v := nullif(c->'vote', 'null'::jsonb);  -- a draft without a vote stores JSON null
  if v is not null and (v->>'closes_at')::bigint < extract(epoch from now() + interval '1 hour') * 1000 then
    perform cf.err('the vote must close at least an hour after publishing');
  end if;
  rec := cf.append(p_society, 'notice', me::text, jsonb_build_object(
    'title', c->>'title', 'body', c->>'body', 'attachments', '[]'::jsonb,
    'revision', cf.current_revision(d.id),
    'approvers', (select jsonb_agg(a::text order by a::text) from unnest(st.approvers) a),
    'corrects_seq', c->'corrects_seq'));
  update private.notice_drafts set published_seq = rec.sequence where id = d.id;
  if v is not null then
    insert into private.vote_flats (society_id, vote_seq, flat_id)
      select distinct p_society, -1, t.flat_id from public.tenures t
       where t.society_id = p_society and t.starts_on <= cf.today() and (t.ends_on is null or t.ends_on >= cf.today());
    vrec := cf.append(p_society, 'vote_opened', me::text, jsonb_build_object(
      'notice_seq', rec.sequence, 'question', v->>'question', 'options', v->'options',
      'max_picks', (v->>'max_picks')::int, 'mode', v->>'mode',
      'eligible_flats', (select count(*) from private.vote_flats where society_id = p_society and vote_seq = -1),
      'closes_at', (v->>'closes_at')::bigint));
    update private.vote_flats set vote_seq = vrec.sequence where society_id = p_society and vote_seq = -1;
    insert into public.votes (society_id, vote_seq, notice_seq, options, max_picks, mode, closes_at, eligible)
      values (p_society, vrec.sequence, rec.sequence, array(select jsonb_array_elements_text(v->'options')),
              (v->>'max_picks')::int, v->>'mode', to_timestamp((v->>'closes_at')::bigint / 1000.0),
              (vrec.body->>'eligible_flats')::int);
  end if;
  return jsonb_build_object('notice_seq', rec.sequence, 'vote_seq', vrec.sequence);
end
$$;

-- ---------------------------------------------------------------- reads

create view public.notice_drafts as
select d.society_id, d.id as draft_id, r.revision, r.content->>'title' as title, r.content->>'body' as body,
       d.pinned, r.content->'corrects_seq' as corrects_seq, r.content->'vote' as vote,
       st.required, cardinality(st.approvers) as approvals, st.open_requests as open_change_requests,
       (select coalesce(jsonb_agg(jsonb_build_object('reviewer', p.full_name, 'revision', x.revision,
          'decision', x.decision, 'comment', x.comment, 'at', (extract(epoch from x.at) * 1000)::bigint) order by x.id), '[]')
          from private.notice_reviews x join public.people p on p.id = x.reviewer where x.draft_id = d.id) as reviews,
       d.published_seq
  from private.notice_drafts d
  join private.notice_revisions r on r.draft_id = d.id and r.revision = cf.current_revision(d.id)
  cross join lateral cf.notice_state(d.id) st
 where d.society_id in (select cf.my_committee_societies());

create view public.notices as
select n.society_id, n.sequence as seq, n.body->>'title' as title, n.body->>'body' as body,
       n.body->'attachments' as attachments, coalesce(d.pinned, false) as pinned,
       (n.body->>'corrects_seq')::bigint as corrects_seq,
       (select min(c.sequence) from public.chain_entries c where c.society_id = n.society_id and c.kind = 'notice'
          and (c.body->>'corrects_seq')::bigint = n.sequence) as corrected_by,
       n.recorded_at as published_at,
       (select jsonb_build_object('seq', v.vote_seq, 'question', o.body->>'question', 'options', o.body->'options',
          'max_picks', v.max_picks, 'mode', v.mode, 'closes_at', (o.body->>'closes_at')::bigint,
          'eligible_flats', v.eligible, 'closed', v.closed_seq is not null)
          from public.votes v join public.chain_entries o on o.society_id = v.society_id and o.sequence = v.vote_seq
         where v.society_id = n.society_id and v.notice_seq = n.sequence) as vote
  from public.chain_entries n
  left join private.notice_drafts d on d.society_id = n.society_id and d.published_seq = n.sequence
 where n.kind = 'notice' and n.society_id in (select cf.my_societies());

grant select on public.notice_drafts, public.notices to authenticated;
revoke all on public.notice_drafts, public.notices from anon;

-- ---------------------------------------------------------------- privileges

revoke all on function cf.current_revision(bigint), cf.notice_state_raw(bigint), cf.notice_state(bigint), cf.check_notice(jsonb)
  from public, anon, authenticated, service_role;
-- The notice_drafts view calls these as the reader; notice_state answers only
-- for the reader's own committee.
grant execute on function cf.current_revision(bigint), cf.notice_state(bigint), cf.required_committee(text)
  to authenticated;
revoke all on function public.api_notice_draft(text, bigint, jsonb), public.api_notice_review(text, bigint, int, text, text),
  public.api_publish_notice(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.api_notice_draft(text, bigint, jsonb),
  public.api_notice_review(text, bigint, int, text, text) to authenticated;
grant execute on function public.api_publish_notice(uuid, text, bigint) to service_role;
