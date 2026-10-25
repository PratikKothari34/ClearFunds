// Local demo data: Gulmohar Heights CHS, Pune. 96 flats, an 11-member
// committee (Maharashtra bye-law 113, up to 100 flats), and ten months of
// history built through the same rule functions the app uses.
//
// Run against the LOCAL stack only:
//   deno run -A backend/scripts/seed.ts
//
// Bulk history signs locally with the same key derivation as the edge
// function (it reads the same CLEARFUNDS_SIGNING_SECRET), because pushing
// ~3,000 approvals through HTTP one at a time is slow. The last stretch goes
// through the real edge function, so the deployed path is exercised too.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import * as ed from "npm:@noble/ed25519@3.0.0";

const API = "http://127.0.0.1:54321";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
export const DEMO_PASSWORD = "clearfunds-demo";

const envFile = new URL("../supabase/functions/.env", import.meta.url);
const MASTER = (await Deno.readTextFile(envFile)).match(/CLEARFUNDS_SIGNING_SECRET=(\S+)/)?.[1];
if (!MASTER) throw new Error("backend/supabase/functions/.env has no CLEARFUNDS_SIGNING_SECRET");

const db = createClient(API, SERVICE, { auth: { persistSession: false } });
const SOC = "soc_gulmohar";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));

async function seedKey(label: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(MASTER), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(label)));
}

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// Deterministic randomness, so every reset produces the same society.
let s = 20261026;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];

// ---------------------------------------------------------------- people

const committee = [
  { key: "president", name: "Anjali Deshpande", role: "president", flat: "A-801" },
  { key: "treasurer", name: "Rohan Mehta", role: "treasurer", flat: "B-402" },
  { key: "secretary", name: "Farah Shaikh", role: "secretary", flat: "A-303" },
  { key: "m1", name: "Vikram Joshi", role: "member", flat: "A-1102" },
  { key: "m2", name: "Sunita Iyer", role: "member", flat: "B-1004" },
  { key: "m3", name: "Prakash Patil", role: "member", flat: "A-504" },
  { key: "m4", name: "Neha Kulkarni", role: "member", flat: "B-701" },
  { key: "m5", name: "Arjun Nair", role: "member", flat: "A-202" },
  { key: "m6", name: "Kavita Rao", role: "member", flat: "B-1203" },
  { key: "m7", name: "Imran Qureshi", role: "member", flat: "A-904" },
  { key: "m8", name: "Deepa Menon", role: "member", flat: "B-303" },
];
const email = (k: string) => `${k}@gulmohar.test`;

const first = ["Aarav", "Ishaan", "Meera", "Priya", "Rahul", "Sneha", "Kiran", "Aditi", "Nikhil", "Pooja",
  "Sameer", "Tanvi", "Yash", "Zoya", "Gaurav", "Lata", "Manoj", "Ritu", "Siddharth", "Varsha"];
const last = ["Sharma", "Gokhale", "Bhatt", "Pillai", "Chavan", "Kapoor", "Sawant", "Reddy", "Bose", "Jain",
  "Thakur", "Agarwal", "Kamat", "Hegde", "Gupta", "Pawar"];

const userIds = new Map<string, string>(); // key -> auth user id
async function authUser(key: string) {
  const { data, error } = await db.auth.admin.createUser({ email: email(key), password: DEMO_PASSWORD, email_confirm: true });
  if (error) throw error;
  userIds.set(key, data.user.id);
  return data.user.id;
}

console.log("opening the society");
for (const c of committee) await authUser(c.key);
await authUser("auditor");
await authUser("resident");
await authUser("tenant");

await rpc("api_open_society", { p: {
  id: SOC, name: "Gulmohar Heights CHS", city: "Pune", fy_start_month: 4,
  approval_limit_minor: 25_000_00,
  committee: committee.map((c) => ({ name: c.name, email: email(c.key), role: c.role })),
} });

