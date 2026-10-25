-- The hash chain: encoding, kinds and the append-only entry table.
--
-- The encoding is contracts/chain/entry-preimage.v1.md, implemented here
-- independently of the frontend verifier. Both reproduce
-- contracts/chain/vectors/entry-preimage.v1.json byte for byte
-- (supabase/tests/chain_vectors.test.sql).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists cf;
create schema if not exists private;
revoke all on schema cf, private from public, anon, authenticated;

-- ---------------------------------------------------------------- encoding

-- field = tag (1 byte) || length (4 bytes, big-endian) || value
create function cf.field(tag int, v bytea) returns bytea
language sql immutable strict as $$
  select set_byte('\x00'::bytea, 0, tag) || int4send(length(v)) || v
$$;

-- Encodes one JSON value under a layout type. Types:
--   int, text, bytes, bool, absent, list<T>, and T? (absent when null).
create function cf.encode(t text, v jsonb) returns bytea
language plpgsql immutable as $$
declare
  n numeric;
  s text;
  acc bytea := '';
  item jsonb;
begin
  if right(t, 1) = '?' then
    if v is null or v = 'null'::jsonb then
      return cf.field(0, '');
    end if;
    t := left(t, -1);
  end if;

  if t = 'absent' then
    if v is not null and v <> 'null'::jsonb then
      raise exception 'chain: absent field carries a value' using errcode = '22023';
    end if;
    return cf.field(0, '');
  end if;

  if v is null or v = 'null'::jsonb then
    raise exception 'chain: required % field is null', t using errcode = '22023';
  end if;

  if t = 'int' then
    if jsonb_typeof(v) <> 'number' then
      raise exception 'chain: int field is not a number' using errcode = '22023';
    end if;
    n := v::numeric;
    if n <> trunc(n) or abs(n) > 9007199254740991 then
      raise exception 'chain: int % outside the safe range', n using errcode = '22023';
    end if;
    return cf.field(1, int8send(n::bigint));
  elsif t = 'text' then
    if jsonb_typeof(v) <> 'string' then
      raise exception 'chain: text field is not a string' using errcode = '22023';
    end if;
    return cf.field(2, convert_to(v #>> '{}', 'UTF8'));
  elsif t = 'bytes' then
    s := v #>> '{}';
    if s !~ '^([0-9a-f]{2})*$' then
      raise exception 'chain: bytes must be lowercase even-length hex' using errcode = '22023';
    end if;
    return cf.field(3, decode(s, 'hex'));
  elsif t = 'bool' then
    if jsonb_typeof(v) <> 'boolean' then
      raise exception 'chain: bool field is not a boolean' using errcode = '22023';
    end if;
    return cf.field(4, case when v::boolean then '\x01'::bytea else '\x00'::bytea end);
  elsif t like 'list<%>' then
    if jsonb_typeof(v) <> 'array' then
      raise exception 'chain: list field is not an array' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(v) loop
      acc := acc || cf.encode(substr(t, 6, length(t) - 6), item);
    end loop;
    return cf.field(5, acc);
  end if;

  raise exception 'chain: unknown layout type %', t using errcode = '22023';
end
$$;

-- ---------------------------------------------------------------- kinds

-- One row per kind: its ordered body layout, as [[name, type], ...].
-- contracts/chain/kinds/<kind>.v1.md is the prose definition of each.
create table cf.kinds (
  kind text primary key check (kind ~ '^[a-z0-9_]+$'),
  layout jsonb not null,
  chainable boolean not null default true
);

insert into cf.kinds (kind, layout, chainable) values
('test_vector', '[["amount_minor","int"],["currency","text"],["delta","int"],["note","text"],
  ["empty_note","text"],["optional","absent"],["flag","bool"],["ref_hash","bytes"],
  ["ids","list<int>"],["none","list<int>"]]', false),

('society_opened', '[["name","text"],["currency","text"],["fy_start_month","int"],
  ["approval_limit_minor","int"],["committee","list<text>"],["roles","list<text>"]]', true),

('key_registered', '[["person","text"],["alg","text"],["public_key","bytes"]]', true),

('proposal', '[["action","text"],["amount_minor","int?"],["currency","text?"],
  ["counterparty","text?"],["category","text?"],["narration","text"],["business_date","text"],
  ["flat_id","text?"],["target_seq","int?"],["reason","text?"],
  ["replacement_amount_minor","int?"],["person","text?"],["role","text?"],["fy","text?"],
  ["flat_set","text?"],["flat_ids","list<text>"],["line_amounts","list<int>"],["remainder_flats","list<text>"],
  ["tier","text"],["required","int"],["seated","int"],["limit_minor","int"],["limit_seq","int"]]', true),

('approval', '[["proposal_seq","int"],["decision","text"],["role","text"],["derived","bool"],
  ["proposal_hash","bytes"],["key_seq","int"],["signature","bytes"]]', true),

('posting', '[["proposal_seq","int"],["effect","text"],["amount_minor","int?"],
  ["currency","text?"],["limit_minor","int?"],["person","text?"],["role","text?"],
  ["derived","bool?"]]', true),

('proposal_closed', '[["proposal_seq","int"],["outcome","text"]]', true),

('flag', '[["scope","text"],["target_seqs","list<int>"],["counterparty","text?"],
  ["period","text?"],["text","text"]]', true),

('flag_note', '[["flag_seq","int"],["note","text"],["text","text"]]', true),

('month_signoff', '[["month","text"],["through_seq","int"],["through_hash","bytes"],
  ["note","text?"],["key_seq","int"],["signature","bytes"]]', true),

('year_close', '[["fy","text"],["opinion","text"],["statement","text"],
  ["appointment_seq","int"],["through_seq","int"],["through_hash","bytes"],
  ["key_seq","int"],["signature","bytes"]]', true);

-- ---------------------------------------------------------------- hashing

create function cf.preimage(
  p_society text, p_version int, p_sequence bigint, p_prev bytea, p_kind text,
  p_recorded_at bigint, p_actor text, p_body jsonb
) returns bytea
language plpgsql stable as $$
declare
  lay jsonb;
  f jsonb;
  body bytea := '';
begin
  if p_version <> 1 then
    raise exception 'chain: unknown format_version %', p_version using errcode = '22023';
  end if;
  select layout into lay from cf.kinds where kind = p_kind;
  if lay is null then
    raise exception 'chain: unknown kind %', p_kind using errcode = '22023';
  end if;
  for f in select value from jsonb_array_elements(lay) loop
    body := body || cf.encode(f->>1, p_body -> (f->>0));
  end loop;
  return cf.field(2, convert_to('clearfunds/chain-entry', 'UTF8'))
      || cf.field(1, int8send(p_version::bigint))
      || cf.field(2, convert_to(p_society, 'UTF8'))
      || cf.field(1, int8send(p_sequence))
      || cf.field(3, p_prev)
      || cf.field(2, convert_to(p_kind, 'UTF8'))
      || cf.field(1, int8send(p_recorded_at))
      || case when p_actor is null then cf.field(0, '')
              else cf.field(2, convert_to(p_actor, 'UTF8')) end
      || cf.field(5, body);
end
$$;

-- NFC-normalises every text value the layout declares, once, at ingestion
-- (spec 2.2). Lone surrogates cannot reach here: Postgres rejects them in
-- jsonb input.
create function cf.normalise(p_kind text, p_body jsonb) returns jsonb
language plpgsql stable as $$
declare
  f jsonb;
  out jsonb := '{}';
  v jsonb;
  t text;
begin
  for f in select value from cf.kinds k, jsonb_array_elements(k.layout) where k.kind = p_kind loop
    v := p_body -> (f->>0);
    t := rtrim(f->>1, '?');
    if v is null then
      v := 'null';
    elsif t = 'text' and jsonb_typeof(v) = 'string' then
      v := to_jsonb(normalize(v #>> '{}', nfc));
    elsif t = 'list<text>' and jsonb_typeof(v) = 'array' then
      select coalesce(jsonb_agg(to_jsonb(normalize(e #>> '{}', nfc)) order by o), '[]')
        into v from jsonb_array_elements(v) with ordinality as x(e, o);
    end if;
    out := out || jsonb_build_object(f->>0, v);
  end loop;
  return out;
end
$$;

-- ---------------------------------------------------------------- storage

create table public.societies (
  id text primary key check (id ~ '^soc_[a-z0-9]+$'),
  name text not null,
  city text,
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  fy_start_month int not null default 4 check (fy_start_month between 1 and 12),
  structuring_window_days int not null default 30 check (structuring_window_days > 0),
  -- A society may raise the committee threshold above ceil(2M/3), never lower
  -- it: cf.required_committee enforces the floor whatever this says.
  committee_threshold int check (committee_threshold >= 2),
  created_at timestamptz not null default now()
);

create table private.society_secrets (
  society_id text primary key references public.societies,
  salt bytea not null default extensions.gen_random_bytes(32)
);

create table public.chain_entries (
  society_id text not null references public.societies,
  sequence bigint not null check (sequence >= 1),
  format_version int not null default 1,
  prev_hash bytea not null check (length(prev_hash) = 32),
  kind text not null references cf.kinds,
  recorded_at bigint not null,
  actor text,
  body jsonb not null,
  entry_hash bytea not null check (length(entry_hash) = 32),
  primary key (society_id, sequence)
);

create index chain_entries_kind on public.chain_entries (society_id, kind, sequence);
create index chain_entries_proposal on public.chain_entries (society_id, ((body->>'proposal_seq')::bigint))
  where kind in ('approval', 'posting', 'proposal_closed');

-- Append-only at the data layer: no path updates, deletes or truncates an
-- entry, whoever is connected.
create function cf.refuse_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'chain entries are append-only' using errcode = '42501';
end
$$;

create trigger chain_entries_no_update before update or delete on public.chain_entries
  for each row execute function cf.refuse_mutation();
create trigger chain_entries_no_truncate before truncate on public.chain_entries
  for each statement execute function cf.refuse_mutation();

-- The only writer. Takes the per-society lock, numbers the entry
-- contiguously (never a sequence object, which skips on rollback), and
-- hashes it.
create function cf.append(p_society text, p_kind text, p_actor text, p_body jsonb)
returns public.chain_entries
language plpgsql security definer set search_path = '' as $$
declare
  last public.chain_entries;
  body jsonb;
  rec public.chain_entries;
  ts bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if not (select chainable from cf.kinds where kind = p_kind) then
    raise exception 'chain: kind % may not be appended', p_kind using errcode = '22023';
  end if;
  perform 1 from public.societies where id = p_society for update;
  if not found then
    raise exception 'unknown society' using errcode = 'P0002';
  end if;

  select * into last from public.chain_entries
    where society_id = p_society order by sequence desc limit 1;

  body := cf.normalise(p_kind, p_body);
  rec.society_id := p_society;
  rec.sequence := coalesce(last.sequence, 0) + 1;
  rec.format_version := 1;
  rec.prev_hash := coalesce(last.entry_hash, decode(repeat('00', 32), 'hex'));
  rec.kind := p_kind;
  rec.recorded_at := greatest(ts, coalesce(last.recorded_at, 0));
  rec.actor := case when p_actor is null then null else normalize(p_actor, nfc) end;
  rec.body := body;
  rec.entry_hash := extensions.digest(
    cf.preimage(p_society, 1, rec.sequence, rec.prev_hash, p_kind, rec.recorded_at, rec.actor, body),
    'sha256');
  insert into public.chain_entries values (rec.*);
  return rec;
end
$$;

revoke all on function cf.append(text, text, text, jsonb) from public, anon, authenticated;
