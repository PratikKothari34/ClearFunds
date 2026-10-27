// deno test -A --config supabase/functions/api/deno.json supabase/functions/api/anchor.test.ts
// The publisher against an in-memory GitHub contents API.
import * as ed from "@noble/ed25519";
import { anchorFile, type Deps, type Due, publishAnchors, rawUrl } from "./anchor.ts";

const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\n  have: ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
};

const sk = new Uint8Array(32).fill(7);
const sign: Deps["sign"] = async (_s, m) =>
  ({ alg: "ed25519", public_key: [...await ed.getPublicKeyAsync(sk)].map((b) => b.toString(16).padStart(2, "0")).join(""),
     signature: [...await ed.signAsync(m, sk)].map((b) => b.toString(16).padStart(2, "0")).join("") });

const due = (period: string, seq: number, society = "soc_a"): Due =>
  ({ society_id: society, period, head_seq: seq, entry_count: seq, head_hash: String(seq).padStart(64, "0"),
     format_version: 1, as_of: 1000 + seq });

// Files by path, with GitHub's create-only and sha-checked update semantics.
function github(opts: { failPut?: string; wayback?: number } = {}) {
  const files = new Map<string, { sha: string; text: string }>();
  let n = 0;
  const calls: string[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.startsWith("https://web.archive.org/save/")) return new Response("", { status: opts.wayback ?? 200 });
    const path = decodeURIComponent(url.split("/contents/")[1].split("?")[0]);
    if ((init?.method ?? "GET") === "GET") {
      const file = files.get(path);
      if (!file) return new Response("", { status: 404 });
      const bytes = new TextEncoder().encode(file.text);
      return Response.json({ sha: file.sha, content: btoa(String.fromCharCode(...bytes)) });
    }
    if (opts.failPut && path.endsWith(opts.failPut)) return new Response("", { status: 500 });
    const body = JSON.parse(String(init!.body));
    const text = new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)));
    const existing = files.get(path);
    if (existing && body.sha !== existing.sha) return new Response("", { status: 422 });
    files.set(path, { sha: `sha${++n}`, text });
    return new Response("", { status: existing ? 200 : 201 });
  }) as typeof fetch;
  return { files, calls, fetch: f };
}

function deps(gh: ReturnType<typeof github>, list: Due[]) {
  const recorded: string[] = [], witnessed: string[] = [];
  const d: Deps = {
    repo: "anchors/clearfunds", token: "t", fetch: gh.fetch, sign, now: () => new Date("2026-11-01T00:30:00Z"),
    due: async () => list,
    record: async (x, body, url) => { recorded.push(`${x.period} ${url} ${body.length}`); },
    witnessed: async (x) => { witnessed.push(x.period); },
  };
  return { d, recorded, witnessed };
}

Deno.test("the file carries the head tuple in contract order, signed without its signature", async () => {
  const text = await anchorFile(due("2026-10", 412), "2026-11-01T00:30:00.000Z", sign);
  if (!text.endsWith("}\n")) throw new Error("one trailing newline");
  const j = JSON.parse(text);
  eq(Object.keys(j), ["schema_version", "society_id", "period", "head_seq", "entry_count", "head_hash", "hash_alg",
    "format_version", "as_of", "published_at", "server_signature"], "key order");
  const { server_signature: s, ...unsigned } = j;
  const ok = await ed.verifyAsync(Uint8Array.from(s.signature.match(/../g).map((h: string) => parseInt(h, 16))),
    new TextEncoder().encode(JSON.stringify(unsigned)), Uint8Array.from(s.public_key.match(/../g).map((h: string) => parseInt(h, 16))));
  eq(ok, true, "the signature verifies over the unsigned body");
});

Deno.test("each due month gets its period file; latest.json is a byte-identical copy of the newest", async () => {
  const gh = github();
  const { d, recorded, witnessed } = deps(gh, [due("2026-09", 300), due("2026-10", 412)]);
  const out = await publishAnchors(d);
  eq(out.map((o) => o.result), ["published", "published"], "both published");
  eq(gh.files.get("societies/soc_a/latest.json")!.text, gh.files.get("societies/soc_a/periods/2026-10.json")!.text,
    "latest.json is the newest period file, byte for byte");
  eq(recorded[1].split(" ")[1], rawUrl("anchors/clearfunds", "societies/soc_a/periods/2026-10.json"), "the recorded url is the raw host");
  eq(witnessed, ["2026-09", "2026-10"], "each period file is sent to the Wayback Machine");
});

Deno.test("a period file holding a different head is never replaced, and the society's later months wait", async () => {
  const gh = github();
  gh.files.set("societies/soc_a/periods/2026-09.json", { sha: "x", text: JSON.stringify({ society_id: "soc_a", head_seq: 299, head_hash: "f" }) });
  const { d, recorded } = deps(gh, [due("2026-09", 300), due("2026-10", 412), due("2026-10", 9, "soc_b")]);
  const out = await publishAnchors(d);
  eq(out.map((o) => `${o.society_id} ${o.period} ${o.result}`), ["soc_a 2026-09 conflict", "soc_b 2026-10 published"],
    "the conflict is reported, soc_a stops, another society carries on");
  eq(JSON.parse(gh.files.get("societies/soc_a/periods/2026-09.json")!.text).head_seq, 299, "the existing file is left in place");
  eq(gh.files.has("societies/soc_a/periods/2026-10.json"), false, "no later month skips past it");
  eq(recorded.length, 1, "nothing recorded for soc_a");
});

Deno.test("a retry after a crash recognises its own file and records those bytes", async () => {
  const gh = github();
  const first = await anchorFile(due("2026-10", 412), "2026-11-01T00:00:00.000Z", sign);
  gh.files.set("societies/soc_a/periods/2026-10.json", { sha: "x", text: first });
  const { d, recorded } = deps(gh, [due("2026-10", 412)]);
  eq((await publishAnchors(d)).map((o) => o.result), ["already"], "the same head is not a conflict");
  eq(gh.files.get("societies/soc_a/periods/2026-10.json")!.text, first, "and is not rewritten");
  eq(gh.files.get("societies/soc_a/latest.json")!.text, first, "latest.json catches up to it");
  eq(Number(recorded[0].split(" ")[2]), first.length, "the bytes recorded are the ones already published");
});

Deno.test("a failed latest.json write records nothing, so the month is retried", async () => {
  const gh = github({ failPut: "latest.json" });
  const { d, recorded } = deps(gh, [due("2026-09", 300), due("2026-10", 412)]);
  eq((await publishAnchors(d)).map((o) => o.result), ["failed"], "it fails, and the next month waits");
  eq(recorded.length, 0, "unrecorded, so still due next run");
});

Deno.test("a failed Wayback capture never stops publishing", async () => {
  const gh = github({ wayback: 503 });
  const { d, recorded, witnessed } = deps(gh, [due("2026-10", 412)]);
  eq((await publishAnchors(d)).map((o) => o.result), ["published"], "published");
  eq([recorded.length, witnessed.length], [1, 0], "recorded, not witnessed");
});

Deno.test("a head whose entry_count differs from head_seq is never published", async () => {
  const gh = github();
  const { d, recorded } = deps(gh, [{ ...due("2026-09", 300), entry_count: 299 }, due("2026-10", 412)]);
  eq((await publishAnchors(d)).map((o) => o.result), ["failed"], "it fails, and the next month waits");
  eq([gh.files.size, recorded.length], [0, 0], "nothing written or recorded");
});
