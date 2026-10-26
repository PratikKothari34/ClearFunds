// The signing boundary (AGENTS.md item 2).
//
// Keys are server-held: each admin's Ed25519 key is derived here from a
// master secret and never leaves this function. The database checks every
// rule; this function authenticates the caller, signs what the database says
// to sign, and hands the signature back. Its public half is registered in
// the chain so anyone can check a signature without trusting this server.
//
// The operator can therefore mint an approval. What bounds that is the chain
// head published outside admin control (GET /head), which this function
// signs but does not publish.

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as ed from "@noble/ed25519";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MASTER = Deno.env.get("CLEARFUNDS_SIGNING_SECRET");

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("CLEARFUNDS_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-file-name",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class Refusal extends Error {}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));

async function seed(label: string): Promise<Uint8Array> {
  if (!MASTER || MASTER.length < 32) throw new Error("CLEARFUNDS_SIGNING_SECRET is not configured");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(MASTER), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(label)));
}

const MINUTES_MAX = 10 * 1024 * 1024;
const minutesPath = (society: string) => `${society}/election-minutes.pdf`;
const sha256 = async (b: Uint8Array<ArrayBuffer>) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", b)));

const adminSeed = (society: string, person: string) => seed(`clearfunds/admin-key|${society}|${person}`);
const headSeed = (society: string) => seed(`clearfunds/head-key|${society}`);

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    // P0001 is a rule the database refused: its message is written for the user.
    if (error.code === "P0001") throw new Refusal(error.message);
    console.error(fn, error);
    throw new Error(`${fn} failed`);
  }
  return data as T;
}

type Intent = { person: string; key_seq: number | null; message: string; through_seq?: number };

// Registers the admin's current public key if the chain does not hold it,
// then signs the message the database produced.
async function sign(admin: SupabaseClient, user: string, society: string, intent: Intent) {
  const sk = await adminSeed(society, intent.person);
  const pk = hex(await ed.getPublicKeyAsync(sk));
  const keySeq = await rpc<number>(admin, "api_register_key", {
    p_user: user, p_society: society, p_public_key: pk });
  const signature = hex(await ed.signAsync(unhex(intent.message), sk));
  return { keySeq, signature };
}

