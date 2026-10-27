-- Expense templates (#62): a saved payee, category, description and, for a
-- bill that does not vary, an amount, so a treasurer does not retype them.
--
-- A template pre-fills a proposal and nothing more. The proposal is an
-- ordinary expense through cf.propose_core, with the same tier, approvals and
-- snapshot as one typed by hand: a template is never a standing approval and
-- never posts by itself. Templates are not chained, since they move no money,
-- so a template's past contents are no record; the proposals made from it are.

create table private.expense_templates (
  id bigint generated always as identity primary key,
  society_id text not null references public.societies,
  name text not null,
  counterparty text,
  category text,
  narration text,
  amount_minor bigint check (amount_minor > 0),
  -- The latest proposal made from it, whatever became of that proposal:
  -- "last proposed from", never "last posted".
  last_used_seq bigint,
  retired_at timestamptz,
  created_by uuid not null references public.people,
  updated_at timestamptz not null default now()
);
create index expense_templates_society on private.expense_templates (society_id);

-- Retired templates stay readable, flagged, and are never deleted.
create view public.expense_templates as
select t.id as template_id, t.society_id, t.name, t.counterparty, t.category, t.narration,
       t.amount_minor, t.last_used_seq, t.retired_at is not null as retired
  from private.expense_templates t
 where t.society_id in (select cf.my_committee_societies());

-- ---------------------------------------------------------------- save, retire

create function public.api_save_template(p_society text, p_template_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  t private.expense_templates;
  amt bigint;
begin
  perform cf.lock(p_society);
  me := cf.require_person(auth.uid(), p_society);
  perform cf.require_task(p_society, me, 'propose_expenses');
  if not cf.text_ok(p->>'name', 80) then
    perform cf.err('a template needs a name of at most 80 characters');
  end if;
  if p ? 'amount_minor' and p->'amount_minor' <> 'null'::jsonb then
    if jsonb_typeof(p->'amount_minor') <> 'number' or (p->>'amount_minor') !~ '^[0-9]{1,16}$'
       or (p->>'amount_minor')::bigint <= 0 then
      perform cf.err('a fixed amount must be a positive whole number of minor units');
    end if;
    amt := (p->>'amount_minor')::bigint;
  end if;
  if p_template_id is not null then
    t := cf.template(p_society, p_template_id);
  end if;
  if t.id is null then
    insert into private.expense_templates (society_id, name, counterparty, category, narration, amount_minor, created_by)
      values (p_society, btrim(p->>'name'), nullif(btrim(p->>'counterparty'), ''), nullif(btrim(p->>'category'), ''),
              nullif(btrim(p->>'narration'), ''), amt, me)
      returning * into t;
  else
    update private.expense_templates
       set name = btrim(p->>'name'), counterparty = nullif(btrim(p->>'counterparty'), ''),
           category = nullif(btrim(p->>'category'), ''), narration = nullif(btrim(p->>'narration'), ''),
           amount_minor = amt, updated_at = now()
     where id = t.id;
  end if;
  return jsonb_build_object('template_id', t.id);
end
$$;

create function public.api_retire_template(p_society text, p_template_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t private.expense_templates;
begin
  perform cf.lock(p_society);
  perform cf.require_task(p_society, cf.require_person(auth.uid(), p_society), 'propose_expenses');
  select * into t from private.expense_templates where id = p_template_id and society_id = p_society for update;
  if t.id is null then
    perform cf.err('no such template in this society');
  end if;
  update private.expense_templates set retired_at = coalesce(retired_at, now()) where id = t.id;
  return jsonb_build_object('ok', true);
end
$$;

-- A live template of this society, locked for the caller's change.
create function cf.template(p_society text, p_template_id bigint) returns private.expense_templates
language plpgsql security definer set search_path = '' as $$
declare
  t private.expense_templates;
begin
  select * into t from private.expense_templates where id = p_template_id and society_id = p_society for update;
  if t.id is null then
    perform cf.err('no such template in this society');
  end if;
  if t.retired_at is not null then
    perform cf.err('this template is retired');
  end if;
  return t;
end
$$;

-- ---------------------------------------------------------------- propose

-- As 15, plus template_id: the template fills counterparty, category,
-- narration and amount_minor wherever the proposal leaves them out or null.
create or replace function public.api_propose(p_user uuid, p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims;
  v public.votes;
  t private.expense_templates;
  f text;
  made jsonb;
begin
  perform cf.lock(p_society);
  if p ? 'template_id' and p->'template_id' <> 'null'::jsonb then
    if coalesce(p->>'action', 'expense') <> 'expense' then
      perform cf.err('a template fills an expense only');
    end if;
    p := p || '{"action": "expense"}';
    perform cf.require_task(p_society, cf.require_person(p_user, p_society), 'propose_expenses');
    t := cf.template(p_society, (p->>'template_id')::bigint);
    foreach f in array array['counterparty', 'category', 'narration', 'amount_minor'] loop
      if coalesce(p->f, 'null'::jsonb) = 'null'::jsonb then
        p := jsonb_set(p, array[f], coalesce(to_jsonb(t) -> f, 'null'::jsonb));
      end if;
    end loop;
    if p->'amount_minor' = 'null'::jsonb then
      perform cf.err('this template has no fixed amount: give one');
    end if;
  end if;
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
  if t.id is not null then
    update private.expense_templates set last_used_seq = (made->>'seq')::bigint where id = t.id;
  end if;
  return made;
end
$$;

-- ---------------------------------------------------------------- privileges

grant select on public.expense_templates to authenticated;
revoke all on public.expense_templates from anon;
revoke all on function cf.template(text, bigint) from public, anon, authenticated, service_role;
revoke all on function public.api_save_template(text, bigint, jsonb), public.api_retire_template(text, bigint)
  from public, anon, authenticated;
grant execute on function public.api_save_template(text, bigint, jsonb), public.api_retire_template(text, bigint)
  to authenticated;
