import { chicagoIsoDate } from "@/features/content/engine/best-times";
import { FORMAT_LABEL, type Format } from "@/features/content/engine/types";

// The daily ClickUp digest of ideas that passed the brand gate. The routine used to post every
// hook right after ingest, before the gate; now the app posts a batch once the gate has settled
// every idea in it. Found content (url and upload sources) never gets a digest.

export const DIGEST_CHANNEL = "7-9011777568-8";
const FOUND_KINDS = new Set(["url", "upload"]);

export type DigestIdea = { id: string; format: string; hook: string; status: string; source_kind: string | null };
export type DigestBatch = { batch: string; ideas: DigestIdea[] };

export interface DigestDb {
  /** Batches with at least one idea not yet digested. */
  openBatches(): Promise<DigestBatch[]>;
  markDigested(batch: string, at: string): Promise<void>;
}

const label = (format: string) => FORMAT_LABEL[format as Format] ?? format;

export function renderDigest(a: { date: string; passed: { id: string; format: string; hook: string }[]; failed: number; siteUrl: string }): string {
  const lines = [`**Content ideas for ${a.date}**: ${a.passed.length} passed the brand gate`, ""];
  a.passed.forEach((p, k) => lines.push(`${k + 1}. [${label(p.format)}] ${p.hook}: ${a.siteUrl}/content/ideas/${p.id}`));
  if (a.failed > 0) lines.push("", `${a.failed} didn't pass: ${a.siteUrl}/content/performance`);
  return lines.join("\n");
}

/** Posts every settled batch once. A failed post leaves the batch for the next cron. */
export async function postDigests(db: DigestDb, post: (markdown: string) => Promise<void>, now: Date, siteUrl: string): Promise<number> {
  let posted = 0;
  const at = now.toISOString();
  for (const b of await db.openBatches()) {
    if (b.ideas.some((i) => i.status === "gating")) continue;
    const routine = b.ideas.filter((i) => !FOUND_KINDS.has(i.source_kind ?? ""));
    if (routine.length === 0) {
      await db.markDigested(b.batch, at);
      continue;
    }
    const passed = routine.filter((i) => i.status !== "gate_failed");
    const failed = routine.length - passed.length;
    try {
      await post(renderDigest({ date: chicagoIsoDate(now), passed, failed, siteUrl }));
    } catch (e) {
      console.error("brand gate digest: post failed", e instanceof Error ? e.message : e);
      continue;
    }
    await db.markDigested(b.batch, at);
    posted += 1;
  }
  return posted;
}

/** Posts markdown to the digest channel through ClickUp's v3 chat API. Throws on failure. */
export function clickUpChatPoster(env: { token?: string; workspaceId?: string }, fetchImpl: typeof fetch = fetch) {
  return async (markdown: string): Promise<void> => {
    if (!env.token || !env.workspaceId) throw new Error("CLICKUP_API_TOKEN and CLICKUP_WORKSPACE_ID must be set to post the digest.");
    const res = await fetchImpl(`https://api.clickup.com/api/v3/workspaces/${env.workspaceId}/chat/channels/${DIGEST_CHANNEL}/messages`, {
      method: "POST",
      headers: { Authorization: env.token, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message", content_format: "text/md", content: markdown }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`clickup chat: HTTP ${res.status}`);
  };
}