async function cast(admin: SupabaseClient, user: string, society: string, seq: number, decision: string) {
  const intent = await rpc<Intent>(admin, "api_cast_intent", {
    p_user: user, p_society: society, p_seq: seq, p_decision: decision });
  const { keySeq, signature } = await sign(admin, user, society, intent);
  return rpc<{ status: string }>(admin, "api_cast", {
    p_user: user, p_society: society, p_seq: seq, p_decision: decision,
    p_key_seq: keySeq, p_signature: signature });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const route = new URL(req.url).pathname.replace(/^.*\/api/, "") || "/";

  try {
    const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
    const auth = req.headers.get("Authorization") ?? "";
    const asUser = createClient(URL_, ANON, {
      auth: { persistSession: false }, global: { headers: { Authorization: auth } } });
    const { data: who } = await asUser.auth.getUser(auth.replace(/^Bearer /, ""));
    const user = who?.user?.id;
    if (!user) return json({ error: "Sign in again." }, 401);

    if (req.method === "GET" && route === "/head") {
      const society = new URL(req.url).searchParams.get("society") ?? "";
      const head = await rpc<Record<string, unknown> | null>(asUser, "api_head", { p_society: society });
      if (!head) return json({ head: null });
      const sk = await headSeed(society);
      const payload = new TextEncoder().encode(JSON.stringify(head));
      return json({ head, signature: hex(await ed.signAsync(payload, sk)),
                    public_key: hex(await ed.getPublicKeyAsync(sk)) });
    }

    // Platform admin: creates societies and registers presidents, nothing more.
    if (route.startsWith("/platform/")) {
      const { data: plat } = await admin.from("platform_admins").select("auth_user_id").eq("auth_user_id", user);
      if (!plat?.length) return json({ error: "Only a ClearFunds platform admin can do this." }, 403);
      if (req.method === "GET" && route === "/platform/societies") {
        return json(await rpc(admin, "api_platform_list", { p_user: user }));
      }
      const body = await req.json().catch(() => ({}));
      if (req.method === "POST" && route === "/platform/societies") {
        return json({ society: await rpc<string>(admin, "api_platform_create", { p_user: user, p: body }) });
      }
      const m = route.match(/^\/platform\/societies\/(soc_[a-z0-9]+)\/president$/);
      if (req.method === "POST" && m) {
        return json(await rpc(admin, "api_platform_president", { p_user: user, p_society: m[1], p: body }));
      }
      return json({ error: "Not found." }, 404);
    }

    // The election minutes: stored, then hashed by this function, never by the client.
    if (req.method === "PUT" && route === "/setup/minutes") {
      const society = new URL(req.url).searchParams.get("society") ?? "";
      await rpc(asUser, "api_setup_get", { p_society: society }); // refuses anyone but the president
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length > MINUTES_MAX) return json({ error: "The minutes must be at most 10 MB." }, 400);
      if (req.headers.get("Content-Type") !== "application/pdf" || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
        return json({ error: "The minutes must be a PDF." }, 400);
      }
      const fileName = (req.headers.get("X-File-Name") ?? "minutes.pdf").normalize("NFC").slice(0, 200);
      const up = await admin.storage.from("society-docs").upload(minutesPath(society), bytes,
        { contentType: "application/pdf", upsert: true });
      if (up.error) throw up.error;
      const minutes = { file_name: fileName, size_bytes: bytes.length, sha256: await sha256(bytes) };
      await rpc(admin, "api_setup_minutes", { p_user: user, p_society: society, p_minutes: minutes });
      return json(minutes);
    }

    if (req.method !== "POST") return json({ error: "Not found." }, 404);
    const body = await req.json().catch(() => ({}));
    const society = String(body.society ?? "");

    if (route === "/open-society") {
      // Hash the stored object again: what is chained is what is in storage now.
      const file = await admin.storage.from("society-docs").download(minutesPath(society));
      if (file.error) return json({ error: "Upload the election minutes first." }, 400);
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      await rpc(admin, "api_setup_open", { p_user: user, p_society: society, p_confirm: String(body.confirm ?? ""),
        p_minutes: { sha256: await sha256(bytes) } });
      return json({ head: await rpc(asUser, "api_head", { p_society: society }) });
    }

    if (route === "/propose") {
      const made = await rpc<{ seq: number }>(admin, "api_propose", {
        p_user: user, p_society: society, p: body.proposal ?? {} });
      // The proposer's own approval, when their seat lets it count.
      let status = "open";
      try {
        status = (await cast(admin, user, society, made.seq, "approve")).status;
      } catch (e) {
        if (!(e instanceof Refusal)) throw e;
      }
      return json({ seq: made.seq, status });
    }

    if (route === "/cast") {
      const decision = body.decision === "decline" ? "decline" : "approve";
      return json(await cast(admin, user, society, Number(body.seq), decision));
    }

    if (route === "/signoff") {
      const intent = await rpc<Intent>(admin, "api_signoff_intent", {
        p_user: user, p_society: society, p_month: String(body.month ?? "") });
      const { keySeq, signature } = await sign(admin, user, society, intent);
      const seq = await rpc<number>(admin, "api_signoff", {
        p_user: user, p_society: society, p_month: body.month, p_through_seq: intent.through_seq,
        p_note: body.note ?? null, p_key_seq: keySeq, p_signature: signature });
      return json({ seq });
    }

    if (route === "/close-year") {
      const args = { p_user: user, p_society: society, p_fy: String(body.fy ?? ""),
                     p_opinion: String(body.opinion ?? ""), p_statement: String(body.statement ?? "") };
      const intent = await rpc<Intent>(admin, "api_close_intent", args);
      const { keySeq, signature } = await sign(admin, user, society, intent);
      const seq = await rpc<number>(admin, "api_close_year", {
        ...args, p_through_seq: intent.through_seq, p_key_seq: keySeq, p_signature: signature });
      return json({ seq });
    }

    return json({ error: "Not found." }, 404);
  } catch (e) {
    if (e instanceof Refusal) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: "Something went wrong on the server. Check the approvals queue before trying again." }, 500);
  }
});
