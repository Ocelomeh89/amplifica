import { z } from "zod";

// The six choices Miguel makes on a post, as values the tagging routine, the
// endpoint, the migration checks and the Performance page all share. Slices 3
// and 6 reuse these lists for Recreate and competitor posts.

export const HOOK_TYPES = [
  "belief-attacking",
  "paradox",
  "failure-lesson",
  "ranking",
  "identity",
  "question",
  "real-numbers",
  "story-moment",
  "promise",
  "warning",
] as const;
export const ONSCREEN_TEXT = ["repeats-hook", "adds-to-hook", "none"] as const;
export const MESSAGES = [
  "scoreboard",
  "velocity",
  "dollars-not-yourself",
  "debt-efficiency",
  "credit-ladder",
  "system-over-willpower",
  "forced-sale",
  "none",
] as const;
export const CTA_TYPES = ["comment-keyword", "save", "share", "follow", "link-in-bio", "none"] as const;
export const POST_STYLES = [
  "talking-head",
  "talking-head-text",
  "text-broll",
  "animation",
  "screen-recording",
  "carousel",
  "image",
] as const;

export type HookType = (typeof HOOK_TYPES)[number];
export type OnscreenText = (typeof ONSCREEN_TEXT)[number];
export type Message = (typeof MESSAGES)[number];
export type CtaType = (typeof CTA_TYPES)[number];
export type PostStyle = (typeof POST_STYLES)[number];

export const TAG_NAMES = [
  "hook_type",
  "onscreen_text",
  "message",
  "cta_type",
  "post_style",
  "cover_face",
  "cover_text",
  "cover_number",
] as const;
export type TagName = (typeof TAG_NAMES)[number];

const COVER_NAMES = ["cover_face", "cover_text", "cover_number"] as const;
const LISTS = {
  hook_type: HOOK_TYPES,
  onscreen_text: ONSCREEN_TEXT,
  message: MESSAGES,
  cta_type: CTA_TYPES,
  post_style: POST_STYLES,
} as const;

const titleCase = (slug: string) => slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
/** Slug to display label. Slugs shared by lists (none) read the same in each. */
export const TAG_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(LISTS)
    .flat()
    .map((s) => [s, titleCase(s)])
);

export type PostTags = {
  hook_type: string;
  onscreen_text: string;
  message: string;
  cta_type: string;
  post_style: string;
  cover_face: boolean | null;
  cover_text: boolean | null;
  cover_number: boolean | null;
  hook_spoken: string;
  hook_onscreen: string;
  tag_confidence: Record<string, number>;
  tag_locks: string[];
  tagged_at: string | null;
};

export const LOW_CONFIDENCE = 0.6;

/** True when the routine reported a confidence under the threshold for this tag. */
export function isLowConfidence(t: Pick<PostTags, "tag_confidence">, name: TagName): boolean {
  const c = t.tag_confidence[name];
  return c !== undefined && c < LOW_CONFIDENCE;
}

export function captionLength(caption: string): "short" | "medium" | "long" {
  const n = caption.trim() ? caption.trim().split(/\s+/).length : 0;
  return n < 40 ? "short" : n <= 150 ? "medium" : "long";
}

/** "face + text", "no face + number"; empty when no cover flag is tagged. */
export function coverSummary(t: Pick<PostTags, "cover_face" | "cover_text" | "cover_number">): string {
  const parts: string[] = [];
  if (t.cover_face === true) parts.push("face");
  else if (t.cover_face === false) parts.push("no face");
  if (t.cover_text === true) parts.push("text");
  if (t.cover_number === true) parts.push("number");
  return parts.join(" + ");
}

export type FilterName = TagName | "caption_length";
export type TagFilter = { name: FilterName; value: string };

const CAPTION_LENGTHS = ["short", "medium", "long"] as const;

function validValue(name: string, value: string): name is FilterName {
  if (name === "caption_length") return (CAPTION_LENGTHS as readonly string[]).includes(value);
  if ((COVER_NAMES as readonly string[]).includes(name)) return value === "true" || value === "false";
  const list = (LISTS as Record<string, readonly string[]>)[name];
  return !!list && list.includes(value);
}

/** Reads repeated `tag=name:value` params. Unknown names or values are dropped; duplicates collapse. */
export function parseTagFilters(param: string | string[] | undefined): TagFilter[] {
  const raw = param === undefined ? [] : Array.isArray(param) ? param : [param];
  const seen = new Set<string>();
  const out: TagFilter[] = [];
  for (const item of raw) {
    const i = item.indexOf(":");
    if (i < 1) continue;
    const name = item.slice(0, i);
    const value = item.slice(i + 1);
    if (!validValue(name, value) || seen.has(item)) continue;
    seen.add(item);
    out.push({ name: name as FilterName, value });
  }
  return out;
}

/** AND of every filter. An untagged value never matches; caption length is derived, so it always can. */
export function filterByTags<T extends PostTags & { caption: string }>(posts: T[], filters: TagFilter[]): T[] {
  if (filters.length === 0) return posts;
  return posts.filter((p) =>
    filters.every((f) => {
      if (f.name === "caption_length") return captionLength(p.caption) === f.value;
      const v = p[f.name];
      return v !== null && v !== "" && String(v) === f.value;
    })
  );
}

const hookText = z.string().max(500);
// A record keyed by an enum demands every key, so confidence is a partial strict object.
const confidenceSchema = z
  .object(Object.fromEntries(TAG_NAMES.map((n) => [n, z.number().min(0).max(1).optional()])) as Record<TagName, z.ZodOptional<z.ZodNumber>>)
  .strict();

export const tagPostSchema = z
  .object({
    id: z.string().uuid(),
    hook_type: z.enum(HOOK_TYPES).optional(),
    onscreen_text: z.enum(ONSCREEN_TEXT).optional(),
    message: z.enum(MESSAGES).optional(),
    cta_type: z.enum(CTA_TYPES).optional(),
    post_style: z.enum(POST_STYLES).optional(),
    cover_face: z.boolean().optional(),
    cover_text: z.boolean().optional(),
    cover_number: z.boolean().optional(),
    hook_spoken: hookText.optional(),
    hook_onscreen: hookText.optional(),
    tag_confidence: confidenceSchema.optional(),
  })
  .strict();

export const tagBodySchema = z.object({ posts: z.array(tagPostSchema).min(1).max(25) }).strict();
export type TagPostInput = z.infer<typeof tagPostSchema>;
