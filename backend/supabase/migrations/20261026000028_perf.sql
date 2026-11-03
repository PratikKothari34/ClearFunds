-- What the production performance advisor reported (#81). No column, payload
-- or chain change, and every access rule reads exactly as before.

-- ---------------------------------------------------------------- RLS

-- (select auth.uid()) is evaluated once per query as an initplan;
-- a bare auth.uid() is evaluated once per row.
alter policy self_or_officials on public.people using (
  auth_user_id = (select auth.uid())
  or society_id in (select cf.my_committee_societies())
  or (society_id in (select cf.my_societies()) and (
       exists (select 1 from public.committee_seats s where s.person_id = people.id)
       or exists (select 1 from public.auditor_appointments a where a.person_id = people.id))));

alter policy self_or_committee on public.tenures using (
  person_id in (select id from public.people where auth_user_id = (select auth.uid()))
  or society_id in (select cf.my_committee_societies()));

alter policy self on public.seen
  using (person_id in (select id from public.people where auth_user_id = (select auth.uid())))
  with check (person_id in (select id from public.people where auth_user_id = (select auth.uid())));

-- ---------------------------------------------------------------- foreign keys

-- A foreign key with no index on its own columns makes every delete or key
-- change on the referenced row scan the referencing table.
-- chain_entries.kind is left unindexed on purpose: cf.kinds rows are never
-- deleted or renamed, and an index there is only write cost on the chain.
create index auditor_appointments_person on public.auditor_appointments (person_id);
create index claims_flat on public.claims (flat_id);
create index committee_seats_person on public.committee_seats (person_id);
create index logins_person on public.logins (person_id);
create index posts_holder on public.posts (holder);
create index society_setup_president on public.society_setup (president_person_id);
create index tenures_parent on public.tenures (parent_tenure_id);
create index tenures_society on public.tenures (society_id);
create index claim_authors_person on private.claim_authors (person_id);
create index expense_templates_created_by on private.expense_templates (created_by);
create index notice_drafts_author on private.notice_drafts (author);
create index notice_drafts_society on private.notice_drafts (society_id);
create index notice_reviews_draft on private.notice_reviews (draft_id);
create index notice_reviews_reviewer on private.notice_reviews (reviewer);

-- ---------------------------------------------------------------- keys

-- A log of reminders sent; nothing references a row, but every table gets a key.
alter table private.dues_reminders add column id bigint generated always as identity primary key;
