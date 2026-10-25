-- Pin search_path on the helpers the advisor flagged. None is SECURITY
-- DEFINER and each already qualifies what it calls, so this changes no
-- behaviour; it removes the possibility that a caller's path ever could.
alter function cf.field(int, bytea) set search_path = '';
alter function cf.encode(text, jsonb) set search_path = '';
alter function cf.preimage(text, int, bigint, bytea, text, bigint, text, jsonb) set search_path = '';
alter function cf.normalise(text, jsonb) set search_path = '';
alter function cf.refuse_mutation() set search_path = '';
alter function cf.tenure_guard() set search_path = '';
alter function cf.err(text) set search_path = '';
alter function cf.today() set search_path = '';
alter function cf.text_ok(text, int) set search_path = '';
alter function cf.severity(text) set search_path = '';
alter function cf.approval_message(text, bigint, bytea, text, uuid) set search_path = '';
alter function cf.signoff_message(text, text, bigint, bytea, uuid) set search_path = '';
alter function cf.close_message(text, text, text, text, bigint, bytea, uuid) set search_path = '';
