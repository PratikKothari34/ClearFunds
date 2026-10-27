-- Whether a tenure is open is decided by the society's date (#53).
--
-- Tenures start on cf.today(), the date in Asia/Kolkata, but open_tenure and
-- login_email compared against current_date, the database's UTC date. From
-- 00:00 to 05:30 IST the two differ by a day, so a resident added then had no
-- access until 05:30, and a tenure closed that day stayed open.

alter table public.tenures alter column starts_on set default cf.today();
alter table public.flats alter column joined_on set default cf.today();

create or replace function cf.open_tenure(p_society text, p_person uuid) returns public.tenures
language sql stable security definer set search_path = '' as $$
  select * from public.tenures
   where society_id = p_society and person_id = p_person
     and starts_on <= cf.today() and (ends_on is null or ends_on >= cf.today())
$$;

create or replace function cf.login_email(p_id text) returns text
language sql stable security definer set search_path = '' as $$
  select p.email from public.logins l join public.people p on p.id = l.person_id
   where l.clearfunds_id = p_id and case l.kind
     when 'post' then (cf.active_seat(l.society_id, l.person_id)).person_id is not null
     else exists (select 1 from public.tenures t where t.id = l.tenure_id
                    and t.starts_on <= cf.today() and (t.ends_on is null or t.ends_on >= cf.today())) end
$$;
