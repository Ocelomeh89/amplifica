import { z } from "zod";
import { CANON_MESSAGES } from "./recreate";
import { CTA_TYPES, HOOK_TYPES, MESSAGES, ONSCREEN_TEXT, POST_STYLES, TAG_NAMES } from "./tags";

// Slice 6: labelling a popular competitor Reel with Miguel's own tag lists, from its
// cover image, caption and duration. Plus two fields only competitors carry: the belief
// the post pushes (for a rebuttal) and a note for a format no listed style fits.

export const COMPETITOR_TAG_TOOL = "record_competitor_tags";
/** A small multimodal call, a few a week; Opus is not needed for it. */
export const COMPETITOR_TAG_MODEL = "claude-sonnet-5-5";

const REEL_STYLES = POST_STYLES.filter((s) => s !== "carousel" && s !== "image");
const orBlank = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.enum(values), z.literal("")]);

export const competitorTagSchema = z
  .object({
    hook_type: orBlank(HOOK_TYPES),
    onscreen_text: orBlank(ONSCREEN_TEXT),
    cover_face: z.boolean(),
    cover_text: z.boolean(),
    cover_number: z.boolean(),
    cta_type: orBlank(CTA_TYPES),
    post_style: orBlank(REEL_STYLES as unknown as readonly [string, ...string[]]),
    message: orBlank(MESSAGES),
    hook_text: z.string().max(200),
    tag_confidence: z.object(Object.fromEntries(TAG_NAMES.map((n) => [n, z.number().min(0).max(1)])) as Record<(typeof TAG_NAMES)[number], z.ZodNumber>),
    pushes_belief: z.string().max(120).nullable(),
    format_note: z.string().max(160).nullable(),
  })
  .refine((t) => t.format_note === null || t.post_style === "", { message: "format_note is only for a format no listed post style fits; leave post_style blank with it." });

export type CompetitorTagsOut = z.infer<typeof competitorTagSchema>;

const enumOrBlank = (values: readonly string[], description: string) => ({ type: "string", enum: [...values, ""], description });

export function competitorTagToolSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      hook_type: enumOrBlank(HOOK_TYPES, "The kind of opening line. Blank if you cannot tell."),
      onscreen_text: enumOrBlank(ONSCREEN_TEXT, "Whether on-screen text repeats the hook, adds to it, or is absent."),
      cover_face: { type: "boolean", description: "The cover shows a face." },
      cover_text: { type: "boolean", description: "The cover shows words." },
      cover_number: { type: "boolean", description: "The cover shows a number." },
      cta_type: enumOrBlank(CTA_TYPES, "The call to action, usually in the caption."),
      post_style: enumOrBlank(REEL_STYLES, "The Reel's format. Blank, with a format_note, when none fits."),
      message: enumOrBlank(MESSAGES, "The canon argument it makes, if it makes one. Usually blank for a competitor."),
      hook_text: { type: "string", description: "The opening line as best you can tell, under 200 characters." },
      tag_confidence: {
        type: "object",
        properties: Object.fromEntries(TAG_NAMES.map((n) => [n, { type: "number", minimum: 0, maximum: 1 }])),
        required: [...TAG_NAMES],
        description: "How sure you are of each label, 0 to 1.",
      },
      pushes_belief: { type: ["string", "null"], description: "The conventional money advice the post promotes, in a few words, or null." },
      format_note: { type: ["string", "null"], description: "One line describing the format, only when no listed post style fits; else null." },
    },
    required: ["hook_type", "onscreen_text", "cover_face", "cover_text", "cover_number", "cta_type", "post_style", "message", "hook_text", "tag_confidence", "pushes_belief", "format_note"],
  };
}

export function competitorTagSystemPrompt(): string {
  return [
    "You label a popular Instagram Reel by another finance creator so Miguel Graf can learn from its format and answer its ideas. You see its cover image, caption and duration only, not the video.",
    "Use the listed values only. Leave a field blank when the cover and caption cannot show it.",
    "Confidence is honest: below 0.6 whenever the cover image cannot show the label (for example on-screen text that may appear only later in the video).",
    "pushes_belief is the conventional money advice the post promotes, in a few words (for example \"max out your 401k\" or \"buy term, invest the rest\"). Null when it promotes none.",
    "format_note describes the format in one line, only when no listed post style fits; then post_style is blank. Otherwise null.",
    "The canon arguments, for the message field:",
    CANON_MESSAGES.trim(),
  ].join("\n\n");
}

export function renderCompetitorTagTurn(p: { username: string; caption: string; duration_seconds: number | null }): string {
  const length = p.duration_seconds === null ? "unknown length" : `${Math.round(p.duration_seconds)} seconds`;
  return [`Reel by @${p.username}, ${length}. The cover image is attached.`, "Caption:", p.caption || "(no caption)", "", "Label it by calling the tool."].join("\n");
}
