-- Looking up any fingerprint, entry number or id (#14, #19).
--
-- Returns only what a member can already read in chain_entries. A miss is an
-- empty list; the client says nothing in the chain it was sent matches, never
-- that the fingerprint is fake (AGENTS.md item 9).

create index chain_entries_hash on public.chain_entries (society_id, entry_hash);
create index chain_entries_prev on public.chain_entries (society_id, prev_hash);
create index chain_entries_hash_prefix on public.chain_entries (society_id, encode(entry_hash, 'hex') text_pattern_ops);

create function public.api_lookup(p_society text, p_q text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(btrim(coalesce(p_q, '')));
  h bytea;
  r jsonb;
begin
  if not cf.is_member(p_society) then
    perform cf.err('no account in this society');
  end if;
  if q ~ '^[0-9a-f]{64}$' then
    h := decode(q, 'hex');
    select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'kind', kind, 'matched_on', m) order by seq, m), '[]') into r from (
      select sequence seq, kind, 'entry_hash' m from public.chain_entries where society_id = p_society and entry_hash = h
      union all
      select sequence, kind, 'prev_hash' from public.chain_entries where society_id = p_society and prev_hash = h
      union all
      select sequence, kind, 'proposal_hash' from public.chain_entries
       where society_id = p_society and kind = 'approval' and body->>'proposal_hash' = q
      union all
      select sequence, kind, 'file_sha256' from public.chain_entries
       where society_id = p_society and ((kind = 'document_attached' and body->>'sha256' = q)
                                         or (kind = 'notice' and body->'attachments' ? q))) x;
  elsif q ~ '^[0-9a-f]{8,63}$' then
    select coalesce(jsonb_agg(jsonb_build_object('seq', sequence, 'kind', kind, 'matched_on', 'entry_hash') order by sequence), '[]')
      into r from public.chain_entries
     where society_id = p_society and encode(entry_hash, 'hex') like q || '%';
  elsif q ~ '^[0-9]{1,15}$' then
    select coalesce(jsonb_agg(jsonb_build_object('seq', sequence, 'kind', kind, 'matched_on', 'seq')), '[]')
      into r from public.chain_entries where society_id = p_society and sequence = q::bigint;
  elsif q ~ '^[nvc]-[0-9]{1,15}$' then
    select coalesce(jsonb_agg(jsonb_build_object('seq', sequence, 'kind', kind, 'matched_on', 'id')), '[]')
      into r from public.chain_entries
     where society_id = p_society and sequence = substr(q, 3)::bigint
       and kind = case left(q, 1) when 'n' then 'notice' when 'v' then 'vote_opened' else 'payment_claim' end;
  else
    perform cf.err('Paste a full fingerprint, at least its first 8 characters, an entry number, or an id like V-41.');
  end if;
  return r;
end
$$;

