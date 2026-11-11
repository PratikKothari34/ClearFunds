-- Every amount stays within what a JSON client reads exactly (#136).
--
-- The chain encoder already refuses any int outside ±(2^53 − 1)
-- (entry-preimage.v1 §2.1, cf.field), so nothing larger can be chained. Three
-- gaps remained, and this closes them:
--
--   1. Expense templates are not chained, and their amount took any 16 digits,
--      which reaches past 2^53 − 1. One such template made a client refuse the
--      whole template list.
--   2. An oversized amount on a claim, a replacement or a limit was refused
--      only by the encoder, as "chain: int … outside the safe range". Every
--      input is now checked first, with one message a screen can recognise:
--      "… is too large: …".
--   3. A balance or a flat's outstanding figure is a sum, so it could leave the
--      range while every entry is inside it. The bound is held on the total
--      money ever posted: the sum of the absolute amount of every posting. Any
--      figure derived from postings (a balance, a flat's dues, a month's or a
--      category's total, whether summed here or in a browser) is at most that,
--      so all of them stay exact. At ₹9,00,71,99,25,47,409.91 it is not a limit
--      a housing society meets; it is there so the contract is true.
--
-- No policy ceiling below 2^53 − 1 (#136): one that caught a realistic typo
-- would be one a real society eventually hits, and the second approver is the
-- control for a wrong amount.

create function cf.max_minor() returns numeric language sql immutable set search_path = '' as $$
  select 9007199254740991::numeric
$$;

-- The bound, as the society's own currency, for messages.
create function cf.max_minor_text(p_society text) returns text
language sql stable security definer set search_path = '' as $$
  select cf.money_text(9007199254740991, coalesce((select currency from public.societies where id = p_society), 'INR'))
$$;

-- Refuses one field of a request if it is a number outside the range. A field
-- that is absent, null or not a number is left to the function behind this,
-- which already says what is wrong with it.
create function cf.require_amount(p_society text, p jsonb, p_field text, p_label text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if jsonb_typeof(p->p_field) = 'number' and abs((p->>p_field)::numeric) > cf.max_minor() then
    perform cf.err(format('%s is too large: no amount can be more than %s', p_label, cf.max_minor_text(p_society)));
  end if;
end
$$;

-- The money ever posted: the sum of the absolute amount of every posting.
create function cf.posted_total(p_society text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(abs((body->>'amount_minor')::numeric)), 0)
    from public.chain_entries
   where society_id = p_society and kind = 'posting' and jsonb_typeof(body->'amount_minor') = 'number'
$$;

-- Refuses an amount that would take the posted total past the bound.
create function cf.require_room(p_society text, p_more numeric) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_more > 0 and cf.posted_total(p_society) + p_more > cf.max_minor() then
    perform cf.err(format('the amount is too large: with it, the money posted in this society would pass %s, '
      'beyond which no balance or total can be read exactly', cf.max_minor_text(p_society)));
  end if;
end
$$;

-- The backstop, whatever path appends a posting: two proposals that each fit
-- can still not both post.
create function cf.posting_in_range() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(new.body->'amount_minor') = 'number' then
    perform cf.require_room(new.society_id, abs((new.body->>'amount_minor')::numeric));
  end if;
  return new;
end
$$;
create trigger chain_entries_posting_range before insert on public.chain_entries
  for each row when (new.kind = 'posting') execute function cf.posting_in_range();

-- ---------------------------------------------------------------- entry points
-- Each keeps its signature and grants; the previous function moves to cf and
-- is called once the amounts are known to fit.

alter function public.api_propose(uuid, text, jsonb) set schema cf;
alter function cf.api_propose(uuid, text, jsonb) rename to propose_entry;

create function public.api_propose(p_user uuid, p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  more numeric := 0;
begin
  perform cf.require_amount(p_society, p, 'amount_minor',
    case p->>'action' when 'limit_change' then 'the limit' else 'the amount' end);
  perform cf.require_amount(p_society, p, 'replacement_amount_minor', 'the replacement amount');
  -- What this proposal would post if it is approved.
  if p->>'action' in ('expense', 'receipt', 'charge') and jsonb_typeof(p->'amount_minor') = 'number' then
    more := abs((p->>'amount_minor')::numeric);
  elsif p->>'action' = 'reversal' and jsonb_typeof(p->'target_seq') = 'number' then
    more := coalesce((select abs((body->>'amount_minor')::numeric) from public.chain_entries
                       where society_id = p_society and sequence = (p->>'target_seq')::bigint
                         and jsonb_typeof(body->'amount_minor') = 'number'), 0)
          + case when jsonb_typeof(p->'replacement_amount_minor') = 'number'
                 then abs((p->>'replacement_amount_minor')::numeric) else 0 end;
  end if;
  perform cf.require_room(p_society, more);
  return cf.propose_entry(p_user, p_society, p);
end
$$;

alter function public.api_claim_payment(text, jsonb) set schema cf;
alter function cf.api_claim_payment(text, jsonb) rename to claim_payment_entry;

create function public.api_claim_payment(p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform cf.require_amount(p_society, p, 'amount_minor', 'the amount');
  return cf.claim_payment_entry(p_society, p);
end
$$;

alter function public.api_save_template(text, bigint, jsonb) set schema cf;
alter function cf.api_save_template(text, bigint, jsonb) rename to save_template_entry;

create function public.api_save_template(p_society text, p_template_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform cf.require_amount(p_society, p, 'amount_minor', 'the amount');
  return cf.save_template_entry(p_society, p_template_id, p);
end
$$;

-- A template written before this, or by anything but the function above.
alter table private.expense_templates
  add constraint expense_templates_amount_range check (amount_minor <= 9007199254740991);

-- ---------------------------------------------------------------- privileges

revoke all on function cf.max_minor(), cf.max_minor_text(text), cf.require_amount(text, jsonb, text, text),
  cf.posted_total(text), cf.require_room(text, numeric), cf.posting_in_range(),
  cf.propose_entry(uuid, text, jsonb), cf.claim_payment_entry(text, jsonb),
  cf.save_template_entry(text, bigint, jsonb)
  from public, anon, authenticated, service_role;

revoke all on function public.api_propose(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.api_propose(uuid, text, jsonb) to service_role;
revoke all on function public.api_claim_payment(text, jsonb) from public, anon;
grant execute on function public.api_claim_payment(text, jsonb) to authenticated, service_role;
revoke all on function public.api_save_template(text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.api_save_template(text, bigint, jsonb) to authenticated, service_role;
