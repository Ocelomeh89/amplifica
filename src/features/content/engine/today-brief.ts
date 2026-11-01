import { z } from "zod";
import { HELD_STILL, VARIABLE_LABEL, valueLabel, type Control, type Test } from "./experiments";
import { CONTENT_POSITIONING, IDEAS_PROMPT } from "./prompts/ideas";
import { CANON_MESSAGES, between } from "./recreate";
import { ingestIdeaSchema } from "./schema";
import { HOOK_TYPES, MESSAGES } from "./tags";

// Slice 5: the day's briefs. Pure: the Claude call and the database live in data/.
// A brief is a hook, 3 to 5 lines on what to say, and the message it argues.

export const BRIEF_TOOL_NAME = "record_briefs";
export const HOOK_MAX = 140;
export const SAY_MIN = 3;
export const SAY_MAX = 5;

export type BriefOut = { slot: number; title: string; hook: string; say: string[]; message: string };

const briefSchema = z.object({
  slot: z.number().int().min(1).max(3),
  title: z.string().trim().min(1).max(200),
  hook: z.string().trim().min(1).max(HOOK_MAX),
  say: z.array(z.string().trim().min(1)).min(SAY_MIN).max(SAY_MAX),
  message: z.enum(MESSAGES),
});

/** Exactly one brief per requested slot; `fixedMessages` pins the message for a slot that tests it. */
export function briefOutputSchema(slots: number[], fixedMessages: Record<number, string> = {}) {
  return z.object({ briefs: z.array(briefSchema) }).superRefine((v, ctx) => {
    const got = v.briefs.map((b) => b.slot).sort((a, b) => a - b);
    const want = [...slots].sort((a, b) => a - b);
    if (got.length !== want.length || got.some((s, i) => s !== want[i])) {
      ctx.addIssue({ code: "custom", message: `Expected one brief for each of slots ${want.join(", ")}.` });
    }
    v.briefs.forEach((b, i) => {
      const fixed = fixedMessages[b.slot];
      if (fixed !== undefined && b.message !== fixed) {
        ctx.addIssue({ code: "custom", path: ["briefs", i, "message"], message: `Slot ${b.slot} must argue the message ${fixed}.` });
      }
    });
  });
}

export function briefToolSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      briefs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slot: { type: "integer", description: "The slot number this brief answers." },
            title: { type: "string", description: "A short working title for the Reel." },
            hook: { type: "string", description: `The first line the audience sees or hears, under ${HOOK_MAX} characters.` },
            say: { type: "array", items: { type: "string" }, description: `${SAY_MIN} to ${SAY_MAX} short lines, beat by beat.` },
            message: { type: "string", enum: [...MESSAGES], description: "The canon argument this Reel makes." },
          },
          required: ["slot", "title", "hook", "say", "message"],
        },
      },
    },
    required: ["briefs"],
  };
}

const BRIEF_RULES = `
## What you return

Call the tool with one brief for each slot you are given. Each brief has a title, a
hook (the first line, under ${HOOK_MAX} characters), ${SAY_MIN} to ${SAY_MAX} lines on what to say, and a message
(one canon argument). Write the lines for the form in the slot's recipe: spoken beats
when Miguel is on camera, on-screen cards when it is words over footage, an animation
or a screen recording. Change only the variable the slot tests; every other recipe
choice stays as given. Never repeat a recent hook or one of his best hooks. Hooks
follow the rules above; no return promises, no hype.

## Competitor posts

Some slots carry another creator's popular post. Never reuse its hook wording or script:
answer it, do not restate it. A rebuttal opens on the belief and Miguel's counter, in his
canon where one fits. A format test describes the format concretely enough to film: the
shots, the on-screen text and the pacing.
`.trim();

export function briefSystemPrompt(): string {
  const rules = between(IDEAS_PROMPT, "## What makes an idea good here", "## Ranking and dedupe");
  return [
    "You write Miguel Graf's morning briefs. Each brief is one Instagram Reel that tests exactly one choice against the recipe that already works for him.",
    CONTENT_POSITIONING.trim(),
    rules,
    CANON_MESSAGES,
    BRIEF_RULES,
  ].join("\n\n");
}

export type CompetitorInput = { username: string; caption: string; hookText: string; pushesBelief: string | null; formatNote: string | null };

export type BriefSlotInput = {
  slot: number;
  test: Test;
  held: Control;
  idea: { title: string; hook: string; pillar: string } | null;
  moment: string;
  competitor?: CompetitorInput;
};

const testLineFor = (s: BriefSlotInput): string => {
  if (s.test.variable === "topic") return "The test: a topic the last 90 days have not covered.";
  if (s.test.variable === "source") {
    return s.test.value === "competitor-rebuttal"
      ? "The test: their topic, answered with Miguel's rebuttal of the belief it pushes, instead of his own topic."
      : "The test: their topic, told with Miguel's own take, instead of his own topic.";
  }
  const from = s.competitor ? ` from @${s.competitor.username}` : "";
  return `The test: ${VARIABLE_LABEL[s.test.variable]}: ${valueLabel(s.test.value)}${from}${s.test.control ? ` instead of ${valueLabel(s.test.control)}` : ""}.`;
};

