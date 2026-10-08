import { voicePostSchema, voiceStale, type VoicePost, type VoiceRow } from "@/features/content/engine/voice";
import type { Result } from "./drafts";

// /content-voice's read and write path. built_from is stored as
// { files, previous_profile_md }: the file list the skill compares against the
// vault to decide staleness, and one prior profile so a bad rebuild can be reverted.

export interface VoiceDb {
  voice(): Promise<VoiceRow | null>;
  upsertVoice(a: {
    profile_md: string;
    exemplars: VoicePost["exemplars"];
    files: VoicePost["files"];
    previous_profile_md: string;
    built_at: string;
  }): Promise<void>;
}

function filesOf(builtFrom: unknown): unknown[] {
  const files = (builtFrom as { files?: unknown } | null)?.files;
  return Array.isArray(files) ? files : [];
}

export async function getVoice(db: VoiceDb, now: Date): Promise<Result> {
  const row = await db.voice();
  if (!row) return { status: 200, body: { voice: null, voice_stale: true } };
  return {
    status: 200,
    body: {
      voice: { profile_md: row.profile_md, exemplars: row.exemplars, files: filesOf(row.built_from), built_at: row.built_at },
      voice_stale: voiceStale(row.built_at, now),
    },
  };
}

export async function postVoice(db: VoiceDb, input: unknown, now: Date): Promise<Result> {
  const parsed = voicePostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
    };
  }
  const existing = await db.voice();
  await db.upsertVoice({
    profile_md: parsed.data.profile_md,
    exemplars: parsed.data.exemplars,
    files: parsed.data.files,
    previous_profile_md: existing?.profile_md ?? "",
    built_at: now.toISOString(),
  });
  return { status: 200, body: { ok: true } };
}
