import { z } from "zod";
import { CONTENT_POSITIONING, IDEAS_PROMPT } from "./prompts/ideas";
import { ingestIdeaSchema } from "./schema";
import { HOOK_TYPES, MESSAGES, type PostTags } from "./tags";
import type { WinnerInsights } from "./winners";

// Slice 3: Recreate. A source post becomes 3 hook-and-angle options; the picked
// one becomes a Reel idea. Pure: the Claude call and the database live in data/.

export const RECREATE_MODES = ["same-recipe", "adjacent"] as const;
export const RECREATE_STATUSES = ["pending", "ready", "failed", "picked", "discarded"] as const;

export type RecreateMode = (typeof RECREATE_MODES)[number];
export type RecreateStatus = (typeof RECREATE_STATUSES)[number];

export const RECREATE_DAILY_CAP = 10;
export const STALE_PENDING_MINUTES = 10;
export const RECENT_HOOK_DAYS = 60;
export const RECREATE_TOOL_NAME = "record_options";

export const MODE_LABEL: Record<RecreateMode, string> = {
  "same-recipe": "Same recipe, new topic",
  adjacent: "Adjacent topic",
};

export type RecreateOption = { hook: string; angle: string; topic: string; message: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const blankOrNone = (m: string) => m === "" || m === "none";

const optionSchema = z.object({
  hook: z.string().trim().min(1).max(200),
  angle: z.string().trim().min(1).max(300),
  topic: z.string().trim().min(1).max(120),
  message: z.string(),
});

/** Exactly 3 options with distinct topics, and a message that fits the mode. */
export function recreateOutputSchema(mode: RecreateMode, sourceMessage: string) {
  return z
    .object({ options: z.array(optionSchema).length(3) })
    .superRefine((v, ctx) => {
      const topics = v.options.map((o) => norm(o.topic));
      if (new Set(topics).size !== topics.length) {
        ctx.addIssue({ code: "custom", message: "The 3 options must name 3 different topics." });
      }
      v.options.forEach((o, i) => {
        const canon = (MESSAGES as readonly string[]).includes(o.message);
        let ok: boolean;
        if (mode === "adjacent") ok = canon && o.message !== "none" && o.message !== sourceMessage;
        else ok = blankOrNone(sourceMessage) ? canon : o.message === sourceMessage;
        if (!ok) {
          ctx.addIssue({
            code: "custom",
            path: ["options", i, "message"],
            message:
              mode === "adjacent"
                ? `Option ${i + 1} needs a canon message other than "${sourceMessage || "none"}".`
                : `Option ${i + 1} must keep the source message.`,
          });
        }
      });
    });
}

export function recreateToolSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      options: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            hook: { type: "string", description: "The first line the audience sees or hears." },
            angle: { type: "string", description: "One line on the take this reel makes." },
            topic: { type: "string", description: "A few words naming the topic. Distinct across the 3 options." },
            message: { type: "string", enum: [...MESSAGES], description: "The canon argument this option makes." },
          },
          required: ["hook", "angle", "topic", "message"],
        },
      },
    },
    required: ["options"],
  };
}

export const canRecreate = (p: Pick<PostTags, "tagged_at">): boolean => p.tagged_at !== null;

export type RecreateSource = PostTags & { caption: string; media_type: string; figures: string[] };

const between = (text: string, from: string, to: string): string => {
  const a = text.indexOf(from);
  const b = text.indexOf(to);
  if (a < 0 || b < 0 || b < a) throw new Error(`ideas prompt headings moved: ${from} / ${to}`);
  return text.slice(a, b).trim();
};

const OPTION_RULES = `
## What you return

Call the tool with exactly 3 options for a Reel. Each option has a hook (the
first line, under 140 characters), an angle (one line: the take the reel makes),
a topic (a few words), and a message (one canon argument). The 3 topics must
differ. Never repeat the source post's hook or any recent hook you are given.
Hooks follow the rules above; no return promises, no hype.
`.trim();