create function public.api_entry_context(p_society text, p_seq bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.chain_entries;
  b jsonb;
  pr public.chain_entries;
  links jsonb;
  shown jsonb := '[]';
  flat text;
begin
  if not cf.is_member(p_society) then
    perform cf.err('no account in this society');
  end if;
  e := cf.entry(p_society, p_seq);
  if e.sequence is null then
    perform cf.err('no such entry');
  end if;
  b := e.body;

  with c as (select * from public.chain_entries where society_id = p_society),
  l(seq, kind, relation) as (
    -- what points at this entry
    select sequence, kind, case when body->>'decision' = 'decline' then 'declined_by' else 'approved_by' end
      from c where e.kind = 'proposal' and kind = 'approval' and (body->>'proposal_seq')::bigint = e.sequence
    union all select sequence, kind, 'posted_as' from c where e.kind = 'proposal' and kind = 'posting' and (body->>'proposal_seq')::bigint = e.sequence
    union all select sequence, kind, 'closed_by' from c where e.kind in ('proposal', 'payment_claim', 'vote_opened')
      and ((kind = 'proposal_closed' and (body->>'proposal_seq')::bigint = e.sequence)
        or (kind = 'claim_closed' and (body->>'claim_seq')::bigint = e.sequence)
        or (kind = 'vote_closed' and (body->>'vote_seq')::bigint = e.sequence))
    union all select (body->>'vote_seq')::bigint, 'vote_opened', 'cites_vote' from c
      where e.kind = 'proposal' and kind = 'proposal_ref' and (body->>'proposal_seq')::bigint = e.sequence
    union all select (body->>'claim_seq')::bigint, 'payment_claim', 'settles_claim' from c
      where e.kind = 'proposal' and kind = 'claim_closed' and (body->>'proposal_seq')::bigint = e.sequence
    union all select r.sequence, r.kind, 'reversed_by' from c r join c rp on rp.sequence = (r.body->>'proposal_seq')::bigint
      where e.kind = 'posting' and r.kind = 'posting' and r.body->>'effect' in ('reversal', 'charge_reversal')
        and (rp.body->>'target_seq')::bigint = e.sequence
    union all select sequence, kind, 'flagged_by' from c where e.kind = 'posting' and kind = 'flag'
      and body->'target_seqs' @> to_jsonb(e.sequence)
    union all select sequence, kind, 'noted_by' from c where e.kind = 'flag' and kind = 'flag_note' and (body->>'flag_seq')::bigint = e.sequence
    union all select sequence, kind, 'opens_vote' from c where e.kind = 'notice' and kind = 'vote_opened' and (body->>'notice_seq')::bigint = e.sequence
    union all select sequence, kind, 'corrected_by' from c where e.kind = 'notice' and kind = 'notice' and (body->>'corrects_seq')::bigint = e.sequence
    union all select sequence, kind, 'cited_by' from c where e.kind = 'vote_opened' and kind = 'proposal_ref' and (body->>'vote_seq')::bigint = e.sequence
    -- what this entry points at
    union all select (b->>'proposal_seq')::bigint, 'proposal',
      case e.kind when 'approval' then 'approves' when 'posting' then 'posts' when 'proposal_ref' then 'for_proposal' else 'receipted_by' end
      where e.kind in ('approval', 'posting', 'proposal_ref') or (e.kind = 'claim_closed' and b->>'proposal_seq' is not null)
    union all select (b->>'key_seq')::bigint, 'key_registered', 'signed_with' where e.kind in ('approval', 'month_signoff', 'year_close')
    union all select (rp.body->>'target_seq')::bigint, 'posting', 'reverses'
      from c rp where e.kind = 'posting' and b->>'effect' in ('reversal', 'charge_reversal') and rp.sequence = (b->>'proposal_seq')::bigint
    union all select (x #>> '{}')::bigint, 'posting', 'about' from jsonb_array_elements(case when e.kind = 'flag' then b->'target_seqs' else '[]' end) x
    union all select (b->>'notice_seq')::bigint, 'notice', 'announced_in' where e.kind = 'vote_opened'
    union all select (b->>'corrects_seq')::bigint, 'notice', 'corrects' where e.kind = 'notice' and b->>'corrects_seq' is not null
    union all select (b->>'vote_seq')::bigint, 'vote_opened', case when e.kind = 'proposal_ref' then 'cites' else 'in_vote' end
      where e.kind in ('ballot', 'vote_closed', 'proposal_ref')
    union all select (b->>'claim_seq')::bigint, 'payment_claim', 'closes' where e.kind = 'claim_closed')
  select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'kind', kind, 'relation', relation) order by seq, relation), '[]')
    into links from l where seq is not null;

  -- Where the entry shows in the app.
  if e.kind = 'posting' then
    select * into pr from public.chain_entries where society_id = p_society and sequence = (b->>'proposal_seq')::bigint;
    flat := pr.body->>'flat_id';
    if b->>'effect' in ('expense', 'receipt', 'reversal') then
      shown := shown || '[{"screen":"ledger"}]';
    end if;
    if pr.body->>'business_date' is not null then
      shown := shown || jsonb_build_array(jsonb_build_object('screen', 'year_close',
        'fy', cf.fy_of(p_society, (pr.body->>'business_date')::date)));
    end if;
  elsif e.kind in ('proposal', 'approval', 'proposal_closed', 'proposal_ref') then
    shown := '[{"screen":"approvals"}]';
    flat := case when e.kind = 'proposal' then b->>'flat_id' end;
  elsif e.kind in ('flag', 'flag_note') then
    shown := '[{"screen":"disputes"}]';
  elsif e.kind in ('notice', 'vote_opened', 'ballot', 'vote_closed') then
    shown := '[{"screen":"notices"}]';
  elsif e.kind in ('payment_claim', 'claim_closed') then
    shown := '[{"screen":"claims"}]';
    flat := coalesce(b->>'flat_id', (select body->>'flat_id' from public.chain_entries
                                     where society_id = p_society and sequence = (b->>'claim_seq')::bigint));
  elsif e.kind in ('month_signoff', 'year_close') then
    shown := jsonb_build_array(jsonb_build_object('screen', 'year_close', 'fy', b->>'fy'));
  else
    shown := '[{"screen":"committee"}]';
  end if;
  if flat is not null then
    shown := shown || jsonb_build_array(jsonb_build_object('screen', 'flat', 'flat_id', flat,
      'flat', (select label from public.flats where id = flat)));
  end if;

  return jsonb_build_object(
    'entry', jsonb_build_object('seq', e.sequence, 'kind', e.kind, 'format_version', e.format_version,
      'recorded_at', e.recorded_at, 'actor', e.actor, 'prev_hash', encode(e.prev_hash, 'hex'),
      'entry_hash', encode(e.entry_hash, 'hex'), 'body', b),
    'previous', case when e.sequence > 1 then e.sequence - 1 end,
    'next', (select sequence from public.chain_entries where society_id = p_society and sequence = e.sequence + 1),
    'links', links, 'appears_in', shown);
end
$$;

revoke all on function public.api_lookup(text, text), public.api_entry_context(text, bigint) from public, anon;
grant execute on function public.api_lookup(text, text), public.api_entry_context(text, bigint) to authenticated;
