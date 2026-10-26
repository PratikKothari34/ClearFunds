-- Files attached to notices (#59, contract #60).
--
-- The president uploads a file to an unpublished draft; the edge function
-- stores it and computes its hash. The draft's revision lists the files it
-- carries, so changing them clears approvals like any edit, and publishing
-- chains the approved list as notice.attachments. The three functions below
-- are 14's with only those changes.

create table private.notice_attachments (
  draft_id bigint not null references private.notice_drafts,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text not null,
  media_type text not null check (media_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  path text not null,
  uploaded_at timestamptz not null default now(),
  primary key (draft_id, sha256)
);

create or replace function cf.check_notice(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
  if jsonb_typeof(coalesce(p->'attachments', '[]')) <> 'array'
     or jsonb_array_length(coalesce(p->'attachments', '[]')) > 10
     or exists (select 1 from jsonb_array_elements_text(coalesce(p->'attachments', '[]')) a where a !~ '^[0-9a-f]{64}$')
     or (select count(distinct a) from jsonb_array_elements_text(coalesce(p->'attachments', '[]')) a)
        <> jsonb_array_length(coalesce(p->'attachments', '[]')) then
    perform cf.err('attachments are up to 10 different uploaded files');
  end if;
  return jsonb_build_object('title', btrim(p->>'title'), 'body', btrim(p->>'body'),
    'corrects_seq', p->'corrects_seq', 'vote', case when v = 'null'::jsonb then null else v end,
    'attachments', coalesce(p->'attachments', '[]'::jsonb));
end
$function$;

create or replace function public.api_notice_draft(p_society text, p_draft_id bigint, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if exists (select 1 from jsonb_array_elements_text(c->'attachments') a
              where not exists (select 1 from private.notice_attachments x where x.draft_id = d.id and x.sha256 = a)) then
    perform cf.err('attach only files uploaded to this draft');
  end if;
  update private.notice_drafts set pinned = coalesce((p->>'pinned')::boolean, false) where id = d.id;
  rev := coalesce(cf.current_revision(d.id), 0) + 1;
  insert into private.notice_revisions (draft_id, revision, content) values (d.id, rev, c);
  return jsonb_build_object('draft_id', d.id, 'revision', rev);
end
$function$;

create or replace function public.api_publish_notice(p_user uuid, p_society text, p_draft_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    'title', c->>'title', 'body', c->>'body', 'attachments', coalesce(c->'attachments', '[]'::jsonb),
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
$function$;

-- Service only: the edge route checks the draft (no path), then records the
-- file it has stored and hashed (with its path).
create function public.api_notice_attachment_store(p_user uuid, p_society text, p_draft_id bigint, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d private.notice_drafts;
begin
  perform cf.lock(p_society);
  select * into d from private.notice_drafts where id = p_draft_id and society_id = p_society for update;
  if d.id is null or d.published_seq is not null or d.author is distinct from cf.person(p_user, p_society)
     or (cf.active_seat(p_society, d.author)).role is distinct from 'president' then
    perform cf.err('only the president attaches files, to their own unpublished draft');
  end if;
  -- A draft's files together stay openable on mobile data (contract #60).
  if coalesce((select sum(size_bytes) from private.notice_attachments where draft_id = d.id and sha256 <> coalesce(p->>'sha256', '')), 0)
     + coalesce((p->>'size_bytes')::bigint, 0) > 20971520 then
    perform cf.err('a notice''s files together must be at most 20 MB');
  end if;
  -- Without a path this is the check the edge function makes before storing.
  if p->>'path' is null then
    return;
  end if;
  insert into private.notice_attachments (draft_id, sha256, file_name, media_type, size_bytes, path)
    values (d.id, p->>'sha256', p->>'file_name', p->>'media_type', (p->>'size_bytes')::bigint, p->>'path')
    on conflict (draft_id, sha256) do nothing;
end
$$;

-- Service only: where a file is, if this person may read it. A member reads a
-- published notice's files; the committee also reads its drafts'.
create function public.api_notice_attachment_find(p_user uuid, p_society text, p_sha256 text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := cf.require_person(p_user, p_society);
  a private.notice_attachments;
begin
  select x.* into a from private.notice_attachments x join private.notice_drafts d on d.id = x.draft_id
   where d.society_id = p_society and x.sha256 = lower(p_sha256)
     and ((d.published_seq is not null and exists (select 1 from public.chain_entries n
             where n.society_id = p_society and n.sequence = d.published_seq and n.body->'attachments' ? x.sha256)
           and ((cf.open_tenure(p_society, me)).id is not null or (cf.active_seat(p_society, me)).person_id is not null
                or exists (select 1 from public.auditor_appointments au where au.society_id = p_society and au.person_id = me)))
          or (cf.active_seat(p_society, me)).person_id is not null)
   order by d.published_seq nulls last limit 1;
  if a.draft_id is null then
    perform cf.err('no such file, or you cannot read it');
  end if;
  return jsonb_build_object('path', a.path, 'file_name', a.file_name, 'media_type', a.media_type);
end
$$;

revoke all on function public.api_notice_attachment_store(uuid, text, bigint, jsonb),
  public.api_notice_attachment_find(uuid, text, text) from public, anon, authenticated;
grant execute on function public.api_notice_attachment_store(uuid, text, bigint, jsonb),
  public.api_notice_attachment_find(uuid, text, text) to service_role;