export function recreateSystemPrompt(): string {
  const rules = between(IDEAS_PROMPT, "## What makes an idea good here", "## Ranking and dedupe");
  return [
    "You help Miguel Graf repeat what works. Given one of his Instagram posts and what is known about why it did well, you write 3 options for a new Reel.",
    CONTENT_POSITIONING.trim(),
    rules,
    OPTION_RULES,
  ].join("\n\n");
}

const CAPTION_CHARS = 600;

function modeRule(mode: RecreateMode, s: RecreateSource): string {
  const keep = `Keep the hook type ${s.hook_type || "as it is"} and the post style ${s.post_style || "as it is"}`;
  if (mode === "adjacent") {
    return `${keep}. Move to a canon message other than ${s.message || "none"}, one per option, and name it in each option's message. Choose 3 different topics.`;
  }
  if (blankOrNone(s.message)) {
    return `${keep}. The topic is free. Choose 3 different topics; each message may be any canon message or none.`;
  }
  return `${keep} and the message ${s.message}. Choose 3 different topics under that message.`;
}

export function renderRecreateTurn(a: {
  mode: RecreateMode;
  source: RecreateSource;
  insights: WinnerInsights;
  winnerHooks: string[];
  recentHooks: string[];
}): string {
  const s = a.source;
  const hookText = [s.hook_spoken, s.hook_onscreen].filter(Boolean);
  const lines: string[] = [
    `Mode: ${MODE_LABEL[a.mode]}`,
    modeRule(a.mode, s),
    "",
    "## The source post",
    `Media type: ${s.media_type}. Hook type: ${s.hook_type || "unknown"}. Post style: ${s.post_style || "unknown"}. Message: ${s.message || "none"}. CTA: ${s.cta_type || "none"}.`,
    hookText.length > 0 ? `Hook: ${[...new Set(hookText)].join(" / ")}` : "This post has no hook text; read the caption for its hook.",
    `Caption: ${s.caption.slice(0, CAPTION_CHARS)}`,
    ...(s.figures.length > 0 ? ["", "How it did:", ...s.figures.map((f) => `- ${f}`)] : []),
  ];
  if (a.insights.state === "ok") {
    lines.push("", "What it shares with Miguel's best posts:", ...a.insights.shared.map((x) => `- ${x}`));
    if (a.insights.message) lines.push(`- ${a.insights.message}`);
    if (a.insights.lacks) lines.push(`- ${a.insights.lacks}`);
  }
  if (a.winnerHooks.length > 0) lines.push("", "Hooks of his best posts:", ...a.winnerHooks.map((h) => `- ${h}`));
  if (a.recentHooks.length > 0) lines.push("", "Recent hooks to avoid repeating:", ...a.recentHooks.map((h) => `- ${h}`));
  lines.push("", "Return exactly 3 options by calling the tool.");
  return lines.join("\n");
}

/** Provenance is the source post, so this app-only schema extends the shared idea schema and the shared contract stays as it is. */
export const recreatedIdeaSchema = ingestIdeaSchema
  .omit({ source_ref: true, from_hook_backlog: true })
  .extend({ source_post_id: z.string().uuid() });
export type RecreatedIdea = z.infer<typeof recreatedIdeaSchema>;

export function recreatedIdea(
  o: RecreateOption,
  source: { id: string; hook_type: string; pillar: string },
  today: string
): RecreatedIdea {
  return recreatedIdeaSchema.parse({
    format: "reel",
    title: o.angle.slice(0, 200),
    hook: o.hook,
    why_it_stops: `Topic: ${o.topic}`,
    hook_type: (HOOK_TYPES as readonly string[]).includes(source.hook_type) ? source.hook_type : "",
    pillar: source.pillar,
    score: 1,
    batch_date: today,
    source_post_id: source.id,
  });
}
