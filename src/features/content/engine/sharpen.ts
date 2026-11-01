import { z } from "zod";
import { CONTENT_POSITIONING, IDEAS_PROMPT } from "./prompts/ideas";
import { CANON_MESSAGES, between } from "./recreate";
import { HOOK_TYPES, type HookType } from "./tags";

// Sharpen: an unfinished idea becomes 3 rewrites aimed at what Miguel calls usable. Pure:
// the Claude call and the database live in data/.

/** What Miguel says an idea he would film this week has. */
export const SHARP_MARKS = "a specific hook that challenges a belief, with a clear angle, clear numbers and an opinion";
export const SHARPEN_TOOL_NAME = "record_rewrites";
export const HOOK_MAX = 140;
export const OUTLINE_MIN = 3;
export const OUTLINE_MAX = 6;

export type SharpenIdea = {
  title: string;
  hook: string;
  belief_attacked: string;
  value_to_listener: string;
  why_it_stops: string;
  outline: string[];
  pillar: string;
  format: string;
};

export type SharpenOption = {
  title: string;
  hook: string;
  hook_type: HookType;
  belief_attacked: string;
  value_to_listener: string;
  why_it_stops: string;
  outline: string[];
  what_changed: string;
};

const text = (max: number) => z.string().trim().min(1).max(max);

const optionSchema = z.object({
  title: text(160),
  hook: text(HOOK_MAX),
  hook_type: z.enum(HOOK_TYPES),
  belief_attacked: text(400),
  value_to_listener: text(400),
  why_it_stops: text(400),
  outline: z.array(text(300)).min(OUTLINE_MIN).max(OUTLINE_MAX),
  what_changed: text(160),
});

export const sharpenOutputSchema = z.object({ options: z.array(optionSchema).length(3) });

export function sharpenToolSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      options: {
        type: "array",
        description: "Exactly 3 rewrites of the idea, each a different way to sharpen it.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "A short working title; the same subject as the idea." },
            hook: { type: "string", description: `The first line the audience sees or hears, under ${HOOK_MAX} characters.` },
            hook_type: { type: "string", enum: [...HOOK_TYPES], description: "The kind of hook." },
            belief_attacked: { type: "string", description: "The common belief this idea challenges." },
            value_to_listener: { type: "string", description: "What the listener gets, with the number if there is one." },
            why_it_stops: { type: "string", description: "Why someone stops scrolling." },
            outline: { type: "array", items: { type: "string" }, description: `${OUTLINE_MIN} to ${OUTLINE_MAX} short beats.` },
            what_changed: { type: "string", description: "One line: what is sharper than before." },
          },
          required: ["title", "hook", "hook_type", "belief_attacked", "value_to_listener", "why_it_stops", "outline", "what_changed"],
        },
      },
    },
    required: ["options"],
  };
}

const SHARPEN_RULES = `
## What you do

Miguel has an idea that is unfinished: something is there, but it is not fully usable. You
rewrite it three different ways. A usable idea has ${SHARP_MARKS}. Aim every rewrite at all
four marks, and fix what Miguel says is off first.

Keep the idea's topic and format. This is the same idea, sharper; it is not a new idea. Name
only numbers the idea or his positioning supports; do not invent statistics. Hooks follow the
rules above: no return promises, no hype. Each rewrite says in one line what is sharper than
before. Make the three rewrites different from each other: different hook types where you can.
`.trim();

export function sharpenSystemPrompt(rules: string[]): string {
  const ideaRules = between(IDEAS_PROMPT, "## What makes an idea good here", "## Ranking and dedupe");
  const parts = [
    "You sharpen Miguel Graf's content ideas.",
    CONTENT_POSITIONING.trim(),
    ideaRules,
    CANON_MESSAGES,
    SHARPEN_RULES,
  ];
  if (rules.length > 0) parts.push(["## Miguel's approved rules", ...rules.map((r) => `- ${r}`)].join("\n"));
  return parts.join("\n\n");
}

export function renderSharpenTurn(a: { idea: SharpenIdea; chips: string[]; text: string }): string {
  const i = a.idea;
  const lines = [
    `Idea: ${i.title}`,
    `Current hook: ${i.hook}`,
    `Format: ${i.format}; pillar: ${i.pillar || "none"}`,
    `Belief it attacks: ${i.belief_attacked || "(none)"}`,
    `Listener gets: ${i.value_to_listener || "(none)"}`,
    `Why it stops the scroll: ${i.why_it_stops || "(none)"}`,
    "Outline:",
    ...i.outline.map((b, n) => `${n + 1}. ${b}`),
    "",
  ];
  if (a.chips.length > 0) lines.push(`What is off: ${a.chips.join("; ")}`);
  if (a.text.trim()) lines.push(`Miguel adds: ${a.text.trim()}`);
  lines.push("", "Return the 3 rewrites by calling the tool.");
  return lines.join("\n");
}

/** The update that turns the idea into the picked rewrite. The old hook stays in hook_alt. */
export function sharpenIdeaPatch(o: SharpenOption, oldHook: string) {
  return {
    title: o.title,
    hook: o.hook,
    hook_alt: oldHook,
    hook_type: o.hook_type,
    belief_attacked: o.belief_attacked,
    value_to_listener: o.value_to_listener,
    why_it_stops: o.why_it_stops,
    outline: o.outline.map((beat) => ({ beat })),
  };
}