const flats: { id: string; label: string }[] = [];
const rows = [];
let ord = 0;
for (const wing of ["A", "B"]) for (let floor = 1; floor <= 12; floor++) for (let u = 1; u <= 4; u++) {
  ord++;
  rows.push({ society_id: SOC, ordinal: ord, label: `${wing}-${floor}${String(u).padStart(2, "0")}`,
              has_parking: (ord % 3) !== 0, joined_on: "2020-04-01" });
}
{
  const { data, error } = await db.from("flats").insert(rows).select("id,label");
  if (error) throw error;
  flats.push(...data!);
}
const flatId = (label: string) => flats.find((f) => f.label === label)!.id;

const { data: ppl } = await db.from("people").select("id,email").eq("society_id", SOC);
const personOf = (k: string) => ppl!.find((p) => p.email === email(k))!.id as string;

// Owners for every flat; committee members own theirs.
const owned = new Map(committee.map((c) => [c.flat, c.key]));
for (const f of flats) {
  let pid: string;
  if (owned.has(f.label)) pid = personOf(owned.get(f.label)!);
  else if (f.label === "A-604") pid = await rpc<string>("api_add_person", {
    p_society: SOC, p_name: "Ravi Kulkarni", p_email: email("resident"), p_phone: "+91 98220 10604" });
  else pid = await rpc<string>("api_add_person", { p_society: SOC,
    p_name: `${pick(first)} ${pick(last)}`, p_email: `owner.${f.label.toLowerCase()}@gulmohar.test` });
  await rpc("api_add_tenure", { p_society: SOC, p_person: pid, p_flat: f.id, p_kind: "owner", p_starts: "2020-04-01" });
}
// A tenant under the owner of B-904.
const tenant = await rpc<string>("api_add_person", { p_society: SOC, p_name: "Sana Mirza", p_email: email("tenant") });
await rpc("api_add_tenure", { p_society: SOC, p_person: tenant, p_flat: flatId("B-904"), p_kind: "tenant", p_starts: "2025-11-01" });
// The external auditor: a person in the registry, never a committee member.
const auditor = await rpc<string>("api_add_person", { p_society: SOC, p_name: "CA Meera Kulkarni", p_email: email("auditor") });

// ---------------------------------------------------------------- acting

async function signAs(key: string, message: string) {
  const person = personOf(key);
  const sk = await seedKey(`clearfunds/admin-key|${SOC}|${person}`);
  const keySeq = await rpc<number>("api_register_key", {
    p_user: userIds.get(key), p_society: SOC, p_public_key: hex(await ed.getPublicKeyAsync(sk)) });
  return { keySeq, signature: hex(await ed.signAsync(unhex(message), sk)) };
}

async function cast(key: string, seq: number, decision = "approve") {
  const intent = await rpc<{ message: string }>("api_cast_intent", {
    p_user: userIds.get(key), p_society: SOC, p_seq: seq, p_decision: decision });
  const { keySeq, signature } = await signAs(key, intent.message);
  return (await rpc<{ status: string }>("api_cast", { p_user: userIds.get(key), p_society: SOC, p_seq: seq,
    p_decision: decision, p_key_seq: keySeq, p_signature: signature })).status;
}

