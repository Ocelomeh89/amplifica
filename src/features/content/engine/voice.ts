import { z } from "zod";

// The voice profile contract. Built by the local /content-voice skill from the
// vault, stored in content_voice. Pure.

export const VOICE_MAX_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

export function voiceStale(builtAt: string | null, now: Date): boolean {
  if (!builtAt) return true;
  const t = Date.parse(builtAt);
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > VOICE_MAX_AGE_DAYS * DAY_MS;
}

export const voicePostSchema = z.object({
  profile_md: z.string().min(300).max(20_000),
  exemplars: z.array(z.object({ path: z.string().min(1), excerpt: z.string().min(200).max(2_000) })).min(1).max(12),
  files: z
    .array(z.object({ path: z.string().min(1), mtime: z.string().min(1), bytes: z.number().int().nonnegative() }))
    .min(1)
    .max(500),
});
export type VoicePost = z.infer<typeof voicePostSchema>;

export type VoiceRow = { profile_md: string; exemplars: unknown; built_from: unknown; built_at: string | null };
