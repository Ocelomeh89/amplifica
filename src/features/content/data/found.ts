import { createHash } from "node:crypto";
import { IDEAS_PROMPT } from "@/features/content/engine/prompts/ideas";
import { angleBlock, type Angle } from "@/features/content/engine/angle";
import { chicagoIsoDate } from "@/features/content/engine/best-times";
import { MAX_UPLOAD_BYTES, checkText, fileKind, normalizeUrl, safeFilename } from "@/features/content/engine/found";
import { foundOutputSchema, renderUserTurn, toIngestPayload, type FoundContext } from "@/features/content/engine/found-ideas";
import { externalIdFromUrl, platformFromUrl } from "@/features/content/engine/posts";
import { extractReadable } from "@/features/content/engine/readable";
import type { ContentSourceInsert, Json } from "@/shared/supabase/database.types";
import type { IdeaGenerator } from "./claude";
import { ingestPayload, type IngestDb } from "./ingest";

// One flow for "ideas from something Miguel found": resolve the text, ask
// Claude, validate, then write through the same ingest the routines use.
// Nothing is written until Claude's answer has validated, so a failure at any
// earlier step leaves no trace.

export type FoundOptions = { note: string; angle: Angle; competitor: string };
export type FoundInput = (
  | { kind: "url"; url: string }
  | { kind: "upload"; filename: string; bytes: Uint8Array }
  | { kind: "again"; sourceId: string }
) &
  FoundOptions;

export type StoredSource = {
  id: string;
  kind: string;
  external_id: string;
  title: string;
  url: string | null;
  status: string;
  meta: Record<string, unknown>;
};