const voters = ["president", "treasurer", "secretary", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"];

// Proposes and approves until it posts (or stops early to leave it pending).
async function run(proposer: string, p: Record<string, unknown>, opts: { stopAt?: number } = {}) {
  const { seq } = await rpc<{ seq: number }>("api_propose", { p_user: userIds.get(proposer), p_society: SOC, p });
  const { data: pr } = await db.from("chain_entries").select("body").eq("society_id", SOC).eq("sequence", seq).single();
  const pair = pr!.body.tier === "pair";
  const order = pair ? ["treasurer", "secretary"] : [proposer, ...voters.filter((v) => v !== proposer)];
  let n = 0;
  for (const v of order) {
    if (opts.stopAt !== undefined && n >= opts.stopAt) break;
    const st = await cast(v, seq);
    n++;
    if (st !== "open") return { seq, status: st };
  }
  return { seq, status: "open" };
}

async function postingOf(proposalSeq: number) {
  const { data } = await db.from("ledger").select("seq").eq("society_id", SOC).eq("proposal_seq", proposalSeq).order("seq").limit(1).single();
  return data!.seq as number;
}

// ---------------------------------------------------------------- history

const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const day = (m: string, d: number) => `${m}-${String(d).padStart(2, "0")}`;
const lateFlats = new Set(["A-1203", "B-208", "B-1101"]);
const neverPaid = new Set(["A-407"]);
let receipts = 0;

const monthly = [
  { counterparty: "Eagle Eye Security Services", category: "security", amount: 68_400_00, d: 3, narration: "Security guards, 4 posts" },
  { counterparty: "CleanPro Facility Services", category: "housekeeping", amount: 42_500_00, d: 4, narration: "Housekeeping staff" },
  { counterparty: "MSEDCL", category: "electricity", amount: 0, d: 10, narration: "Common area electricity" },
  { counterparty: "Otis Elevator Company", category: "lift", amount: 9_800_00, d: 12, narration: "Lift AMC, both wings" },
  { counterparty: "Green Thumb Gardens", category: "gardening", amount: 6_500_00, d: 15, narration: "Garden upkeep" },
];

for (const m of months) {
  console.log("month", m);
  // Maintenance: a total that does not divide by 96, so the remainder
  // rotation is visible in the data.
  await run("treasurer", { action: "charge", amount_minor: 3_12_000_50, flat_set: "all", category: "maintenance",
                           narration: `Maintenance ${m}`, business_date: day(m, 1) });
  if (["2026-01", "2026-04", "2026-07", "2026-10"].includes(m)) {
    await run("treasurer", { action: "charge", amount_minor: 19_200_01, flat_set: "parking", category: "parking",
                             narration: `Parking, quarter from ${new Date(m + "-01").toLocaleString("en-IN", { month: "short", year: "numeric" })}`, business_date: day(m, 1) });
  }
  // What each flat was charged this month: its stored allocation lines.
  const owed = new Map<string, number>();
  {
    const { data } = await db.from("chain_entries").select("body").eq("society_id", SOC).eq("kind", "proposal")
      .eq("body->>action", "charge").like("body->>business_date", `${m}%`);
    for (const r of data!) r.body.flat_ids.forEach((id: string, i: number) =>
      owed.set(id, (owed.get(id) ?? 0) + r.body.line_amounts[i]));
  }
  // Receipts. Most pay by the 10th; a few pay late; one never pays.
  for (const f of flats) {
    if (neverPaid.has(f.label)) continue;
    if (lateFlats.has(f.label) && rnd() < 0.5) continue;
    if (m === "2026-10" && rnd() < 0.35) continue; // the month is not over
    const method = rnd() < 0.8 ? "UPI" : "NEFT";
    await run("treasurer", { action: "receipt", amount_minor: owed.get(f.id)!, flat_id: f.id, category: "maintenance",
      counterparty: `Flat ${f.label}`, narration: `${method} ref ${Math.floor(rnd() * 9e11 + 1e11)}`,
      business_date: day(m, 2 + Math.floor(rnd() * 9)) });
    receipts++;
  }
  for (const e of monthly) {
    const amount = e.amount || Math.round(38_000_00 + rnd() * 9_000_00);
    await run(pick(["treasurer", "secretary"]), { action: "expense", amount_minor: amount, counterparty: e.counterparty,
      category: e.category, narration: e.narration, business_date: day(m, e.d) });
  }
  if (m === "2026-02") {
    await run("treasurer", { action: "expense", amount_minor: 4_200_00, counterparty: "Om Stationers",
      category: "admin", narration: "Receipt books and AGM printing", business_date: day(m, 18) });
  }
  if (m === "2026-03") {
    // Statutory audit fee for the closing year.
    await run("secretary", { action: "expense", amount_minor: 18_000_00, counterparty: "Kulkarni & Associates",
      category: "audit", narration: "Statutory audit fee FY 2025-26", business_date: day(m, 28) });
  }
  if (m === "2026-07") {
    // Structuring: three below-limit payments to one payee inside 30 days.
    for (const [d, amt, what] of [[6, 18_500_00, "Terrace waterproofing, part 1"], [14, 19_200_00, "Terrace waterproofing, part 2"],
                                  [27, 16_800_00, "Terrace waterproofing, part 3"]] as const) {
      await run("treasurer", { action: "expense", amount_minor: amt, counterparty: "Shree Sai Plumbing",
        category: "repairs", narration: what, business_date: day(m, d) });
    }
  }
  if (m === "2026-08") {
    // A duplicate entry, reversed with a reason.
    const dup = await run("treasurer", { action: "expense", amount_minor: 6_500_00, counterparty: "Green Thumb Gardens",
      category: "gardening", narration: "Garden upkeep", business_date: day(m, 16) });
    await run("treasurer", { action: "reversal", target_seq: await postingOf(dup.seq),
      narration: "Reverse duplicate garden invoice", reason: "Invoice GT-0816 was entered twice. The first entry on 15 Aug stands." });
    // Wrong amount: reversal plus replacement, atomically.
    const wrong = await run("secretary", { action: "expense", amount_minor: 12_400_00, counterparty: "Bright Sparks Electricals",
      category: "repairs", narration: "Corridor lights, B wing", business_date: day(m, 21) });
    await run("treasurer", { action: "reversal", target_seq: await postingOf(wrong.seq), replacement_amount_minor: 11_400_00,
      narration: "Correct corridor lights invoice", reason: "Invoice total was ₹11,400, not ₹12,400. Typing error." });
  }
  if (m === "2026-03") {
    // Close the books on FY 2025-26: appoint the auditor first.
    await run("president", { action: "appoint_auditor", person: auditor, fy: "2025-26",
      narration: "Appoint Kulkarni & Associates as statutory auditor, FY 2025-26" });
  }
}

// President's monthly sign-off for each finished month.
for (const m of months.slice(0, -1)) {
  const intent = await rpc<{ message: string; through_seq: number }>("api_signoff_intent", {
    p_user: userIds.get("president"), p_society: SOC, p_month: m });
  const { keySeq, signature } = await signAs("president", intent.message);
  await rpc("api_signoff", { p_user: userIds.get("president"), p_society: SOC, p_month: m,
    p_through_seq: intent.through_seq, p_note: null, p_key_seq: keySeq, p_signature: signature });
}

// The auditor closes FY 2025-26 with a qualified opinion.
{
  const statement = "In my opinion, subject to the matter below, the statements give a true and fair view of the " +
    "society's affairs as at 31 March 2026. Basis for qualification: receipts for three flats in January were " +
    "recorded from bank statements without the society's own receipt counterfoils. My opinion expresses reasonable " +
    "assurance on the evidence examined; it is not a guarantee.";
  const args = { p_user: userIds.get("auditor"), p_society: SOC, p_fy: "2025-26", p_opinion: "qualified", p_statement: statement };
  const intent = await rpc<{ message: string; through_seq: number; person: string }>("api_close_intent", args);
  const sk = await seedKey(`clearfunds/admin-key|${SOC}|${intent.person}`);
  const keySeq = await rpc<number>("api_register_key", { p_user: userIds.get("auditor"), p_society: SOC,
    p_public_key: hex(await ed.getPublicKeyAsync(sk)) });
  await rpc("api_close_year", { ...args, p_through_seq: intent.through_seq, p_key_seq: keySeq,
    p_signature: hex(await ed.signAsync(unhex(intent.message), sk)) });
}

// An adjusting entry across the closed year: a March expense found to be
// wrong after the audit. It posts in the current year, disclosed at the AGM.
{
  const { data } = await db.from("ledger").select("seq").eq("society_id", SOC).eq("counterparty", "Om Stationers").limit(1).single();
  await run("secretary", { action: "reversal", target_seq: data!.seq,
    narration: "Reverse Feb stationery bill", reason: "Vendor refunded the full amount: AGM printing was cancelled. Found after audit." });
}

// ---------------------------------------------------------------- disputes

async function asUser(key: string) {
  const c = createClient(API, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: email(key), password: DEMO_PASSWORD });
  if (error) throw error;
  return c;
}

