import type { Format } from "./types";
import { BANNED_VOCABULARY } from "./prompts/humanize";

// Brand and AI-slop lint over a draft. Pure. The server runs it when a draft is
// stored; the result rides with the draft row and the Obsidian file's callout.

export type LintLevel = "block" | "warn";
export type LintHit = { level: LintLevel; rule: string; excerpt: string };

export const CALCULATOR_URL = "amplificawealth.com/calculator";
const REEL_MAX_WORDS = 150;
const STORY_MAX_SLIDES = 5;

/** `hint` is a phrase the prompts must contain; prompts/drafting.test.ts enforces it. */
export const LINT_RULES = [
  { id: "guarantee", level: "block", hint: "guarantee" },
  { id: "low-risk", level: "block", hint: "low risk" },
  { id: "risk-free", level: "block", hint: "risk-free" },
  { id: "return-promise", level: "block", hint: "you will earn" },
  { id: "episode-numbering", level: "block", hint: "Part 2 of 5" },
  { id: "reel-length", level: "block", hint: "150 words" },
  { id: "story-length", level: "block", hint: "5 slides" },
  { id: "newsletter-cta", level: "block", hint: CALCULATOR_URL },
  { id: "leverage", level: "warn", hint: "leverage" },
  { id: "banned-vocab", level: "warn", hint: "tapestry" },
  { id: "negative-parallelism", level: "warn", hint: "This isn't X. This is Y" },
  { id: "em-dash", level: "warn", hint: "em dash" },
  { id: "colon-reveal", level: "warn", hint: "colon reveal" },
  { id: "engagement-bait", level: "warn", hint: "Let that sink in" },
] as const satisfies readonly { id: string; level: LintLevel; hint: string }[];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const VOCAB_RE = new RegExp(`\\b(?:${BANNED_VOCABULARY.map(escapeRe).join("|")})(?:s|d|es|ed|ing)?\\b`, "gi");

type Pattern = { id: string; level: LintLevel; re: RegExp; unquoted?: boolean; distinct?: boolean };

const PATTERNS: Pattern[] = [
  { id: "guarantee", level: "block", re: /\bguarantee(?:s|d)?\b/gi },
  { id: "low-risk", level: "block", re: /\blow[- ]risk\b/gi },
  { id: "risk-free", level: "block", re: /\brisk[- ]free\b/gi },
  { id: "return-promise", level: "block", re: /\byou(?:'ll| will) (?:earn\b|(?:make|get|receive)\s+(?:\$|\d))|\bwill return \d/gi },
  { id: "episode-numbering", level: "block", re: /\b(?:part \d+ of \d+|episode \d+)\b/gi },
  { id: "leverage", level: "warn", re: /\bleverag(?:e|es|ed|ing)\b/gi, unquoted: true },
  { id: "banned-vocab", level: "warn", re: VOCAB_RE, unquoted: true, distinct: true },
  {
    id: "negative-parallelism",
    level: "warn",
    re: /\bthis isn['’]t [^.!?\n]{1,80}[.!?]\s+this is\b|\byou don['’]t need [^.!?\n]{1,80}[.!?]\s+you need\b|(?:^|[.!?]\s+)not [^.!?\n]{1,80}\.\s+[A-Za-z]/gim,
  },
  { id: "em-dash", level: "warn", re: /—/g },
  { id: "colon-reveal", level: "warn", re: /\b(?:here['’]s the (?:thing|catch|truth|kicker)|the (?:truth|catch|result|answer|problem)) ?:/gi },
  { id: "engagement-bait", level: "warn", re: /let that sink in|read that again|sit with that|let that land|\bfull stop\b/gi },
];

/** Text under `## name` up to the next `## ` heading, or null when the heading is absent. */
export function section(body: string, name: string): string | null {
  const lines = body.split("\n");
  const heading = new RegExp(`^##\\s+${escapeRe(name)}\\s*$`, "i");
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s+/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 30);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

/** Quoted text replaced by spaces of the same length, so match indexes still point into the original. */
const blankQuoted = (s: string) => s.replace(/"[^"]*"|“[^”]*”/g, (m) => " ".repeat(m.length));

export function lintDraft(format: Format, body: string): LintHit[] {
  const hits: LintHit[] = [];
  const unquoted = blankQuoted(body);

  for (const p of PATTERNS) {
    const haystack = p.unquoted ? unquoted : body;
    const seen = new Set<string>();
    for (const m of haystack.matchAll(new RegExp(p.re.source, p.re.flags))) {
      const found = m[0];
      if (p.distinct) {
        const key = found.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const excerpt = p.distinct ? found : excerptAround(body, m.index ?? 0, found.length);
      hits.push({ level: p.level, rule: p.id, excerpt });
    }
  }

  if (format === "reel") {
    const n = wordCount(section(body, "Script") ?? body);
    if (n > REEL_MAX_WORDS) hits.push({ level: "block", rule: "reel-length", excerpt: `${n} words in the script (max ${REEL_MAX_WORDS})` });
  }
  if (format === "story") {
    const slides = (section(body, "Slides") ?? "").split("\n").filter((l) => /^\s*(?:[-*]|\d+[.)])\s+\S/.test(l)).length;
    if (slides > STORY_MAX_SLIDES) hits.push({ level: "block", rule: "story-length", excerpt: `${slides} slides (max ${STORY_MAX_SLIDES})` });
  }
  if (format === "newsletter") {
    const hasCalculator = /calculator/i.test(body);
    const hasUrl = body.toLowerCase().includes(CALCULATOR_URL);
    if (!hasCalculator || !hasUrl) {
      hits.push({ level: "block", rule: "newsletter-cta", excerpt: `needs one calculator instruction with ${CALCULATOR_URL} as visible text` });
    }
  }

  return [...hits.filter((h) => h.level === "block"), ...hits.filter((h) => h.level === "warn")];
}