export interface FoundDeps {
  now(): Date;
  fetchPage(url: string): Promise<{ html: string; finalUrl: string }>;
  videoMeta(videoId: string): Promise<{ title: string; description: string } | null>;
  getSource(ref: { id: string } | { kind: string; external_id: string }): Promise<StoredSource | null>;
  /** Replaces the source's meta. Needed because source upserts are insert-ignore. */
  setMeta(id: string, meta: Record<string, unknown>): Promise<void>;
  storeFile(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  loadFile(path: string): Promise<Uint8Array>;
  context(): Promise<FoundContext>;
  generator: IdeaGenerator;
  ingestDb: IngestDb;
}

export type FoundResult = { ok: true; count: number; sourceId: string } | { ok: false; error: string };

type Resolved = {
  kind: "url" | "upload";
  external_id: string;
  title: string;
  url: string | null;
  text: string;
  pdf: Uint8Array | null;
  meta: Record<string, unknown>;
  existing: StoredSource | null;
  file: { path: string; bytes: Uint8Array; mime: string } | null;
};
type Failed = { error: string };

const YOUTUBE_MIN_CHARS = 40;
const EXCERPT_CHARS = 2000;

type ResolveDeps = Pick<FoundDeps, "fetchPage" | "videoMeta" | "getSource">;

async function resolveUrl(deps: ResolveDeps, input: Extract<FoundInput, { kind: "url" }>): Promise<Resolved | Failed> {
  const norm = normalizeUrl(input.url);
  if (!norm.ok) return { error: norm.error };
  let title: string;
  let body: string;
  let min: number | undefined;
  if (platformFromUrl(norm.url) === "youtube") {
    const video = await deps.videoMeta(externalIdFromUrl(norm.url, "youtube"));
    if (!video) return { error: "Couldn't read that YouTube video. Check the link, and that YOUTUBE_API_KEY is set." };
    title = video.title;
    body = `${video.title}\n\n${video.description}`;
    min = YOUTUBE_MIN_CHARS;
  } else {
    const page = await deps.fetchPage(norm.url);
    const read = extractReadable(page.html, page.finalUrl);
    title = read.title;
    body = read.text;
  }
  const checked = checkText(body, min);
  if (!checked.ok) return { error: checked.error };
  return {
    kind: "url",
    external_id: norm.url,
    title,
    url: norm.url,
    text: checked.text,
    pdf: null,
    meta: { text: checked.text, note: input.note, angle: input.angle, competitor: input.competitor },
    existing: await deps.getSource({ kind: "url", external_id: norm.url }),
    file: null,
  };
}

async function resolveUpload(deps: Pick<FoundDeps, "getSource">, userId: string, input: Extract<FoundInput, { kind: "upload" }>): Promise<Resolved | Failed> {
  const kind = fileKind(input.filename);
  if (!kind) return { error: "Upload a PDF, a .txt, or a .md file." };
  if (input.bytes.length === 0) return { error: "That file is empty." };
  if (input.bytes.length > MAX_UPLOAD_BYTES) return { error: `That file is over ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.` };
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const mime = kind === "pdf" ? "application/pdf" : "text/plain";
  const path = `${userId}/${hash}/${safeFilename(input.filename)}`;
  let text = "";
  if (kind === "text") {
    const checked = checkText(new TextDecoder().decode(input.bytes));
    if (!checked.ok) return { error: checked.error };
    text = checked.text;
  }
  return {
    kind: "upload",
    external_id: hash,
    title: input.filename,
    url: null,
    text,
    pdf: kind === "pdf" ? input.bytes : null,
    meta: { text, note: input.note, angle: input.angle, competitor: input.competitor, filename: input.filename, mime, storage_path: path },
    existing: await deps.getSource({ kind: "upload", external_id: hash }),
    file: { path, bytes: input.bytes, mime },
  };
}

async function resolveAgain(deps: FoundDeps, input: Extract<FoundInput, { kind: "again" }>): Promise<Resolved | Failed> {
  const src = await deps.getSource({ id: input.sourceId });
  if (!src || (src.kind !== "url" && src.kind !== "upload")) return { error: "That source can't be generated again." };
  const meta = { ...src.meta, note: input.note, angle: input.angle, competitor: input.competitor };
  const isPdf = src.meta.mime === "application/pdf";
  let pdf: Uint8Array | null = null;
  let text = "";
  if (isPdf) {
    const path = typeof src.meta.storage_path === "string" ? src.meta.storage_path : "";
    if (!path) return { error: "That PDF is no longer in storage." };
    pdf = await deps.loadFile(path);
  } else {
    text = typeof src.meta.text === "string" ? src.meta.text : "";
    if (!text) return { error: "No saved text for that source. Paste it in again." };
  }
  return { kind: src.kind, external_id: src.external_id, title: src.title, url: src.url, text, pdf, meta, existing: src, file: null };
}

export async function mineFound(deps: FoundDeps, userId: string, input: FoundInput): Promise<FoundResult> {
  try {
    const resolved =
      input.kind === "url" ? await resolveUrl(deps, input)
      : input.kind === "upload" ? await resolveUpload(deps, userId, input)
      : await resolveAgain(deps, input);
    if ("error" in resolved) return { ok: false, error: resolved.error };
    if (resolved.existing?.status === "denied") {
      return { ok: false, error: "That source is denied. Remove the deny first if you want ideas from it." };
    }

    const userTurn = renderUserTurn({
      title: resolved.title,
      url: resolved.url,
      text: resolved.text,
      note: input.note,
      angleBlock: angleBlock(input.angle, input.competitor),
      context: await deps.context(),
      isPdf: resolved.pdf !== null,
    });
    const raw = await deps.generator.generate({
      system: IDEAS_PROMPT,
      text: userTurn,
      pdf: resolved.pdf ? { base64: Buffer.from(resolved.pdf).toString("base64") } : undefined,
    });
    const parsed = foundOutputSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path.join(".") || "answer";
      return { ok: false, error: `Claude's answer didn't fit the idea format (${where}: ${first?.message}). Nothing was saved; try again.` };
    }

    // A PDF's text is not stored, so keep Claude's excerpt for display. On a re-mine the
    // existing excerpt is kept when Claude returns none.
    const excerpt = (parsed.data.source_excerpt ?? "").slice(0, EXCERPT_CHARS);
    const meta = resolved.pdf ? { ...resolved.meta, text: excerpt || String(resolved.meta.text ?? "") } : resolved.meta;
    const now = deps.now();
    const payload = toIngestPayload(
      parsed.data,
      {
        kind: resolved.kind,
        external_id: resolved.external_id,
        title: resolved.title,
        url: resolved.url,
        meta,
        mined_at: null,
      },
      input.angle,
      chicagoIsoDate(now)
    );

    if (resolved.file) await deps.storeFile(resolved.file.path, resolved.file.bytes, resolved.file.mime);
    const written = await ingestPayload(deps.ingestDb, payload, userId);

    // The ideas are in the Inbox now, so bookkeeping failures must not turn this into an error.
    // Mining is marked here, after the ideas exist, so a failed insert leaves the source unmined.
    try {
      if (!resolved.existing || resolved.existing.status === "allowed") {
        await deps.ingestDb.markMined([{ kind: resolved.kind, external_id: resolved.external_id, mined_at: now.toISOString() }]);
      }
      if (resolved.existing) await deps.setMeta(resolved.existing.id, meta);
    } catch (e) {
      console.error("found content: bookkeeping failed after ideas were written", e instanceof Error ? e.message : "unknown error");
    }
    return { ok: true, count: written.ideas.length, sourceId: written.sources[0].id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong. Nothing was saved." };
  }
}

export type QueueDeps = ResolveDeps & Pick<FoundDeps, "setMeta" | "storeFile" | "ingestDb">;
export type QueueResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Queue mode: resolve the text exactly as mineFound does, then stop before
 * Claude. The source is saved `allowed` and unmined; Claude Code turns the
 * queue into ideas later (routines/content-found.md). Never throws, and
 * writes nothing unless the source resolved and passed every check.
 */
export async function queueFound(
  deps: QueueDeps,
  userId: string,
  input: Extract<FoundInput, { kind: "url" | "upload" }>
): Promise<QueueResult> {
  try {
    const resolved = input.kind === "url" ? await resolveUrl(deps, input) : await resolveUpload(deps, userId, input);
    if ("error" in resolved) return { ok: false, error: resolved.error };
    if (resolved.pdf) {
      return {
        ok: false,
        error: "Queue mode takes links and .txt or .md files. For a PDF, run /content-found with the file path, or set an API key.",
      };
    }
    const existing = resolved.existing;
    if (existing?.status === "denied") {
      return { ok: false, error: "That source is denied. Remove the deny first if you want ideas from it." };
    }
    if (existing?.status === "mined") {
      return { ok: false, error: "Already mined. To get new ideas from it, run /content-found with the link and a new angle." };
    }
    if (existing && existing.status !== "allowed") {
      return { ok: false, error: "That source is waiting for a decision on the Sources page." };
    }
    if (existing) {
      // No file was stored for this paste, so keep the file reference the
      // existing row already points at.
      const old = existing.meta ?? {};
      await deps.setMeta(existing.id, {
        ...resolved.meta,
        ...(old.filename !== undefined ? { filename: old.filename } : {}),
        ...(old.storage_path !== undefined ? { storage_path: old.storage_path } : {}),
      });
      return { ok: true, message: "Already queued; updated." };
    }
    if (resolved.file) await deps.storeFile(resolved.file.path, resolved.file.bytes, resolved.file.mime);
    const row: ContentSourceInsert = {
      user_id: userId,
      kind: resolved.kind,
      external_id: resolved.external_id,
      title: resolved.title,
      url: resolved.url,
      status: "allowed",
      meta: resolved.meta as unknown as Json,
    };
    await deps.ingestDb.upsertSources([row]);
    return { ok: true, message: "Added to the queue. Ideas come with Monday's run, or run /content-found now." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong. Nothing was saved." };
  }
}
