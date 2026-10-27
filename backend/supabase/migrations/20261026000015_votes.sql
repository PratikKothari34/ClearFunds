-- Votes: one ballot per flat, closing, and citing a carried option (#13, #18).
--
-- A ballot never names a person or a pseudonym. A named ballot carries the
-- flat; an anonymous one a per-vote flat token only the salt can link to a
-- flat (contracts/chain/kinds/notices.v1.md). A cited vote is evidence: the
-- proposal's approvals are unchanged.

insert into cf.kinds (kind, layout, chainable) values
('ballot', '[["vote_seq","int"],["flat_id","text?"],["flat_token","bytes?"],["options","list<int>"]]', true),
('vote_closed', '[["vote_seq","int"],["tallies","list<int>"],["flats_voted","int"],["eligible_flats","int"],
  ["carried","int?"]]', true),
('proposal_ref', '[["proposal_seq","int"],["vote_seq","int"],["option","int"]]', true);

-- Which flats have voted. Kept apart from the chain, so an anonymous ballot's
-- flat is known only to the server.
create table private.vote_cast (
  society_id text not null,
  vote_seq bigint not null,
  flat_id text not null,
  ballot_seq bigint not null,
  primary key (society_id, vote_seq, flat_id)
);

create function cf.flat_token(p_society text, p_vote bigint, p_flat text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(extensions.digest(cf.field(3, s.salt) || cf.field(1, int8send(p_vote))
           || cf.field(2, convert_to(p_flat, 'UTF8')), 'sha256'), 'hex')
    from private.society_secrets s where s.society_id = p_society
$$;

-- ---------------------------------------------------------------- ballot

-- Service only: the edge route /ballot.
create function public.api_ballot(p_user uuid, p_society text, p_vote_seq bigint, p_options int[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  v public.votes;
  t public.tenures;
  picks int[] := array(select distinct x from unnest(p_options) x order by x);
  rec public.chain_entries;
begin
  perform cf.lock(p_society);
  me := cf.require_person(p_user, p_society);
  select * into v from public.votes where society_id = p_society and vote_seq = p_vote_seq for update;
  if v.vote_seq is null then
    perform cf.err('no such vote');
  end if;
  if v.closed_seq is not null or now() >= v.closes_at then
    perform cf.err('this vote has closed');
  end if;
  t := cf.open_tenure(p_society, me);
  if t.id is null or (t.kind = 'tenant' and not t.resides)
     or not exists (select 1 from private.vote_flats where society_id = p_society and vote_seq = v.vote_seq
                     and flat_id = t.flat_id) then
    perform cf.err('only an owner or a resident tenant of a flat eligible when the vote opened can vote');
  end if;
  if exists (select 1 from private.vote_cast where society_id = p_society and vote_seq = v.vote_seq and flat_id = t.flat_id) then
    perform cf.err('your flat has already voted');
  end if;
  if cardinality(picks) <> cardinality(p_options) or cardinality(picks) not between 1 and v.max_picks
     or picks[1] < 0 or picks[cardinality(picks)] >= cardinality(v.options) then
    perform cf.err(format('pick 1 to %s of the options, each once', v.max_picks));
  end if;
  rec := cf.append(p_society, 'ballot', null, jsonb_build_object('vote_seq', v.vote_seq,
    'flat_id', case when v.mode = 'named' then t.flat_id end,
    'flat_token', case when v.mode = 'anonymous' then cf.flat_token(p_society, v.vote_seq, t.flat_id) end,
    'options', to_jsonb(picks)));
  insert into private.vote_cast values (p_society, v.vote_seq, t.flat_id, rec.sequence);
  return jsonb_build_object('seq', rec.sequence);
end
$$;

-- ---------------------------------------------------------------- close

create function cf.close_vote(p_society text, p_vote_seq bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.votes;
  t int[];
  top int;
  rec public.chain_entries;
begin
  select * into v from public.votes where society_id = p_society and vote_seq = p_vote_seq for update;
  if v.closed_seq is not null then
    return;
  end if;
  select array_agg(coalesce(n, 0) order by i) into t
    from generate_series(0, cardinality(v.options) - 1) i
    left join (select (o #>> '{}')::int as opt, count(*)::int as n
                 from public.chain_entries b, jsonb_array_elements(b.body->'options') o
                where b.society_id = p_society and b.kind = 'ballot' and (b.body->>'vote_seq')::bigint = p_vote_seq
                group by 1) c on c.opt = i;
  -- Carried: one option with strictly more than every other, single-choice only.
  select i - 1 into top from unnest(t) with ordinality u(n, i)
   where v.max_picks = 1 and n > 0 and n > all (select x from unnest(t) with ordinality w(x, j) where j <> i);
  rec := cf.append(p_society, 'vote_closed', null, jsonb_build_object('vote_seq', p_vote_seq,
    'tallies', to_jsonb(t), 'flats_voted',
    (select count(*) from private.vote_cast where society_id = p_society and vote_seq = p_vote_seq),
    'eligible_flats', v.eligible, 'carried', top));
  update public.votes set closed_seq = rec.sequence, tallies = t, carried = top
   where society_id = p_society and vote_seq = p_vote_seq;
end
$$;

create function cf.close_due_votes() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  for v in select society_id, vote_seq from public.votes where closed_seq is null and closes_at <= now()
            order by closes_at loop
    -- Each vote closes in its own subtransaction. Otherwise one that cannot
    -- close aborts the run, and being due first, every run after it: no vote
    -- anywhere would close again. It stays open, logged, and is retried.
    begin
      perform cf.lock(v.society_id);
      perform cf.close_vote(v.society_id, v.vote_seq);
    exception when others then
      raise warning 'vote % in % did not close: %', v.vote_seq, v.society_id, sqlerrm;
    end;
  end loop;
end
$$;
select cron.schedule('clearfunds-close-votes', '* * * * *', 'select cf.close_due_votes()');

-- ---------------------------------------------------------------- cite

-- A proposal may cite a closed vote's carried option; its approvals are
-- exactly what they would be without it. Claims are unchanged from 13.
create or replace function public.api_propose(p_user uuid, p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims;
  v public.votes;
  made jsonb;
begin
  perform cf.lock(p_society);
  if p->>'action' = 'expense' then
    perform cf.require_task(p_society, cf.require_person(p_user, p_society), 'propose_expenses');
  elsif p->>'action' = 'charge' then
    perform cf.require_task(p_society, cf.require_person(p_user, p_society), 'raise_monthly_charges');
  end if;
  if p ? 'claim_seq' and p->'claim_seq' <> 'null'::jsonb then
    perform cf.require_task(p_society, cf.require_person(p_user, p_society), 'review_payment_claims');
    c := cf.open_claim(p_society, (p->>'claim_seq')::bigint);
    if p->>'action' is distinct from 'receipt' or p->>'flat_id' is distinct from c.flat_id
       or (p->>'amount_minor')::bigint is distinct from c.amount_minor
       or coalesce(p->>'currency', c.currency) is distinct from c.currency then
      perform cf.err('a receipt for a claim must be for its flat, amount and currency');
    end if;
  end if;
  if p ? 'vote_seq' and p->'vote_seq' <> 'null'::jsonb then
    select * into v from public.votes where society_id = p_society and vote_seq = (p->>'vote_seq')::bigint;
    if v.closed_seq is null or v.carried is null or v.carried is distinct from (p->>'vote_option')::int then
      perform cf.err('This vote did not carry that option.');
    end if;
  end if;
  made := cf.propose_core(p_user, p_society, p);
  if c.claim_seq is not null then
    update public.claims set proposal_seq = (made->>'seq')::bigint
     where society_id = p_society and claim_seq = c.claim_seq;
  end if;
  if v.vote_seq is not null then
    perform cf.append(p_society, 'proposal_ref', cf.require_person(p_user, p_society)::text, jsonb_build_object(
      'proposal_seq', (made->>'seq')::bigint, 'vote_seq', v.vote_seq, 'option', v.carried));
  end if;
  return made;
end
$$;

-- ---------------------------------------------------------------- reads

create or replace view public.notices as
select n.society_id, n.sequence as seq, n.body->>'title' as title, n.body->>'body' as body,
       n.body->'attachments' as attachments, coalesce(d.pinned, false) as pinned,
       (n.body->>'corrects_seq')::bigint as corrects_seq,
       (select min(c.sequence) from public.chain_entries c where c.society_id = n.society_id and c.kind = 'notice'
          and (c.body->>'corrects_seq')::bigint = n.sequence) as corrected_by,
       n.recorded_at as published_at,
       (select jsonb_build_object('seq', v.vote_seq, 'question', o.body->>'question', 'options', o.body->'options',
          'max_picks', v.max_picks, 'mode', v.mode, 'closes_at', (o.body->>'closes_at')::bigint,
          'eligible_flats', v.eligible, 'closed', v.closed_seq is not null,
          'flats_voted', (select count(*) from private.vote_cast x where x.society_id = v.society_id and x.vote_seq = v.vote_seq),
          -- Tallies only once closed, so early results cannot steer late voters.
          'tallies', case when v.closed_seq is not null then to_jsonb(v.tallies) end,
          'carried', v.carried,
          'my_flat_voted', exists (select 1 from private.vote_cast x where x.society_id = v.society_id
            and x.vote_seq = v.vote_seq
            and x.flat_id = (cf.open_tenure(v.society_id, cf.person(auth.uid(), v.society_id))).flat_id),
          'ballots', case when v.mode = 'named' and v.closed_seq is not null then
            (select coalesce(jsonb_agg(jsonb_build_object('flat', f.label, 'options', b.body->'options') order by f.ordinal), '[]')
               from public.chain_entries b join public.flats f on f.id = b.body->>'flat_id'
              where b.society_id = v.society_id and b.kind = 'ballot' and (b.body->>'vote_seq')::bigint = v.vote_seq) end)
          from public.votes v join public.chain_entries o on o.society_id = v.society_id and o.sequence = v.vote_seq
         where v.society_id = n.society_id and v.notice_seq = n.sequence) as vote
  from public.chain_entries n
  left join private.notice_drafts d on d.society_id = n.society_id and d.published_seq = n.sequence
 where n.kind = 'notice' and n.society_id in (select cf.my_societies());

-- ---------------------------------------------------------------- privileges

revoke all on function cf.flat_token(text, bigint, text), cf.close_vote(text, bigint), cf.close_due_votes()
  from public, anon, authenticated, service_role;
revoke all on function public.api_ballot(uuid, text, bigint, int[]) from public, anon, authenticated;
grant execute on function public.api_ballot(uuid, text, bigint, int[]) to service_role;
