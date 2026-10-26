-- Residents' payment claims (#12, #17).
--
-- A claim is chained when it is made and becomes money only through an
-- ordinary receipt proposal (contracts/chain/kinds/claims.v1.md). Who claimed
-- is kept here, never in the chain: a pseudonym beside a flat would unmask
-- that resident's flags (AGENTS.md item 14).

insert into cf.kinds (kind, layout, chainable) values
('payment_claim', '[["flat_id","text"],["amount_minor","int"],["currency","text"],["paid_on","text"],
  ["method","text"],["reference","text"]]', true),
('claim_closed', '[["claim_seq","int"],["outcome","text"],["proposal_seq","int?"],["reason","text?"]]', true);

-- Projection of the claim entries, plus the open link to a receipt proposal.
create table public.claims (
  society_id text not null references public.societies,
  claim_seq bigint not null,
  flat_id text not null references public.flats,
  amount_minor bigint not null,
  currency char(3) not null,
  paid_on date not null,
  method text not null,
  reference text not null,
  proposal_seq bigint,
  outcome text check (outcome in ('receipted', 'rejected')),
  reason text,
  closed_seq bigint,
  claimed_at timestamptz not null default now(),
  primary key (society_id, claim_seq)
);
-- One live claim per bank reference: a rejected one frees it.
create unique index claims_reference on public.claims (society_id, upper(reference))
  where outcome is distinct from 'rejected';
create index claims_proposal on public.claims (society_id, proposal_seq) where proposal_seq is not null;

create table private.claim_authors (
  society_id text not null,
  claim_seq bigint not null,
  person_id uuid not null references public.people,
  primary key (society_id, claim_seq)
);

alter table public.claims enable row level security;
revoke all on public.claims from anon, authenticated;

-- The committee reads every claim; a resident reads their own flats'.
create view public.payment_claims as
select c.society_id, c.claim_seq as seq, c.flat_id, f.label as flat, c.amount_minor, c.currency,
       c.paid_on, c.method, c.reference, c.proposal_seq, c.reason, c.closed_seq,
       case when c.outcome is not null then c.outcome
            when c.proposal_seq is not null then 'proposed' else 'open' end as state,
       (extract(epoch from c.claimed_at) * 1000)::bigint as claimed_at,
       (cf.today() - (c.claimed_at at time zone 'Asia/Kolkata')::date) as age_days
  from public.claims c join public.flats f on f.id = c.flat_id
 where c.society_id in (select cf.my_committee_societies())
    or c.flat_id = (cf.open_tenure(c.society_id, cf.person(auth.uid(), c.society_id))).flat_id;
grant select on public.payment_claims to authenticated;
revoke all on public.payment_claims from anon;

-- ---------------------------------------------------------------- claim

