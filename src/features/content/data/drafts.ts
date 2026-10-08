import { z } from "zod";
import { draftFilename, draftPostSchema, parseVaultPath, VAULT_FOLDER, vaultPath } from "@/features/content/engine/drafts";
import { lintDraft, type LintHit } from "@/features/content/engine/lint";
import { DRAFT_PROMPT } from "@/features/content/engine/prompts/draft";
import { HUMANIZE_PROMPT } from "@/features/content/engine/prompts/humanize";
import { voiceStale, type VoiceRow } from "@/features/content/engine/voice";
import { filesOf } from "./voice";
import type { Format } from "@/features/content/engine/types";

// What /content-draft reads and writes. The endpoints are thin wrappers; the
// logic is here over a DraftsDb interface so it is tested without Supabase.

export const QUEUE_LIMIT = 5;

export type DraftIdea = {
  id: string;
  format: Format;
  title: string;
  hook: string;
  hook_alt: string | null;
  belief_attacked: string;
  value_to_listener: string;
  why_it_stops: string;
  outline: unknown;
  quote: string;
  quote_ref: string;
  pillar: string;
  hook_type: string;
  status: string;
  has_draft: boolean;
};

export class DraftStoreError extends Error {
  constructor(public code: "idea_not_queued" | "draft_exists") {
    super(code);
    this.name = "DraftStoreError";
  }
}

export type StoreDraftArgs = {
  idea_id: string;
  raw: string;
  humanized: string;
  lint: LintHit[];
  model: string;
  obsidian_path: string;
  redo: boolean;
};

export interface DraftsDb {
  /** Queued ideas with no draft, in queue order: at most `limit`, plus how many such ideas exist in all. */
  queuedWithoutDraft(limit: number, now: Date): Promise<{ ideas: DraftIdea[]; total: number }>;
  ideaById(id: string): Promise<DraftIdea | null>;
  voice(): Promise<VoiceRow | null>;
  /** Atomic. Throws DraftStoreError for the two expected conflicts. */
  storeDraft(args: StoreDraftArgs): Promise<void>;
}

export type Result = { status: number; body: unknown };

export async function getDraftQueue(db: DraftsDb, rawId: string | null, now: Date): Promise<Result> {
  let ideas: DraftIdea[];
  let remaining = 0;
  if (rawId !== null) {
    if (!z.string().uuid().safeParse(rawId).success) return { status: 400, body: { error: "id must be a uuid" } };
    const one = await db.ideaById(rawId);
    if (!one) return { status: 404, body: { error: "idea not found" } };
    if (one.status !== "queued") return { status: 409, body: { error: "idea_not_queued" } };
    ideas = [one];
  } else {
    const q = await db.queuedWithoutDraft(QUEUE_LIMIT, now);
    ideas = q.ideas;
    remaining = Math.max(0, q.total - q.ideas.length);
  }
  const voice = await db.voice();
  // Calendar date in Chicago, so a late-evening run does not name the file for tomorrow.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now);
  const withPaths = ideas.map((i) => ({ ...i, suggested_obsidian_path: vaultPath(i.format, draftFilename(i.hook, today)) }));
  return {
    status: 200,
    body: {
      ideas: withPaths,
      remaining,
      voice: voice
        ? { profile_md: voice.profile_md, exemplars: voice.exemplars, files: filesOf(voice.built_from), built_at: voice.built_at }
        : null,
      voice_stale: voiceStale(voice?.built_at ?? null, now),
      prompts: { draft: DRAFT_PROMPT, humanize: HUMANIZE_PROMPT },
      vault_folder: VAULT_FOLDER,
    },
  };
}

export async function postDraft(db: DraftsDb, input: unknown): Promise<Result> {
  const parsed = draftPostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
    };
  }
  const d = parsed.data;
  const idea = await db.ideaById(d.idea_id);
  if (!idea) return { status: 404, body: { error: "idea not found" } };
  if (idea.status !== "queued") return { status: 409, body: { error: "idea_not_queued" } };
  if (idea.has_draft && !d.redo) return { status: 409, body: { error: "draft_exists" } };
  if (parseVaultPath(d.obsidian_path)?.format !== idea.format) {
    return { status: 400, body: { error: `obsidian_path folder must be ${VAULT_FOLDER}/${idea.format}/` } };
  }

  const lint = lintDraft(idea.format, d.humanized);
  try {
    await db.storeDraft({
      idea_id: d.idea_id,
      raw: d.raw,
      humanized: d.humanized,
      lint,
      model: d.model,
      obsidian_path: d.obsidian_path,
      redo: d.redo,
    });
  } catch (e) {
    if (e instanceof DraftStoreError) return { status: 409, body: { error: e.code } };
    throw e;
  }
  return { status: 200, body: { ok: true, lint } };
}
