-- Bank statements (#73): what the bank says came in, beside the residents'
-- claims. An import moves no money and chains nothing: a matched claim still
-- becomes money only through a receipt proposal and its approvals (AGENTS.md
-- items 6 and 14). The raw file is not kept; its credit lines are, for the
-- committee only.

create table private.statements (
  id bigint generated always as identity primary key,
  society_id text not null references public.societies,
  uploaded_by uuid not null references public.people,
  uploaded_at timestamptz not null default now(),
  credits int not null,
  skipped int not null
);
create table private.statement_lines (
  statement_id bigint not null references private.statements,
  line_no int not null,
  society_id text not null references public.societies,
  value_date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  reference text,
  narration text,
  primary key (statement_id, line_no)
);
create index statement_lines_society on private.statement_lines (society_id);

-- The currency's minor-unit exponent (AGENTS.md item 4: never a fixed /100).
create function cf.currency_exponent(p_currency text) returns int
language plpgsql immutable set search_path = '' as $$
declare
  e int := case p_currency when 'INR' then 2 when 'USD' then 2 when 'EUR' then 2 when 'GBP' then 2
                           when 'JPY' then 0 when 'KWD' then 3 when 'BHD' then 3 when 'OMR' then 3 end;
begin
  if e is null then
    raise exception 'no exponent known for currency %', p_currency using errcode = '22023';
  end if;
  return e;
end
$$;

-- money_text (19) divided by `10 ^ e`, which Postgres evaluates in double
-- precision. The text came out right, since an integer over an exact power of
-- ten never rounds across a whole number, but binary floating point is not
-- permitted at any layer (item 4). Same output, exact numeric throughout, and
-- one exponent table.
create or replace function cf.money_text(p_minor bigint, p_currency text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  e int := cf.currency_exponent(p_currency);
  unit numeric := power(10::numeric, e);
  a numeric := abs(p_minor);
  whole text := trunc(a / unit)::text;
  frac text := lpad((a % unit)::bigint::text, e, '0');
  g text := '';
begin
  if p_currency = 'INR' and length(whole) > 3 then
    g := ',' || right(whole, 3);
    whole := left(whole, length(whole) - 3);
    while length(whole) > 2 loop
      g := ',' || right(whole, 2) || g;
      whole := left(whole, length(whole) - 2);
    end loop;
  elsif p_currency <> 'INR' then
    while length(whole) > 3 loop
      g := ',' || right(whole, 3) || g;
      whole := left(whole, length(whole) - 3);
    end loop;
  end if;
  return case when p_minor < 0 then '-' else '' end
      || case p_currency when 'INR' then '₹' else p_currency || ' ' end
      || whole || g || case when e > 0 then '.' || frac else '' end;
end
$$;
revoke all on function cf.money_text(bigint, text) from public, anon, authenticated, service_role;

-- Service only: the edge route /statements, after it has read the CSV.
create function public.api_statement_store(p_user uuid, p_society text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  cur text;
  e int;
  l jsonb;
  n int := 0;
  amt numeric;
  st private.statements;
begin
  perform cf.lock(p_society);
  me := cf.require_person(p_user, p_society);
  perform cf.require_task(p_society, me, 'review_payment_claims');
  if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') = 0 then
    perform cf.err('The file has no credit lines.');
  end if;
  if jsonb_array_length(p->'lines') > 5000 then
    perform cf.err('A statement must be at most 5,000 rows.');
  end if;
  select currency into cur from public.societies where id = p_society;
  e := cf.currency_exponent(cur);
  insert into private.statements (society_id, uploaded_by, credits, skipped)
    values (p_society, me, jsonb_array_length(p->'lines'), coalesce((p->>'skipped')::int, 0)) returning * into st;
  for l in select x from jsonb_array_elements(p->'lines') x loop
    n := n + 1;
    if coalesce(l->>'amount', '') !~ '^[0-9]{1,16}(\.[0-9]{1,6})?$' then
      perform cf.err(format('Row %s: not an amount.', l->>'row'));
    end if;
    if coalesce(l->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      perform cf.err(format('Row %s: not a date.', l->>'row'));
    end if;
    -- numeric is exact decimal: no binary floating point touches the amount.
    amt := (l->>'amount')::numeric * power(10::numeric, e);
    if amt <> trunc(amt) then
      perform cf.err(format('Row %s: %s is finer than the smallest unit of %s.', l->>'row', l->>'amount', cur));
    end if;
    if amt <= 0 or amt > 9007199254740991 then
      perform cf.err(format('Row %s: not an amount.', l->>'row'));
    end if;
    insert into private.statement_lines (statement_id, line_no, society_id, value_date, amount_minor, currency, reference, narration)
      values (st.id, n, p_society, (l->>'date')::date, amt::bigint, cur,
              nullif(left(btrim(l->>'reference'), 500), ''), nullif(left(btrim(l->>'narration'), 500), ''));
  end loop;
  return jsonb_build_object('statement_id', st.id, 'credits', st.credits, 'skipped', st.skipped);
end
$$;

-- Each credit with the claim its UTR matches, computed when read so it
-- follows the claim's outcome. A claim the committee rejected but the bank
-- shows as paid surfaces here like any other match.
create view public.statement_lines as
select l.statement_id, l.line_no, l.society_id, l.value_date, l.amount_minor, l.currency, l.reference, l.narration,
       (select jsonb_build_object('claim_seq', c.claim_seq, 'flat_id', c.flat_id,
                 'status', coalesce(c.outcome, 'open'), 'amount_matches', c.amount_minor = l.amount_minor)
          from public.claims c
         where c.society_id = l.society_id
           and (upper(c.reference) = upper(l.reference)
                or upper(c.reference) = any (regexp_split_to_array(upper(coalesce(l.narration, '')), '[^A-Z0-9]+')))
         order by (c.amount_minor = l.amount_minor) desc, c.claim_seq desc
         limit 1) as match
  from private.statement_lines l
 where l.society_id in (select cf.my_committee_societies());

-- ---------------------------------------------------------------- privileges

grant select on public.statement_lines to authenticated;
revoke all on public.statement_lines from anon;
revoke all on function cf.currency_exponent(text) from public, anon, authenticated, service_role;
revoke all on function public.api_statement_store(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.api_statement_store(uuid, text, jsonb) to service_role;