create function public.api_claim_payment(p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  ref text := btrim(coalesce(p->>'reference', ''));
  paid date;
  rec public.chain_entries;
begin
  perform cf.lock(p_society);
  me := cf.require_person(auth.uid(), p_society);
  if (cf.open_tenure(p_society, me)).flat_id is distinct from p->>'flat_id' then
    perform cf.err('you can claim a payment only for the flat you hold');
  end if;
  if jsonb_typeof(p->'amount_minor') <> 'number' or (p->>'amount_minor') !~ '^[0-9]{1,16}$'
     or (p->>'amount_minor')::bigint <= 0 then
    perform cf.err('amount must be a positive whole number of paise');
  end if;
  if p->>'currency' is distinct from (select currency from public.societies where id = p_society) then
    perform cf.err('the payment must be in the society''s currency');
  end if;
  begin
    paid := (p->>'paid_on')::date;
  exception when others then
    perform cf.err('give the date you paid');
  end;
  if paid is null or paid > cf.today() or p->>'paid_on' !~ '^\d{4}-\d{2}-\d{2}$' then
    perform cf.err('give the date you paid, not a future one');
  end if;
  if p->>'method' is null or p->>'method' not in ('upi', 'bank_transfer') then
    perform cf.err('only UPI and bank transfers can be claimed');
  end if;
  if ref !~ '^[A-Za-z0-9]{6,30}$' then
    perform cf.err('the reference is the 6 to 30 letters and digits of the UTR or transaction id');
  end if;
  if exists (select 1 from public.claims where society_id = p_society and upper(reference) = upper(ref)
              and outcome is distinct from 'rejected') then
    perform cf.err('this reference has already been claimed');
  end if;
  rec := cf.append(p_society, 'payment_claim', null, jsonb_build_object(
    'flat_id', p->>'flat_id', 'amount_minor', (p->>'amount_minor')::bigint, 'currency', p->>'currency',
    'paid_on', p->>'paid_on', 'method', p->>'method', 'reference', ref));
  insert into public.claims (society_id, claim_seq, flat_id, amount_minor, currency, paid_on, method, reference)
    values (p_society, rec.sequence, p->>'flat_id', (p->>'amount_minor')::bigint, p->>'currency', paid,
            p->>'method', ref);
  insert into private.claim_authors values (p_society, rec.sequence, me);
  return jsonb_build_object('seq', rec.sequence);
end
$$;

create function cf.open_claim(p_society text, p_seq bigint) returns public.claims
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims;
begin
  select * into c from public.claims where society_id = p_society and claim_seq = p_seq for update;
  if c.claim_seq is null then
    perform cf.err('no such claim');
  end if;
  if c.outcome is not null or c.proposal_seq is not null then
    perform cf.err('this claim is not open');
  end if;
  return c;
end
$$;

create function public.api_reject_claim(p_society text, p_claim_seq bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  rec public.chain_entries;
begin
  perform cf.lock(p_society);
  me := cf.require_person(auth.uid(), p_society);
  perform cf.require_task(p_society, me, 'review_payment_claims');
  perform cf.open_claim(p_society, p_claim_seq);
  if not cf.text_ok(p_reason, 500) then
    perform cf.err('say why the claim is rejected');
  end if;
  rec := cf.append(p_society, 'claim_closed', me::text, jsonb_build_object(
    'claim_seq', p_claim_seq, 'outcome', 'rejected', 'proposal_seq', null, 'reason', btrim(p_reason)));
  update public.claims set outcome = 'rejected', reason = btrim(p_reason), closed_seq = rec.sequence
   where society_id = p_society and claim_seq = p_claim_seq;
  return jsonb_build_object('seq', rec.sequence);
end
$$;

-- A receipt may name the claim it settles; the rest of propose is unchanged.
create or replace function public.api_propose(p_user uuid, p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims;
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
  made := cf.propose_core(p_user, p_society, p);
  if c.claim_seq is not null then
    update public.claims set proposal_seq = (made->>'seq')::bigint
     where society_id = p_society and claim_seq = c.claim_seq;
  end if;
  return made;
end
$$;

-- ---------------------------------------------------------------- settle

-- A linked receipt posting closes its claim in the same transaction; a
-- proposal closed without posting leaves the claim open again.
create function cf.follow_claims() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims;
  rec public.chain_entries;
begin
  if new.kind = 'posting' and new.body->>'effect' = 'receipt' then
    select * into c from public.claims where society_id = new.society_id and outcome is null
       and proposal_seq = (new.body->>'proposal_seq')::bigint;
    if c.claim_seq is not null then
      rec := cf.append(new.society_id, 'claim_closed', null, jsonb_build_object(
        'claim_seq', c.claim_seq, 'outcome', 'receipted', 'proposal_seq', c.proposal_seq, 'reason', null));
      update public.claims set outcome = 'receipted', closed_seq = rec.sequence
       where society_id = c.society_id and claim_seq = c.claim_seq;
    end if;
  elsif new.kind = 'proposal_closed' then
    update public.claims set proposal_seq = null
     where society_id = new.society_id and outcome is null
       and proposal_seq = (new.body->>'proposal_seq')::bigint;
  end if;
  return null;
end
$$;

create trigger follow_claims after insert on public.chain_entries
  for each row when (new.kind in ('posting', 'proposal_closed')) execute function cf.follow_claims();

create function public.api_claims_unreviewed(p_society text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not cf.is_member(p_society) then
    perform cf.err('no account in this society');
  end if;
  return jsonb_build_object('count', (select count(*) from public.claims
    where society_id = p_society and outcome is null and proposal_seq is null
      and claimed_at < now() - interval '7 days'));
end
$$;

-- ---------------------------------------------------------------- privileges

revoke all on function cf.open_claim(text, bigint), cf.follow_claims() from public, anon, authenticated, service_role;
revoke all on function public.api_claim_payment(text, jsonb), public.api_reject_claim(text, bigint, text),
  public.api_claims_unreviewed(text) from public, anon;
grant execute on function public.api_claim_payment(text, jsonb), public.api_reject_claim(text, bigint, text),
  public.api_claims_unreviewed(text) to authenticated;
-- create or replace keeps api_propose's grants: service_role only.
