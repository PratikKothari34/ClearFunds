# Contract changelog

Append-only. One line per contract PR:
`date | contract | change | issue | breaking or not`

2026-10-23 | chain-entry.v1 | ADD preimage encoding, envelope, sequence rule, reserved test_vector kind, test vectors | #2 | new
2026-10-26 | chain-entry.v1 | ADD kinds society_opened, key_registered, proposal, approval, posting, proposal_closed, flag, flag_note, month_signoff, year_close; pseudonym and signature messages | revamp | new, additive
2026-10-26 | api.v1 | ADD read views, RPCs and the signing edge function | revamp | new
2026-10-26 | chain-entry.v1 | ADD kinds document_attached, tasks_set; task catalogue; order at open; vectors society-kinds.v1.json | #10 | new, additive
2026-10-26 | api.v1 | ADD society lifecycle, platform admin routes, setup draft, minutes upload, open-society, api_set_post, api_tour_done; task checks on existing writes | #10 | additive; existing committee writes now also need a task