{
  const ravi = await asUser("resident");
  const { data: plumb } = await db.from("ledger").select("seq").eq("society_id", SOC).eq("counterparty", "Shree Sai Plumbing").order("seq");
  const r1 = await ravi.rpc("api_raise_flag", { p_society: SOC, p: { scope: "counterparty", counterparty: "Shree Sai Plumbing",
    text: "Three waterproofing bills in one month to the same plumber. Was this one job? Why no committee vote?" } });
  if (r1.error) throw r1.error;
  const t = await ravi.rpc("api_raise_flag", { p_society: SOC, p: { scope: "entries", target_seqs: [plumb![0].seq],
    text: "Please share the quotation for part 1." } });
  if (t.error) throw t.error;
  const sec = await asUser("secretary");
  await sec.rpc("api_flag_note", { p_society: SOC, p_flag_seq: t.data, p_note: "response",
    p_text: "Quotation QS-0703 is on the notice board and attached to the July minutes." });
  await ravi.rpc("api_flag_note", { p_society: SOC, p_flag_seq: t.data, p_note: "resolved", p_text: "Seen it, thanks." });

  const sana = await asUser("tenant");
  const { data: lift } = await db.from("ledger").select("seq").eq("society_id", SOC).eq("counterparty", "Otis Elevator Company").order("seq", { ascending: false }).limit(1);
  const f3 = await sana.rpc("api_raise_flag", { p_society: SOC, p: { scope: "entries", target_seqs: [lift![0].seq],
    text: "B-wing lift was out of service for 9 days in October. Is the AMC still being paid in full?" } });
  if (f3.error) throw f3.error;
}

