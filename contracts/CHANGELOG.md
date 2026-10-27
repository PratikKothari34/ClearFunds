# Contract changelog

Append-only. One line per contract PR:
`date | contract | change | issue | breaking or not`

2026-10-23 | chain-entry.v1 | ADD preimage encoding, envelope, sequence rule, reserved test_vector kind, test vectors | #2 | new
2026-10-26 | chain-entry.v1 | ADD kinds society_opened, key_registered, proposal, approval, posting, proposal_closed, flag, flag_note, month_signoff, year_close; pseudonym and signature messages | revamp | new, additive
2026-10-26 | api.v1 | ADD read views, RPCs and the signing edge function | revamp | new
2026-10-26 | chain-entry.v1 | ADD kinds document_attached, tasks_set; task catalogue; order at open; vectors society-kinds.v1.json | #10 | new, additive
2026-10-26 | api.v1 | ADD society lifecycle, platform admin routes, setup draft, minutes upload, open-society, api_set_post, api_tour_done; task checks on existing writes | #10 | additive; existing committee writes now also need a task
2026-10-26 | api.v1 | ADD sign-in by ClearFunds ID and email OTP, ID formats and lifecycle, enrolment mail, api_my_ids | #11 | additive
2026-10-26 | chain-entry.v1 | ADD kinds payment_claim, claim_closed; vectors claims-kinds.v1.json | #12 | new, additive
2026-10-26 | api.v1 | ADD payment claims: api_claim_payment, payment_claims, api_reject_claim, claim_seq on /propose, api_claims_unreviewed | #12 | additive
2026-10-26 | chain-entry.v1 | ADD kinds notice, vote_opened, ballot, vote_closed, proposal_ref; flat token; vectors notices-kinds.v1.json | #13 | new, additive
2026-10-26 | api.v1 | ADD notice drafts and review, publishing, notices read, /ballot, vote closing, vote citation on /propose | #13 | additive
2026-10-26 | api.v1 | ADD api_lookup and api_entry_context | #14 | additive
2026-10-26 | api.v1 | CLARIFY api_setup_save returns draft; flat_dues and ledger amounts never null | #45 | not breaking
2026-10-27 | chain-entry.v1 | ADD flat_set value flat (one-flat charge) and category opening (committee tier); no layout change | #50 | additive
2026-10-27 | api.v1 | ADD api_send_dues_reminders | #56 | additive
