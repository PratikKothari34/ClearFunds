-- Dues reminders (#56, contract #57).
--
-- A holder of send_dues_reminders mails every resident of each flat that
-- owes, naming that flat only, at most once a week per flat. The mail goes
-- through the same outbox as enrolment.

create table private.dues_reminders (
  society_id text not null,
  flat_id text not null,
  sent_at timestamptz not null default now()
);
create index dues_reminders_recent on private.dues_reminders (society_id, flat_id, sent_at);

-- Minor units as a person reads them, with the currency's own exponent
-- (AGENTS.md item 4: never a fixed /100). Rupees use Indian grouping.
create function cf.money_text(p_minor bigint, p_currency text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  e int := case p_currency when 'INR' then 2 when 'USD' then 2 when 'EUR' then 2 when 'GBP' then 2
                           when 'JPY' then 0 when 'KWD' then 3 when 'BHD' then 3 when 'OMR' then 3 end;
  a numeric := abs(p_minor);
  whole text;
  frac text;
  g text := '';
begin
  if e is null then
    raise exception 'no exponent known for currency %', p_currency using errcode = '22023';
  end if;
  whole := (trunc(a / 10 ^ e))::text;
  frac := lpad((a % (10 ^ e)::numeric)::bigint::text, e, '0');
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

create function public.api_send_dues_reminders(p_society text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d record;
  r record;
  soc public.societies;
  flats int := 0;
  mails int := 0;
  skipped int := 0;
begin
  perform cf.lock(p_society);
  perform cf.require_task(p_society, cf.require_person(auth.uid(), p_society), 'send_dues_reminders');
  select * into soc from public.societies where id = p_society;
  for d in select * from public.flat_dues where society_id = p_society and outstanding_minor > 0 order by ordinal loop
    if exists (select 1 from private.dues_reminders where society_id = p_society and flat_id = d.flat_id
                and sent_at > now() - interval '7 days') then
      skipped := skipped + 1;
      continue;
    end if;
    for r in select p.full_name, p.email from public.tenures t join public.people p on p.id = t.person_id
              where t.flat_id = d.flat_id and t.starts_on <= cf.today() and (t.ends_on is null or t.ends_on >= cf.today())
                and (t.kind = 'owner' or t.resides) loop
      insert into private.mail_outbox (to_email, subject, body) values (r.email,
        format('Maintenance due for flat %s, %s', d.label, soc.name),
        format(E'Hello %s,\n\nFlat %s owes %s to %s as of %s.\n\nCharged so far: %s\nPaid so far: %s\n\nIf you have already paid, open My flat in ClearFunds and tell the treasurer, with your UPI or bank reference.\n\nClearFunds',
               r.full_name, d.label, cf.money_text(d.outstanding_minor, soc.currency), soc.name,
               to_char(cf.today(), 'DD Mon YYYY'), cf.money_text(d.charged_minor, soc.currency),
               cf.money_text(d.paid_minor, soc.currency)));
      mails := mails + 1;
    end loop;
    insert into private.dues_reminders (society_id, flat_id) values (p_society, d.flat_id);
    flats := flats + 1;
  end loop;
  return jsonb_build_object('flats', flats, 'mails', mails, 'skipped_recent', skipped);
end
$$;

revoke all on function cf.money_text(bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.api_send_dues_reminders(text) from public, anon;
grant execute on function public.api_send_dues_reminders(text) to authenticated;