// ---------------------------------------------------------------- pending

// Through the real edge function: what is waiting for the committee today.
async function viaEdge(key: string, path: string, body: unknown) {
  const c = await asUser(key);
  const { data } = await c.auth.getSession();
  const res = await fetch(`${API}/functions/v1/api${path}`, { method: "POST",
    headers: { Authorization: `Bearer ${data.session!.access_token}`, apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify(body) });
  const out = await res.json();
  if (!res.ok) throw new Error(`${path}: ${out.error}`);
  return out;
}

console.log("pending items through the edge function");
const pump = await viaEdge("treasurer", "/propose", { society: SOC, proposal: { action: "expense", amount_minor: 1_45_000_00,
  counterparty: "Kirloskar Pumps", category: "repairs", narration: "Replace main water pump, A wing", business_date: "2026-10-24" } });
for (const k of ["secretary", "president", "m1", "m2", "m4"]) await viaEdge(k, "/cast", { society: SOC, seq: pump.seq });
await viaEdge("secretary", "/propose", { society: SOC, proposal: { action: "expense", amount_minor: 8_750_00,
  counterparty: "Pest Free Services", category: "housekeeping", narration: "Quarterly pest control", business_date: "2026-10-25" } });
await viaEdge("treasurer", "/propose", { society: SOC, proposal: { action: "receipt", amount_minor: 3_250_00, flat_id: flatId("A-1203"),
  counterparty: "Flat A-1203", category: "maintenance", narration: "UPI ref 604412339817", business_date: "2026-10-25" } });
await viaEdge("president", "/propose", { society: SOC, proposal: { action: "limit_change", amount_minor: 30_000_00,
  narration: "Raise the pair limit to ₹30,000 as agreed at the September meeting" } });

const { count } = await db.from("chain_entries").select("*", { count: "exact", head: true }).eq("society_id", SOC);
console.log(`done: ${count} chain entries, ${receipts} receipts. Sign in with any of:`);
for (const k of ["president", "treasurer", "secretary", "m1", "auditor", "resident", "tenant"]) {
  console.log(`  ${email(k).padEnd(28)} ${DEMO_PASSWORD}`);
}
