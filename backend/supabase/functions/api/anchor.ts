// Publishes each society's monthly chain head to the anchor repo, outside
// admin control (contracts/anchor/v1.md). A period file is created once and
// never replaced; latest.json is a byte-identical copy of the newest one.

export type Due = {
  society_id: string; period: string; head_seq: number; entry_count: number;
  head_hash: string; format_version: number; as_of: number;
};
export type Signature = { alg: "ed25519"; public_key: string; signature: string };
export type Outcome = { society_id: string; period: string; result: "published" | "already" | "conflict" | "failed"; detail?: string };

export type Deps = {
  repo: string;                       // "account/repo"
  token: string;                      // contents:write on that repo only
  due: () => Promise<Due[]>;
  sign: (society: string, message: Uint8Array) => Promise<Signature>;
  record: (d: Due, body: string, url: string) => Promise<void>;
  witnessed: (d: Due) => Promise<void>;
  fetch?: typeof fetch;
  now?: () => Date;
};

const enc = new TextEncoder();
const b64 = (s: string) => btoa(Array.from(enc.encode(s), (b) => String.fromCharCode(b)).join(""));
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));

export const rawUrl = (repo: string, path: string) => `https://raw.githubusercontent.com/${repo}/main/${path}`;

// The file's bytes. The signature covers the same keys, in the same order,
// without server_signature, as JSON.stringify writes them.
export async function anchorFile(d: Due, publishedAt: string, sign: Deps["sign"]): Promise<string> {
  const unsigned = {
    schema_version: 1, society_id: d.society_id, period: d.period, head_seq: d.head_seq,
    entry_count: d.entry_count, head_hash: d.head_hash, hash_alg: "sha256",
    format_version: d.format_version, as_of: d.as_of, published_at: publishedAt,
  };
  const server_signature = await sign(d.society_id, enc.encode(JSON.stringify(unsigned)));
  return JSON.stringify({ ...unsigned, server_signature }, null, 2) + "\n";
}

export async function publishAnchors(o: Deps): Promise<Outcome[]> {
  const f = o.fetch ?? fetch;
  const api = (path: string) => `https://api.github.com/repos/${o.repo}/contents/${path}`;
  const headers = { Authorization: `Bearer ${o.token}`, Accept: "application/vnd.github+json",
                    "User-Agent": "clearfunds-anchor", "X-GitHub-Api-Version": "2022-11-28" };
  const get = async (path: string) => {
    const r = await f(api(path) + "?ref=main", { headers });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GET ${path}: ${r.status}`);
    const j = await r.json();
    return { sha: j.sha as string, text: unb64(j.content as string) };
  };
  const put = (path: string, text: string, message: string, sha?: string) =>
    f(api(path), { method: "PUT", headers, body: JSON.stringify({ message, content: b64(text), branch: "main", ...(sha ? { sha } : {}) }) });

  const out: Outcome[] = [];
  const stopped = new Set<string>();
  for (const d of await o.due()) {
    // A society publishes its months in order: after one fails, its later
    // months wait, so latest.json never skips past a missing month.
    if (stopped.has(d.society_id)) continue;
    const dir = `societies/${d.society_id}`;
    const path = `${dir}/periods/${d.period}.json`;
    try {
      // Sequences are contiguous, so these are equal by construction. A head
      // where they differ is a bug here, and the client would refuse the file.
      if (d.entry_count !== d.head_seq) throw new Error(`entry_count ${d.entry_count} != head_seq ${d.head_seq}`);
      let text = await anchorFile(d, (o.now?.() ?? new Date()).toISOString(), o.sign);
      let result: Outcome["result"] = "published";
      const created = await put(path, text, `Anchor ${d.society_id} ${d.period}`);
      if (!created.ok) {
        // Never replace a period file. One already there is either this
        // publisher's own earlier write, recognised by its head, or a conflict.
        const existing = created.status === 422 || created.status === 409 ? await get(path) : null;
        if (!existing) throw new Error(`PUT ${path}: ${created.status}`);
        const prior = JSON.parse(existing.text);
        if (prior.head_seq !== d.head_seq || prior.head_hash !== d.head_hash || prior.society_id !== d.society_id) {
          out.push({ society_id: d.society_id, period: d.period, result: "conflict",
                     detail: `${path} already holds a different head; left in place` });
          stopped.add(d.society_id);
          continue;
        }
        text = existing.text;
        result = "already";
      }
      const latest = await get(`${dir}/latest.json`);
      if (latest?.text !== text) {
        const r = await put(`${dir}/latest.json`, text, `Latest ${d.society_id} ${d.period}`, latest?.sha);
        if (!r.ok) throw new Error(`PUT latest.json: ${r.status}`);
      }
      const url = rawUrl(o.repo, path);
      await o.record(d, text, url);
      out.push({ society_id: d.society_id, period: d.period, result });
      // The second witness. Best effort: a failed capture never stops publishing.
      try {
        const w = await f(`https://web.archive.org/save/${url}`, { signal: AbortSignal.timeout(30000) });
        if (w.ok) await o.witnessed(d);
      } catch { /* recorded as not witnessed */ }
    } catch (e) {
      out.push({ society_id: d.society_id, period: d.period, result: "failed", detail: String(e) });
      stopped.add(d.society_id);
    }
  }
  return out;
}