const heldLine = (held: Control, test: Test): string =>
  HELD_STILL.filter((v) => v !== test.variable)
    .map((v) => `${VARIABLE_LABEL[v]}: ${valueLabel(held[v])}`)
    .join("; ");

export function renderBriefTurn(a: { slots: BriefSlotInput[]; winnerHooks: string[]; recentHooks: string[] }): string {
  const lines: string[] = [];
  for (const s of a.slots) {
    lines.push(`## Slot ${s.slot}`, testLineFor(s), `Held still: ${heldLine(s.held, s.test)}.`);
    if (s.competitor) {
      const c = s.competitor;
      lines.push(`Their post by @${c.username} (do not reuse its wording):`, `"${c.caption.trim()}"`);
      if (c.hookText) lines.push(`Their hook: "${c.hookText}"`);
      if (c.pushesBelief) lines.push(`It pushes: ${c.pushesBelief}`);
      if (c.formatNote) lines.push(`Their format (copy the format, not the words): ${c.formatNote}`);
    }
    if (s.moment) {
      lines.push(`Moment: ${s.moment}`, "Build the Reel around this moment from Miguel's day.");
    } else if (s.idea) {
      lines.push(`Idea: ${s.idea.title}`, `Current hook: ${s.idea.hook}`, `Pillar: ${s.idea.pillar || "none"}`);
      lines.push(
        s.test.variable === "message"
          ? `The message is the test: argue ${s.test.value} and rewrite the idea's angle to fit it.`
          : "Keep the idea's topic and pick the canon message it already argues."
      );
    } else if (s.competitor) {
      lines.push("Build the Reel on their topic and pick the canon message Miguel's answer argues.");
    }
    lines.push("");
  }
  if (a.winnerHooks.length > 0) lines.push("Hooks of his best posts:", ...a.winnerHooks.map((h) => `- ${h}`), "");
  if (a.recentHooks.length > 0) lines.push("Recent hooks to avoid repeating:", ...a.recentHooks.map((h) => `- ${h}`), "");
  lines.push(`Return one brief for each slot (${a.slots.map((s) => s.slot).join(", ")}) by calling the tool.`);
  return lines.join("\n");
}

const hookTypeFor = (test: Test, held: Control): string => {
  const v = test.variable === "hook_type" ? test.value : held.hook_type;
  return (HOOK_TYPES as readonly string[]).includes(v) ? v : "";
};

/** The update that turns a claimed Inbox idea into the brief. The old hook stays in hook_alt. */
export function briefIdeaPatch(b: BriefOut, test: Test, held: Control, oldHook: string) {
  return {
    hook: b.hook,
    hook_alt: oldHook,
    hook_type: hookTypeFor(test, held),
    title: b.title,
    outline: b.say.map((beat) => ({ beat })),
    status: "queued" as const,
    score: 1 as const,
  };
}

/** Provenance is the moment's `manual` source, so this app-only schema extends the shared idea schema and the ingest contract stays as it is. */
export const momentIdeaSchema = ingestIdeaSchema
  .omit({ source_ref: true, from_hook_backlog: true })
  .extend({ source_id: z.string().uuid() });
export type MomentIdea = z.infer<typeof momentIdeaSchema>;

export function momentIdea(b: BriefOut, test: Test, held: Control, sourceId: string, today: string): MomentIdea {
  return momentIdeaSchema.parse({
    format: "reel",
    title: b.title,
    hook: b.hook,
    hook_type: hookTypeFor(test, held),
    outline: b.say.map((beat) => ({ beat })),
    score: 1,
    batch_date: today,
    source_id: sourceId,
  });
}

/** The recipe the post is made with: the control with the tested value swapped in, plus the idea's message and topic. `control` remembers what the test replaced, for the card. */
export function recipeFor(test: Test, held: Control, message: string, topic: string): Record<string, string> {
  const recipe: Record<string, string> = { ...held };
  if ((HELD_STILL as readonly string[]).includes(test.variable)) recipe[test.variable] = test.value;
  return { ...recipe, message, topic, control: test.control };
}

/** Why a competitor brief was picked, for the card. */
export function competitorReason(c: { username: string; multiple: number; thin: boolean; pushesBelief: string | null }, test: Test): string {
  const parts = [`From @${c.username}: ${c.multiple.toFixed(1)}× their typical views.`];
  if (test.variable === "source") {
    if (c.pushesBelief) parts.push(`Pushes "${c.pushesBelief}".`);
  } else {
    parts.push(`Tests their ${VARIABLE_LABEL[test.variable].toLowerCase()}.`);
  }
  if (c.thin) parts.push("Thin baseline.");
  return parts.join(" ");
}
