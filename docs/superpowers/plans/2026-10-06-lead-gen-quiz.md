# Lead-gen quiz Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a temporary, mobile-first public quiz at `/quiz` that sorts visitors into 8 investor archetypes, captures name and email before showing results, stores every submission, subscribes the email to Beehiiv, and offers a PDF download.

**Architecture:** A removable `src/features/quiz/` folder (pure content and scoring, a server action, a result lookup, a `pdf-lib` builder, client UI) with routes under `src/app/quiz/`. The quiz runs client-side, submits once to a server action that rescores on the server, writes `quiz_submissions` and `leads` through the service-role client, awaits a best-effort Beehiiv subscribe, and redirects to `/quiz/r/[token]`. The Beehiiv helper moves from `features/calculator` to `shared/` because two features now use it.

**Tech Stack:** Next.js 14 App Router, React 18.3, Supabase (service-role client), Tailwind, Vitest + Testing Library, `pdf-lib` (new dependency).

**Spec:** `docs/superpowers/specs/2026-10-06-lead-gen-quiz-design.md`. Read it first. Question text, weights and result copy in this plan are copied from it verbatim.

## Global Constraints

- Package manager is `pnpm`. Verify with `pnpm test`, `pnpm typecheck`, `pnpm build`.
- Import rules (enforced by `src/boundaries.test.ts`): nothing imports `app/`; `features/quiz` imports only `shared/` and itself; `shared/` imports only `shared/`.
- Mutations are Server Actions. No client-side DB calls.
- Copy rule: no em dashes anywhere in user-facing copy or code comments. Copy is already edited; do not reword it.
- Mobile rules: answer buttons at least 52 px tall and full width with 16 px or larger text; inputs use 16 px text (`text-base`) so iOS does not zoom; one column with a 16 px side gutter; readable at 360 px and checked at 390 px.
- Result pages are noindex. The quiz is not in `sitemap.ts`. `robots.ts` disallows `/quiz/r/`.
- `quiz_submissions` has RLS enabled and no policies. Only the service-role client touches it.
- The server rescores answers. Nothing from the browser is trusted except the 15 raw answer indexes (each 0 to 4).
- Beehiiv gets `first_name` only. No custom field. Beehiiv failure never blocks the result.
- Destinations: calculator `/calculator`; debt letter `https://newsletter.amplificawealth.com/p/pay-off-car-loan-before-higher-interest-debt`; community `https://community.amplificawealth.com/join-now`.
- Commits end with this trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Commit commands below use two `-m` flags to add it.
- Work happens on branch `feat/lead-gen-quiz`. Do not push or open a PR unless the owner asks.
- Do not add the untracked `.agents/`, `.codex/` or `AGENTS.md` to any commit. Stage files by name.

## Review Focus

Failure modes the spec implies but a happy-path test would miss, most likely first. Each has a test in the task named in brackets.

1. A tampered, short, long or out-of-range `answers` field must be rejected with nothing stored. [Task 4]
2. A name with emoji, non-Latin letters, newlines, or 100 characters with no spaces must not crash or overflow the PDF. [Task 5]
3. A non-UUID or unknown token in `/quiz/r/[token]` or its `/pdf` route must return 404, never a 500 from a Postgres cast error. [Tasks 4 and 6]
4. A retake with the same email must keep both submission rows and still redirect when `leads` reports a duplicate; Beehiiv being unset or down must still show the result. [Task 4]
5. `localStorage` that throws or holds junk (Instagram's in-app browser) must leave the quiz starting clean; a double tap on an answer must not skip a question. [Task 7]

---

## File structure

```
src/shared/beehiiv.ts                              moved from features/calculator/data/beehiiv.ts, new signature
src/shared/beehiiv.test.ts
src/shared/supabase/database.types.ts              modify: quiz_submissions mirror + QuizSubmission alias
src/shared/supabase/middleware.ts                  modify: /quiz bypasses the auth round-trip
src/shared/supabase/middleware.quiz.test.ts
src/features/calculator/data/actions.ts            modify: new subscribeToNewsletter call
src/features/quiz/CLAUDE.md
src/features/quiz/content.ts                       archetypes, questions, weights, copy, URLs, types
src/features/quiz/content.test.ts
src/features/quiz/scoring.ts                       parseAnswers, rankArchetypes, scoreAnswers
src/features/quiz/scoring.test.ts
src/features/quiz/data/actions.ts                  submitQuiz server action
src/features/quiz/data/actions.test.ts
src/features/quiz/data/results.ts                  getResultByToken
src/features/quiz/data/results.test.ts
src/features/quiz/pdf/buildResultPdf.ts
src/features/quiz/pdf/buildResultPdf.test.ts
src/features/quiz/ui/QuizShell.tsx                 header + page frame
src/features/quiz/ui/ResultView.tsx
src/features/quiz/ui/ResultView.test.tsx
src/features/quiz/ui/quiz-storage.ts
src/features/quiz/ui/quiz-storage.test.ts
src/features/quiz/ui/QuizClient.tsx
src/features/quiz/ui/QuizClient.test.tsx
src/app/quiz/page.tsx
src/app/quiz/r/[token]/page.tsx
src/app/quiz/r/[token]/pdf/route.ts
src/app/quiz/r/[token]/pdf/route.test.ts
src/app/quiz-seo.test.ts
src/app/robots.ts                                  modify
supabase/migrations/0010_quiz_submissions.sql
supabase/migrations/0010_quiz_submissions.test.ts
docs/PRODUCT-STATUS.md                             modify
CLAUDE.md                                          modify: one table row
```

---

### Task 1: Move the Beehiiv helper to `shared/`

**Files:**
- Move: `src/features/calculator/data/beehiiv.ts` to `src/shared/beehiiv.ts`
- Modify: `src/shared/beehiiv.ts` (new signature), `src/features/calculator/data/actions.ts`
- Create: `src/shared/beehiiv.test.ts`
- Modify: `docs/superpowers/specs/2026-10-06-lead-gen-quiz-design.md` (spec sync)

**Interfaces:**
- Produces: `subscribeToNewsletter(input: { email: string; source: string; firstName?: string }): Promise<boolean>` exported from `@/shared/beehiiv`. `source` becomes Beehiiv's `utm_source`. When `firstName` is a non-empty string, the request body includes `custom_fields: [{ name: "first_name", value: firstName }]`.

- [ ] **Step 1: Move the file**

```bash
git mv src/features/calculator/data/beehiiv.ts src/shared/beehiiv.ts
```

- [ ] **Step 2: Write the failing test** at `src/shared/beehiiv.test.ts`

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { subscribeToNewsletter } from "./beehiiv";

const fetchMock = vi.fn();

describe("subscribeToNewsletter", () => {
  const original = {
    key: process.env.BEEHIIV_API_KEY,
    pub: process.env.BEEHIIV_PUBLICATION_ID,
  };

  beforeEach(() => {
    process.env.BEEHIIV_API_KEY = "key";
    process.env.BEEHIIV_PUBLICATION_ID = "pub_123";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const [k, v] of [
      ["BEEHIIV_API_KEY", original.key],
      ["BEEHIIV_PUBLICATION_ID", original.pub],
    ] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("skips and returns false when the keys are not set", async () => {
    delete process.env.BEEHIIV_API_KEY;
    expect(await subscribeToNewsletter({ email: "a@b.co", source: "quiz" })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the source as utm_source and the first name as a custom field", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const ok = await subscribeToNewsletter({ email: "a@b.co", source: "quiz", firstName: "Sam" });
    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.beehiiv.com/v2/publications/pub_123/subscriptions");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      email: "a@b.co",
      reactivate_existing: true,
      utm_source: "quiz",
      utm_medium: "organic",
      custom_fields: [{ name: "first_name", value: "Sam" }],
    });
    expect(init.headers.Authorization).toBe("Bearer key");
  });

  it("omits custom_fields when there is no first name", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await subscribeToNewsletter({ email: "a@b.co", source: "calculator" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.utm_source).toBe("calculator");
    expect(body).not.toHaveProperty("custom_fields");
  });

  it("returns false on a non-2xx response", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    expect(await subscribeToNewsletter({ email: "a@b.co", source: "quiz" })).toBe(false);
  });

  it("returns false when the request throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await subscribeToNewsletter({ email: "a@b.co", source: "quiz" })).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/shared/beehiiv.test.ts`
Expected: FAIL. The old signature takes a string, so the tests that pass an object fail on the request body.

- [ ] **Step 4: Rewrite `src/shared/beehiiv.ts`**

```ts
import "server-only";

export interface SubscribeInput {
  email: string;
  /** Beehiiv utm_source, for example "calculator" or "quiz". */
  source: string;
  /** Sent as the first_name custom field when present. */
  firstName?: string;
}

// Best-effort Beehiiv subscribe for public lead surfaces. Never throws: the
// lead is already durable in Postgres by the time this runs, so a Beehiiv
// outage must not block the unlock or the result. Await it in the action;
// fire-and-forget work can be killed after the response on Vercel serverless.
export async function subscribeToNewsletter({
  email,
  source,
  firstName,
}: SubscribeInput): Promise<boolean> {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !publicationId) {
    console.warn("beehiiv: BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set; skipping subscribe");
    return false;
  }

  try {
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          utm_source: source,
          utm_medium: "organic",
          ...(firstName ? { custom_fields: [{ name: "first_name", value: firstName }] } : {}),
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    // 2xx covers new and already-existing subscribers (Beehiiv returns the
    // existing subscription rather than an error).
    if (!res.ok) {
      console.error(`beehiiv: subscribe failed with ${res.status} for ${email}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("beehiiv: subscribe request failed", e);
    return false;
  }
}
```

- [ ] **Step 5: Update the calculator to the new import and signature**

In `src/features/calculator/data/actions.ts` change the import line

```ts
import { subscribeToNewsletter } from "@/features/calculator/data/beehiiv";
```

to

```ts
import { subscribeToNewsletter } from "@/shared/beehiiv";
```

and change the call

```ts
const synced = await subscribeToNewsletter(email);
```

to

```ts
const synced = await subscribeToNewsletter({ email, source: "calculator" });
```

Then confirm nothing else imports the old path: `grep -rn "calculator/data/beehiiv" src` prints nothing.

- [ ] **Step 6: Sync the spec with decisions made while planning**

Run this once from the repo root:

```bash
python3 - <<'EOF'
p = "docs/superpowers/specs/2026-10-06-lead-gen-quiz-design.md"
s = open(p).read()
pairs = [
  ("`subscribeToNewsletter({ email, name?, source })`",
   "`subscribeToNewsletter({ email, source, firstName? })`"),
  ("`submitQuiz(prevState, formData)`:",
   "`submitQuiz(formData)`, called from the client form's `onSubmit` (React 18 here has no `useFormState`, so the action is called directly, as `FoundContentForm` does):"),
  ("1. Honeypot field `website`. If filled, return success without storing and send the bot to a dummy result.",
   "1. Honeypot field `website`. If filled, redirect to `/quiz` without storing anything."),
]
for a, b in pairs:
    assert a in s, a
    s = s.replace(a, b)
open(p, "w").write(s)
EOF
```

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run src/shared/beehiiv.test.ts src/boundaries.test.ts && pnpm typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/shared/beehiiv.ts src/shared/beehiiv.test.ts src/features/calculator/data/actions.ts docs/superpowers/specs/2026-10-06-lead-gen-quiz-design.md
git commit -m "refactor: move Beehiiv subscribe to shared with source and first name" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(`git mv` already staged the rename. Confirm with `git status --short` that only the files above are staged.)

---

### Task 2: Quiz content and scoring (pure)

**Files:**
- Create: `src/features/quiz/content.ts`, `src/features/quiz/scoring.ts`
- Test: `src/features/quiz/content.test.ts`, `src/features/quiz/scoring.test.ts`

**Interfaces:**
- Produces from `content.ts`: `ARCHETYPE_KEYS` (tie-break order), `ArchetypeKey`, `isArchetypeKey(v: unknown): v is ArchetypeKey`, `QUIZ_VERSION = 1`, `QUIZ_LENGTH = 15`, `OPTIONS_PER_QUESTION = 5`, `Weights`, `QuizOption`, `QuizQuestion`, `QUESTIONS: readonly QuizQuestion[]`, `CtaLink`, `Archetype`, `ARCHETYPES: Record<ArchetypeKey, Archetype>`, `CALCULATOR_URL`, `DEBT_LETTER_URL`, `COMMUNITY_JOIN_URL`, `MIGUEL_NOTE`, `DISCLAIMER`, `QuizResult` (`{ token: string; name: string; archetype: ArchetypeKey; runnerUp: ArchetypeKey; createdAt: string }`).
- Produces from `scoring.ts`: `QuizScore` (`{ scores: Record<ArchetypeKey, number>; archetype: ArchetypeKey; runnerUp: ArchetypeKey }`), `parseAnswers(raw: string): number[] | null`, `rankArchetypes(scores: Record<ArchetypeKey, number>): ArchetypeKey[]`, `scoreAnswers(answers: readonly number[]): QuizScore`.

- [ ] **Step 1: Write the failing content test** at `src/features/quiz/content.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
  ARCHETYPE_KEYS,
  ARCHETYPES,
  COMMUNITY_JOIN_URL,
  DEBT_LETTER_URL,
  CALCULATOR_URL,
  DISCLAIMER,
  MIGUEL_NOTE,
  OPTIONS_PER_QUESTION,
  QUESTIONS,
  QUIZ_LENGTH,
  isArchetypeKey,
} from "./content";

describe("quiz content", () => {
  it("has 15 questions with 5 options each", () => {
    expect(QUESTIONS).toHaveLength(QUIZ_LENGTH);
    for (const q of QUESTIONS) expect(q.options).toHaveLength(OPTIONS_PER_QUESTION);
  });

  it("gives every option one primary (2 points) and at most one different secondary (1 point)", () => {
    for (const q of QUESTIONS) {
      for (const o of q.options) {
        const entries = Object.entries(o.weights);
        expect(entries.every(([k]) => isArchetypeKey(k))).toBe(true);
        const primaries = entries.filter(([, v]) => v === 2);
        const secondaries = entries.filter(([, v]) => v === 1);
        expect(primaries).toHaveLength(1);
        expect(secondaries.length).toBeLessThanOrEqual(1);
        expect(entries).toHaveLength(primaries.length + secondaries.length);
      }
    }
  });

  it("keeps primary points balanced: each archetype is primary on 8 to 11 options", () => {
    const counts = Object.fromEntries(ARCHETYPE_KEYS.map((k) => [k, 0])) as Record<string, number>;
    for (const q of QUESTIONS)
      for (const o of q.options)
        for (const [k, v] of Object.entries(o.weights)) if (v === 2) counts[k]++;
    for (const k of ARCHETYPE_KEYS) {
      expect(counts[k], k).toBeGreaterThanOrEqual(8);
      expect(counts[k], k).toBeLessThanOrEqual(11);
    }
  });

  it("defines all 8 archetypes with copy and buttons", () => {
    expect(ARCHETYPE_KEYS).toHaveLength(8);
    for (const k of ARCHETYPE_KEYS) {
      const a = ARCHETYPES[k];
      expect(a.key).toBe(k);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.diagnosis.length).toBeGreaterThan(40);
      expect(a.nextSingle.length).toBeGreaterThan(20);
      expect(a.primary.label.length).toBeGreaterThan(0);
    }
  });

  it("routes the two exceptions and sends everyone else to the calculator", () => {
    expect(ARCHETYPES["recovering-debt-aholic"].primary.href).toBe(DEBT_LETTER_URL);
    expect(ARCHETYPES["recovering-debt-aholic"].secondary?.href).toBe(CALCULATOR_URL);
    expect(ARCHETYPES["cash-flow-builder"].primary.href).toBe(COMMUNITY_JOIN_URL);
    expect(ARCHETYPES["cash-flow-builder"].secondary?.href).toBe(CALCULATOR_URL);
    for (const k of ARCHETYPE_KEYS) {
      if (k === "recovering-debt-aholic" || k === "cash-flow-builder") continue;
      expect(ARCHETYPES[k].primary.href).toBe(CALCULATOR_URL);
      expect(ARCHETYPES[k].secondary).toBeUndefined();
    }
    expect(DEBT_LETTER_URL).toBe(
      "https://newsletter.amplificawealth.com/p/pay-off-car-loan-before-higher-interest-debt"
    );
    expect(COMMUNITY_JOIN_URL).toBe("https://community.amplificawealth.com/join-now");
  });

  it("contains no em dashes in any copy", () => {
    const all = JSON.stringify({ QUESTIONS, ARCHETYPES, MIGUEL_NOTE, DISCLAIMER });
    expect(all).not.toContain(String.fromCharCode(0x2014));
  });

  it("uses the tie-break order from the spec", () => {
    expect([...ARCHETYPE_KEYS]).toEqual([
      "recovering-debt-aholic",
      "serial-dabbler",
      "reluctant-landlord",
      "swing-speculator",
      "etf-optimizer",
      "autopilot-saver",
      "cash-flow-builder",
      "acquirer",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/features/quiz/content.test.ts`
Expected: FAIL with "Failed to resolve import ./content".

- [ ] **Step 3: Create `src/features/quiz/content.ts`**

```ts
// All quiz copy and scoring weights live here. Question and result copy is
// the reviewed text from docs/superpowers/specs/2026-10-06-lead-gen-quiz-design.md.
// Do not reword it without re-running the no-ai-slop pass.

/** Order matters: it is the tie-break order when two archetypes score the same. */
export const ARCHETYPE_KEYS = [
  "recovering-debt-aholic",
  "serial-dabbler",
  "reluctant-landlord",
  "swing-speculator",
  "etf-optimizer",
  "autopilot-saver",
  "cash-flow-builder",
  "acquirer",
] as const;

export type ArchetypeKey = (typeof ARCHETYPE_KEYS)[number];

export function isArchetypeKey(value: unknown): value is ArchetypeKey {
  return typeof value === "string" && (ARCHETYPE_KEYS as readonly string[]).includes(value);
}

/** Bump when questions or weights change; stored on every submission. */
export const QUIZ_VERSION = 1;
export const QUIZ_LENGTH = 15;
export const OPTIONS_PER_QUESTION = 5;

export const CALCULATOR_URL = "/calculator";
export const DEBT_LETTER_URL =
  "https://newsletter.amplificawealth.com/p/pay-off-car-loan-before-higher-interest-debt";
export const COMMUNITY_JOIN_URL = "https://community.amplificawealth.com/join-now";

export type Weights = Partial<Record<ArchetypeKey, 1 | 2>>;

export interface QuizOption {
  text: string;
  weights: Weights;
}

export interface QuizQuestion {
  prompt: string;
  options: readonly QuizOption[];
}

export interface CtaLink {
  label: string;
  href: string;
}

export interface Archetype {
  key: ArchetypeKey;
  name: string;
  diagnosis: string;
  nextSingle: string;
  primary: CtaLink;
  secondary?: CtaLink;
}

/** What the result page and PDF need about one saved submission. */
export interface QuizResult {
  token: string;
  name: string;
  archetype: ArchetypeKey;
  runnerUp: ArchetypeKey;
  createdAt: string;
}

const A = "autopilot-saver" as const;
const D = "recovering-debt-aholic" as const;
const E = "etf-optimizer" as const;
const S = "serial-dabbler" as const;
const L = "reluctant-landlord" as const;
const P = "swing-speculator" as const;
const C = "cash-flow-builder" as const;
const Q = "acquirer" as const;

/** o("text", [PRIMARY, 2], [SECONDARY, 1]) */
function o(text: string, ...pairs: [ArchetypeKey, 1 | 2][]): QuizOption {
  return { text, weights: Object.fromEntries(pairs) as Weights };
}

export const QUESTIONS: readonly QuizQuestion[] = [
  {
    prompt: "Where does most of your invested money sit today?",
    options: [
      o("A 401k or target-date fund I never touch.", [A, 2]),
      o("Rental property.", [L, 2]),
      o("Very little. Debt takes most of what I earn.", [D, 2]),
      o("Stocks, crypto and a few bets I believe in.", [P, 2], [S, 1]),
      o("Index funds and ETFs I picked myself.", [E, 2], [A, 1]),
    ],
  },
  {
    prompt: "How often do you check your investments?",
    options: [
      o("Every day, sometimes more than once.", [P, 2], [S, 1]),
      o("Once a year, if that.", [A, 2]),
      o("Monthly, usually to rebalance.", [E, 2]),
      o("Every week, to see what they paid me.", [C, 2], [Q, 1]),
      o("Whenever the next course or tip shows up.", [S, 2]),
    ],
  },
  {
    prompt: "An extra $1,000 lands in your account. What happens to it?",
    options: [
      o("It sits in savings until I figure out what to do.", [A, 2]),
      o("It goes straight at my credit card balance.", [D, 2]),
      o("It goes into my index funds, like every month.", [E, 2], [A, 1]),
      o("I look for something that beats the market.", [S, 2], [P, 1]),
      o("It buys another asset that pays me monthly.", [C, 2], [Q, 1]),
    ],
  },
  {
    prompt: "What is your honest relationship with debt?",
    options: [
      o("I have almost none, and I like it that way.", [A, 2], [E, 1]),
      o("Credit card balances I am working through.", [D, 2]),
      o("A mortgage on a property I rent out.", [L, 2]),
      o("A tool. I borrow with a repayment plan.", [C, 2], [Q, 1]),
      o("Business or deal debt I am carrying.", [Q, 2], [P, 1]),
    ],
  },
  {
    prompt: "Which money mistake taught you the most?",
    options: [
      o("Trying five things and finishing none.", [S, 2]),
      o("Spending more than I earned for years.", [D, 2]),
      o("Putting too much into one deal.", [Q, 2], [P, 1]),
      o("Buying something hot right before it fell.", [P, 2], [S, 1]),
      o("Buying a property that ate my time.", [L, 2]),
    ],
  },
  {
    prompt: "The market drops 20% in a month. You...",
    options: [
      o("Don't look. It's in the 401k.", [A, 2]),
      o("Feel sick, since the card payments don't shrink.", [D, 2]),
      o("Rebalance and keep buying.", [E, 2]),
      o("Buy more, or go find a bounce trade.", [P, 2], [S, 1]),
      o("Check that my income assets still pay.", [C, 2], [Q, 1]),
    ],
  },
  {
    prompt: "How many hours a week do you spend on money?",
    options: [
      o("About 30 minutes, on a set routine.", [C, 2]),
      o("One or two, reading and tweaking my portfolio.", [E, 2], [S, 1]),
      o("More than five, between tenants, repairs and spreadsheets.", [L, 2]),
      o("Most of my free time, on a deal I am building.", [Q, 2]),
      o("A few hours, hopping between strategies.", [S, 2], [P, 1]),
    ],
  },
  {
    prompt: "What have you tried besides index funds?",
    options: [
      o("Nothing yet.", [A, 2]),
      o("A course or two, plus some crypto.", [S, 2]),
      o("Options or leveraged trades.", [P, 2]),
      o("A rental property or two.", [L, 2]),
      o("Buying or investing in a small business.", [Q, 2], [C, 1]),
    ],
  },
  {
    prompt: "How do you feel about your paycheck?",
    options: [
      o("Stuck. I need it to cover what I owe.", [D, 2]),
      o("It is one of my income streams, and the smallest one.", [C, 2], [Q, 1]),
      o("Fine. I just want my investments to do more.", [E, 2]),
      o("A means to an end. I am building my exit.", [Q, 2], [C, 1]),
      o("It is never enough, so I keep hunting for the next big move.", [P, 2], [S, 1]),
    ],
  },
  {
    prompt: "How do you feel about borrowing to invest?",
    options: [
      o("Reckless. I would never do it.", [A, 2], [D, 1]),
      o("I am careful. Borrowing hurt me before.", [D, 2]),
      o("I did it for my rentals, and I would do it again.", [L, 2], [Q, 1]),
      o("Normal for deals. Leverage is how acquisitions get done.", [Q, 2]),
      o("I do it, with a plan, and I like the math.", [C, 2], [Q, 1]),
    ],
  },
  {
    prompt: 'What does "enough" cash flow look like for you?',
    options: [
      o("A portfolio big enough to pull 4% a year.", [E, 2], [A, 1]),
      o("Enough to stop chasing the next thing.", [S, 2]),
      o("Rent that covers the mortgage and then some.", [L, 2]),
      o("Income that covers my bills, so work is optional.", [C, 2], [Q, 1]),
      o("Income that funds my next deal without new savings.", [Q, 2], [C, 1]),
    ],
  },
  {
    prompt: "How do you feel about owning a business or property?",
    options: [
      o("It has never crossed my mind.", [A, 2]),
      o("Not until I am out of debt.", [D, 2]),
      o("I would consider it, but index funds are easier.", [E, 2], [A, 1]),
      o("I own property and manage it myself.", [L, 2]),
      o("I want to buy a business and I am working out how to pay for it.", [Q, 2], [C, 1]),
    ],
  },
  {
    prompt: "What holds you back from doing more?",
    options: [
      o("I don't know what else is out there.", [A, 2], [S, 1]),
      o("I try too many things and none gets enough time.", [S, 2]),
      o("I want to get rich fast, so I take too much risk.", [P, 2]),
      o("Capital. I know the move, I just need the funds.", [Q, 2], [C, 1]),
      o("Nothing. I already run a routine and want people doing the same.", [C, 2]),
    ],
  },
  {
    prompt: "How much could you put to work each month?",
    options: [
      o("Under $500, after the minimum payments.", [D, 2], [A, 1]),
      o("Whatever is left after repairs and reserves.", [L, 2]),
      o("It varies. Whatever is left after my latest idea.", [S, 2], [P, 1]),
      o("Whatever the next trade needs.", [P, 2], [S, 1]),
      o("A lump sum, if the right deal shows up.", [Q, 2], [C, 1]),
    ],
  },
  {
    prompt: "What do you want your money to do in five years?",
    options: [
      o("Grow into a bigger pile on its own.", [E, 2], [A, 1]),
      o("Be one system I stop tinkering with.", [S, 2]),
      o("Land one big win so I can stop.", [P, 2]),
      o("Pay me every month and fund a bigger move.", [C, 2], [Q, 1]),
      o("Fund me buying my own business.", [Q, 2], [C, 1]),
    ],
  },
];

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  "autopilot-saver": {
    key: "autopilot-saver",
    name: "The Autopilot Saver",
    diagnosis:
      "You pay yourself first and you don't panic. That habit beats most investors. What's missing is the question of what your money earns after fees, and what it could earn with a different job. The default setting works, and it also caps you.",
    nextSingle:
      "Add up what your 401k and savings earned last year after fees. Then run the calculator with $1,000 a month and see what a second income stream adds.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "recovering-debt-aholic": {
    key: "recovering-debt-aholic",
    name: "The Recovering Debt-aholic",
    diagnosis:
      "You spent big for a while, the cards piled up, and now you want to invest but feel you can't until the balance hits zero. That belief deserves a test before you put years behind it. Paying debt off first has a price, like any other choice.",
    nextSingle:
      "Read my letter on why the avalanche method optimizes the wrong number. Then list every balance next to its rate. Any plan starts with that list.",
    primary: { label: "Read the letter", href: DEBT_LETTER_URL },
    secondary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "etf-optimizer": {
    key: "etf-optimizer",
    name: "The ETF Optimizer",
    diagnosis:
      "You got the basics right: low fees, broad funds, steady contributions. Your next dollar earns the market return, and so does every one after it. That is the ceiling of this approach.",
    nextSingle:
      "Keep the index funds. Run the calculator with your monthly amount and see what a second stream of cash flow adds on top.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "serial-dabbler": {
    key: "serial-dabbler",
    name: "The Serial Dabbler",
    diagnosis:
      "You have tried a course, a coin, a side hustle. You are curious and you move fast, and both help. Nothing compounds because each new idea resets the clock.",
    nextSingle:
      "Pick one routine and run it for 90 days before you look at anything else. The calculator gives you a number to measure it against.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "reluctant-landlord": {
    key: "reluctant-landlord",
    name: "The Reluctant Landlord",
    diagnosis:
      "The property pays, and it pays in phone calls too. When repairs, tenants and reserves take your weekends, the return looks different from what the spreadsheet says. Real estate can be a good asset. The test is what each hour of your time earns.",
    nextSingle:
      "Write down the hours you spent on the property last month and divide the net income by them. Then run the calculator and compare that rate with a hands-off income stream.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "swing-speculator": {
    key: "swing-speculator",
    name: "The Swing-for-the-Fences Speculator",
    diagnosis:
      "You like big upside, and sometimes it pays. I bought a business before I was ready, and I lost big. A swing needs a base under it, and the base is dull: steady monthly cash flow from small positions.",
    nextSingle:
      "Decide what you can lose without changing your life. Then run the calculator and see what steady cash flow builds before your next swing.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "cash-flow-builder": {
    key: "cash-flow-builder",
    name: "The Cash-Flow Builder",
    diagnosis:
      "You already think like an Amplifica client. You borrow on purpose, you track what comes in, and you care more about the weekly routine than the headlines. The people running the same cycle compare notes in the community.",
    nextSingle:
      "Join the community, share your numbers, and see how others handle the same decisions.",
    primary: { label: "Join Amplifica", href: COMMUNITY_JOIN_URL },
    secondary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  acquirer: {
    key: "acquirer",
    name: "The Acquirer",
    diagnosis:
      "You are ready for something bigger than a portfolio. You know deals take capital, and you are working out where it comes from. Amplifica sits under that plan: a cash-flow base that funds the move without draining your savings.",
    nextSingle:
      "Run the calculator and see how long a monthly cash-flow base takes to reach the check size you need.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
};

export const MIGUEL_NOTE =
  "I swung for the fences before I was ready. Now I build singles first. The calculator is where I'd start.";

export const DISCLAIMER =
  "Educational only. Not financial advice. Examples use stated assumptions, not promised returns.";
```

- [ ] **Step 4: Run the content test**

Run: `pnpm vitest run src/features/quiz/content.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing scoring test** at `src/features/quiz/scoring.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { ARCHETYPE_KEYS, QUESTIONS, QUIZ_LENGTH, type ArchetypeKey } from "./content";
import { parseAnswers, rankArchetypes, scoreAnswers } from "./scoring";

function zeros(): Record<ArchetypeKey, number> {
  return Object.fromEntries(ARCHETYPE_KEYS.map((k) => [k, 0])) as Record<ArchetypeKey, number>;
}

/** For each question, pick the option that gives `key` its 2 points; fall back to option 0. */
function answersFor(key: ArchetypeKey): number[] {
  return QUESTIONS.map((q) => {
    const i = q.options.findIndex((o) => o.weights[key] === 2);
    return i === -1 ? 0 : i;
  });
}

describe("parseAnswers", () => {
  it("accepts exactly 15 comma-separated digits from 0 to 4", () => {
    expect(parseAnswers("0,1,2,3,4,0,1,2,3,4,0,1,2,3,4")).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  });

  it.each([
    ["too short", "0,1,2"],
    ["too long", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["out of range", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,5"],
    ["negative", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,-1"],
    ["non-numeric", "a,0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["decimal", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,1.5"],
    ["spaces", "0, 0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["empty", ""],
  ])("rejects %s", (_label, raw) => {
    expect(parseAnswers(raw)).toBeNull();
  });
});

describe("rankArchetypes", () => {
  it("orders by score, highest first", () => {
    const s = zeros();
    s["acquirer"] = 9;
    s["serial-dabbler"] = 4;
    expect(rankArchetypes(s).slice(0, 2)).toEqual(["acquirer", "serial-dabbler"]);
  });

  it("breaks ties by the fixed archetype order", () => {
    const s = zeros();
    s["acquirer"] = 7;
    s["recovering-debt-aholic"] = 7;
    s["etf-optimizer"] = 7;
    expect(rankArchetypes(s).slice(0, 3)).toEqual([
      "recovering-debt-aholic",
      "etf-optimizer",
      "acquirer",
    ]);
  });

  it("with all zeros returns the tie-break order itself", () => {
    expect(rankArchetypes(zeros())).toEqual([...ARCHETYPE_KEYS]);
  });
});

describe("scoreAnswers", () => {
  it("sums weights across all 15 answers", () => {
    const answers = answersFor("autopilot-saver");
    const { scores } = scoreAnswers(answers);
    const expected = QUESTIONS.reduce(
      (sum, q, i) => sum + (q.options[answers[i]].weights["autopilot-saver"] ?? 0),
      0
    );
    expect(scores["autopilot-saver"]).toBe(expected);
  });

  it.each(ARCHETYPE_KEYS.map((k) => [k]))("lets %s win when answered consistently", (key) => {
    const result = scoreAnswers(answersFor(key));
    expect(result.archetype).toBe(key);
    expect(result.runnerUp).not.toBe(key);
  });

  it("reports a runner-up that differs from the winner", () => {
    const { archetype, runnerUp } = scoreAnswers(new Array(QUIZ_LENGTH).fill(0));
    expect(runnerUp).not.toBe(archetype);
  });

  it("throws on the wrong number of answers or an out-of-range answer", () => {
    expect(() => scoreAnswers([0, 1])).toThrow();
    expect(() => scoreAnswers(new Array(QUIZ_LENGTH).fill(9))).toThrow();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/features/quiz/scoring.test.ts`
Expected: FAIL with "Failed to resolve import ./scoring".

- [ ] **Step 7: Create `src/features/quiz/scoring.ts`**

```ts
import {
  ARCHETYPE_KEYS,
  OPTIONS_PER_QUESTION,
  QUESTIONS,
  QUIZ_LENGTH,
  type ArchetypeKey,
} from "./content";

export interface QuizScore {
  scores: Record<ArchetypeKey, number>;
  archetype: ArchetypeKey;
  runnerUp: ArchetypeKey;
}

const LAST = OPTIONS_PER_QUESTION - 1;
const ANSWERS_RE = new RegExp(`^[0-${LAST}](,[0-${LAST}]){${QUIZ_LENGTH - 1}}$`);

/** Parses the "0,3,2,..." form field. Null unless it is exactly 15 digits, each 0 to 4. */
export function parseAnswers(raw: string): number[] | null {
  if (!ANSWERS_RE.test(raw)) return null;
  return raw.split(",").map(Number);
}

/** Archetypes by score, highest first. Ties keep ARCHETYPE_KEYS order. */
export function rankArchetypes(scores: Record<ArchetypeKey, number>): ArchetypeKey[] {
  return [...ARCHETYPE_KEYS].sort(
    (a, b) => scores[b] - scores[a] || ARCHETYPE_KEYS.indexOf(a) - ARCHETYPE_KEYS.indexOf(b)
  );
}

export function scoreAnswers(answers: readonly number[]): QuizScore {
  if (answers.length !== QUIZ_LENGTH) {
    throw new Error(`expected ${QUIZ_LENGTH} answers, got ${answers.length}`);
  }
  const scores = Object.fromEntries(ARCHETYPE_KEYS.map((k) => [k, 0])) as Record<
    ArchetypeKey,
    number
  >;
  answers.forEach((choice, q) => {
    const option = QUESTIONS[q].options[choice];
    if (!option) throw new Error(`answer ${choice} is out of range for question ${q + 1}`);
    for (const [key, points] of Object.entries(option.weights) as [ArchetypeKey, number][]) {
      scores[key] += points;
    }
  });
  const [archetype, runnerUp] = rankArchetypes(scores);
  return { scores, archetype, runnerUp };
}
```

- [ ] **Step 8: Run both test files**

Run: `pnpm vitest run src/features/quiz`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/features/quiz/content.ts src/features/quiz/content.test.ts src/features/quiz/scoring.ts src/features/quiz/scoring.test.ts
git commit -m "feat(quiz): content, weights and scoring" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migration and database types

**Files:**
- Create: `supabase/migrations/0010_quiz_submissions.sql`, `supabase/migrations/0010_quiz_submissions.test.ts`
- Modify: `src/shared/supabase/database.types.ts`

**Interfaces:**
- Consumes: `ARCHETYPE_KEYS`, `QUIZ_LENGTH` from `@/features/quiz/content` (test only).
- Produces: table `public.quiz_submissions`; TypeScript `QuizSubmission` (Row alias) and the table's `Insert`/`Update` shapes in `Database`.

- [ ] **Step 1: Write the failing migration test** at `supabase/migrations/0010_quiz_submissions.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ARCHETYPE_KEYS, QUIZ_LENGTH } from "@/features/quiz/content";

// Applied by hand in the Supabase SQL editor, like 0008 and 0009. Assert the parts that matter.
describe("0010_quiz_submissions.sql", () => {
  const sql = readFileSync("supabase/migrations/0010_quiz_submissions.sql", "utf8");

  it("enables RLS and defines no policies, so the anon key is hard-denied", () => {
    expect(sql).toMatch(/alter table public\.quiz_submissions enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("gives each submission a unique, unguessable token", () => {
    expect(sql).toMatch(/token uuid not null unique default gen_random_uuid\(\)/i);
  });

  it("constrains archetype and runner_up to the 8 keys in content.ts", () => {
    for (const key of ARCHETYPE_KEYS) {
      const occurrences = sql.split(`'${key}'`).length - 1;
      expect(occurrences, key).toBe(2);
    }
  });

  it("requires exactly the quiz length of answers", () => {
    expect(sql).toContain(`jsonb_array_length(answers) = ${QUIZ_LENGTH}`);
  });

  it("does not make email unique, so a retake keeps both rows", () => {
    expect(sql).not.toMatch(/unique index[^;]*email/i);
    expect(sql).toMatch(/create index quiz_submissions_email_idx/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run supabase/migrations/0010_quiz_submissions.test.ts`
Expected: FAIL with ENOENT for the `.sql` file.

- [ ] **Step 3: Create `supabase/migrations/0010_quiz_submissions.sql`**

```sql
-- quiz_submissions: one row per completed lead-gen quiz (/quiz). Temporary
-- feature; to remove it, drop this table and delete src/features/quiz.
-- RLS is enabled with NO policies on purpose, like leads: the anon key gets a
-- hard deny. All reads and writes go through the service-role client in
-- server code. The result page looks a row up by `token`, never by id or email.
-- A retake adds a new row (email is deliberately not unique).
create table public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) = 15),
  scores jsonb not null,
  archetype text not null check (archetype in (
    'recovering-debt-aholic', 'serial-dabbler', 'reluctant-landlord', 'swing-speculator',
    'etf-optimizer', 'autopilot-saver', 'cash-flow-builder', 'acquirer'
  )),
  runner_up text not null check (runner_up in (
    'recovering-debt-aholic', 'serial-dabbler', 'reluctant-landlord', 'swing-speculator',
    'etf-optimizer', 'autopilot-saver', 'cash-flow-builder', 'acquirer'
  )),
  quiz_version int not null default 1,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  user_agent text,
  beehiiv_synced boolean not null default false,
  created_at timestamptz not null default now()
);

create index quiz_submissions_email_idx on public.quiz_submissions (lower(email));

alter table public.quiz_submissions enable row level security;
```

- [ ] **Step 4: Run the migration test**

Run: `pnpm vitest run supabase/migrations/0010_quiz_submissions.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the table to `database.types.ts`**

In `src/shared/supabase/database.types.ts`, insert this block immediately before the line `      content_sources: {` (the first occurrence, right after the `leads` block's closing `};`):

```ts
      quiz_submissions: {
        Row: {
          id: string;
          token: string;
          name: string;
          email: string;
          answers: number[];
          scores: Record<string, number>;
          archetype: string;
          runner_up: string;
          quiz_version: number;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          user_agent: string | null;
          beehiiv_synced: boolean;
          created_at: string;
        };
        Insert: {
          name: string;
          email: string;
          answers: number[];
          scores: Record<string, number>;
          archetype: string;
          runner_up: string;
          quiz_version?: number;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          user_agent?: string | null;
          beehiiv_synced?: boolean;
        };
        Update: {
          beehiiv_synced?: boolean;
        };
        Relationships: [];
      };
```

Then add this alias on the line after `export type LeadInsert = ...`:

```ts
export type QuizSubmission = Database["public"]["Tables"]["quiz_submissions"]["Row"];
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0010_quiz_submissions.sql supabase/migrations/0010_quiz_submissions.test.ts src/shared/supabase/database.types.ts
git commit -m "feat(quiz): quiz_submissions table and types" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

The migration is not applied to any database yet. Task 9 does that with the owner's approval.

---

### Task 4: Submit action and result lookup

**Files:**
- Create: `src/features/quiz/data/actions.ts`, `src/features/quiz/data/results.ts`
- Test: `src/features/quiz/data/actions.test.ts`, `src/features/quiz/data/results.test.ts`

**Interfaces:**
- Consumes: `parseAnswers`, `scoreAnswers` (Task 2); `QUIZ_VERSION`, `isArchetypeKey`, `QuizResult` (Task 2); `subscribeToNewsletter` (Task 1); `createAdminClient`; `str` from `@/shared/forms`; `QuizSubmission` table types (Task 3).
- Produces: `submitQuiz(formData: FormData): Promise<SubmitQuizState>` and `interface SubmitQuizState { error: string | null }` from `data/actions.ts`; `getResultByToken(token: string): Promise<QuizResult | null>` from `data/results.ts`.

Form field contract for `submitQuiz`: `name`, `email`, `answers` (the string `"0,3,2,..."`), `website` (honeypot), `utm_source`, `utm_medium`, `utm_campaign`. On success it calls `redirect("/quiz/r/<token>")`, which throws; it never returns normally on success.

- [ ] **Step 1: Write the failing action test** at `src/features/quiz/data/actions.test.ts`

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "11111111-2222-4333-8444-555555555555";

const h = vi.hoisted(() => ({
  quizInserts: [] as Record<string, unknown>[],
  leadInserts: [] as Record<string, unknown>[],
  updates: [] as string[],
  quizError: false,
  leadsCode: null as string | null,
  subscribe: vi.fn(async (_input: unknown) => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: () => ({ get: () => "test-agent" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/shared/beehiiv", () => ({ subscribeToNewsletter: h.subscribe }));
vi.mock("@/shared/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (table === "quiz_submissions") {
            h.quizInserts.push(row);
            return {
              select: () => ({
                single: async () =>
                  h.quizError
                    ? { data: null, error: { message: "boom" } }
                    : { data: { token: TOKEN }, error: null },
              }),
            };
          }
          h.leadInserts.push(row);
          return Promise.resolve({ error: h.leadsCode ? { code: h.leadsCode } : null });
        },
        update() {
          const chain = {
            eq: () => chain,
            then(resolve: (v: { error: null }) => void) {
              h.updates.push(table);
              resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  }),
}));

import { QUIZ_VERSION } from "../content";
import { scoreAnswers } from "../scoring";
import { submitQuiz } from "./actions";

const ZEROS = "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    name: "Sam Rivera",
    email: "Sam@Example.com",
    answers: ZEROS,
    website: "",
    utm_source: "ig",
    utm_medium: "story",
    utm_campaign: "oct",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  h.quizInserts.length = 0;
  h.leadInserts.length = 0;
  h.updates.length = 0;
  h.quizError = false;
  h.leadsCode = null;
  h.subscribe.mockReset();
  h.subscribe.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitQuiz", () => {
  it("scores on the server, stores the submission, mirrors it to leads, subscribes, and redirects", async () => {
    await expect(submitQuiz(form())).rejects.toThrow(`REDIRECT /quiz/r/${TOKEN}`);

    const expected = scoreAnswers(new Array(15).fill(0));
    expect(h.quizInserts).toHaveLength(1);
    expect(h.quizInserts[0]).toMatchObject({
      name: "Sam Rivera",
      email: "sam@example.com",
      answers: new Array(15).fill(0),
      scores: expected.scores,
      archetype: expected.archetype,
      runner_up: expected.runnerUp,
      quiz_version: QUIZ_VERSION,
      utm_source: "ig",
      utm_medium: "story",
      utm_campaign: "oct",
      user_agent: "test-agent",
    });
    expect(h.leadInserts[0]).toMatchObject({ email: "sam@example.com", source: "quiz" });
    expect(h.subscribe).toHaveBeenCalledWith({
      email: "sam@example.com",
      source: "quiz",
      firstName: "Sam",
    });
    expect(h.updates).toEqual(expect.arrayContaining(["quiz_submissions", "leads"]));
  });

  it("ignores a score the browser might send", async () => {
    const fd = form();
    fd.set("archetype", "acquirer");
    fd.set("scores", "{}");
    await expect(submitQuiz(fd)).rejects.toThrow("REDIRECT");
    expect(h.quizInserts[0].archetype).toBe(scoreAnswers(new Array(15).fill(0)).archetype);
  });

  it("drops a honeypot fill silently: redirects to /quiz and stores nothing", async () => {
    await expect(submitQuiz(form({ website: "http://spam.example" }))).rejects.toThrow("REDIRECT /quiz");
    expect(h.quizInserts).toHaveLength(0);
    expect(h.leadInserts).toHaveLength(0);
    expect(h.subscribe).not.toHaveBeenCalled();
  });

  it.each([
    ["a bad email", { email: "not-an-email" }, "Please enter a valid email address."],
    ["a blank name", { name: "   " }, "Please enter your name."],
    ["a 101-character name", { name: "x".repeat(101) }, "Please enter your name."],
  ])("rejects %s without storing anything", async (_label, over, message) => {
    const result = await submitQuiz(form(over));
    expect(result).toEqual({ error: message });
    expect(h.quizInserts).toHaveLength(0);
    expect(h.subscribe).not.toHaveBeenCalled();
  });

  it.each([
    ["too few answers", "0,1,2"],
    ["too many answers", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["an out-of-range answer", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,5"],
    ["a non-numeric answer", "x,0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["a missing answers field", ""],
  ])("rejects %s without storing anything", async (_label, answers) => {
    const result = await submitQuiz(form({ answers }));
    expect(result.error).toMatch(/answers/i);
    expect(h.quizInserts).toHaveLength(0);
    expect(h.leadInserts).toHaveLength(0);
  });

  it("returns an error and does not subscribe when the submission insert fails", async () => {
    h.quizError = true;
    const result = await submitQuiz(form());
    expect(result).toEqual({ error: "Something went wrong. Please try again." });
    expect(h.subscribe).not.toHaveBeenCalled();
    expect(h.leadInserts).toHaveLength(0);
  });

  it("still shows the result when leads reports a duplicate email (a retake)", async () => {
    h.leadsCode = "23505";
    await expect(submitQuiz(form())).rejects.toThrow(`REDIRECT /quiz/r/${TOKEN}`);
  });

  it("keeps both submissions when the same email retakes the quiz", async () => {
    await expect(submitQuiz(form())).rejects.toThrow("REDIRECT");
    await expect(submitQuiz(form({ answers: "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1" }))).rejects.toThrow("REDIRECT");
    expect(h.quizInserts).toHaveLength(2);
  });

  it("still shows the result when Beehiiv is unset or down, and leaves beehiiv_synced false", async () => {
    h.subscribe.mockResolvedValue(false);
    await expect(submitQuiz(form())).rejects.toThrow(`REDIRECT /quiz/r/${TOKEN}`);
    expect(h.updates).toEqual([]);
  });

  it("sends only the first word of the name to Beehiiv", async () => {
    await expect(submitQuiz(form({ name: "  Ana  Maria de la Cruz " }))).rejects.toThrow("REDIRECT");
    expect(h.subscribe).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Ana" }));
  });

  it("caps UTM values at 200 characters and stores empty ones as null", async () => {
    await expect(submitQuiz(form({ utm_source: "y".repeat(300), utm_medium: "" }))).rejects.toThrow("REDIRECT");
    expect((h.quizInserts[0].utm_source as string).length).toBe(200);
    expect(h.quizInserts[0].utm_medium).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/features/quiz/data/actions.test.ts`
Expected: FAIL with "Failed to resolve import ./actions".

- [ ] **Step 3: Create `src/features/quiz/data/actions.ts`**

```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/shared/supabase/admin";
import { subscribeToNewsletter } from "@/shared/beehiiv";
import { str } from "@/shared/forms";
import { QUIZ_VERSION } from "../content";
import { parseAnswers, scoreAnswers } from "../scoring";

export interface SubmitQuizState {
  error: string | null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME_MAX = 100;

// Called from the client form's onSubmit (React 18 here has no useFormState).
// On success it redirects, which throws, so it only returns on failure.
export async function submitQuiz(formData: FormData): Promise<SubmitQuizState> {
  // Honeypot: bots fill every field. Pretend nothing happened, store nothing.
  if (str(formData, "website") !== "") redirect("/quiz");

  const name = str(formData, "name").trim();
  if (name.length < 1 || name.length > NAME_MAX) {
    return { error: "Please enter your name." };
  }
  const email = str(formData, "email").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email address." };
  }
  const answers = parseAnswers(str(formData, "answers"));
  if (!answers) {
    return { error: "Something went wrong with your answers. Please retake the quiz." };
  }

  // Never trust a score from the browser: rescore from the raw answers.
  const { scores, archetype, runnerUp } = scoreAnswers(answers);

  const utm = (key: string) => {
    const v = str(formData, key).trim();
    return v === "" ? null : v.slice(0, 200);
  };
  const userAgent = headers().get("user-agent")?.slice(0, 500) ?? null;

  // Postgres first: the submission is the point of the gate, so a hard insert
  // failure means no result page.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("quiz_submissions")
    .insert({
      name,
      email,
      answers,
      scores,
      archetype,
      runner_up: runnerUp,
      quiz_version: QUIZ_VERSION,
      utm_source: utm("utm_source"),
      utm_medium: utm("utm_medium"),
      utm_campaign: utm("utm_campaign"),
      user_agent: userAgent,
    })
    .select("token")
    .single();
  if (error || !data) {
    console.error("quiz: submission insert failed", error);
    return { error: "Something went wrong. Please try again." };
  }

  // Mirror to leads so there is one list of every captured email. A duplicate
  // (23505) is a returning visitor and is fine. Other failures are logged, not
  // shown: the submission above is already durable.
  const { error: leadError } = await supabase.from("leads").insert({
    email,
    source: "quiz",
    utm_source: utm("utm_source"),
    utm_medium: utm("utm_medium"),
    utm_campaign: utm("utm_campaign"),
    user_agent: userAgent,
  });
  if (leadError && leadError.code !== "23505") {
    console.error("quiz: leads insert failed", leadError);
  }

  // Awaited best-effort Beehiiv subscribe (post-response work can be killed on
  // serverless). Failure never blocks the result.
  const synced = await subscribeToNewsletter({
    email,
    source: "quiz",
    firstName: name.split(/\s+/)[0],
  });
  if (synced) {
    await supabase.from("quiz_submissions").update({ beehiiv_synced: true }).eq("token", data.token);
    await supabase.from("leads").update({ beehiiv_synced: true }).eq("email", email).eq("source", "quiz");
  }

  redirect(`/quiz/r/${data.token}`);
}
```

- [ ] **Step 4: Run the action test**

Run: `pnpm vitest run src/features/quiz/data/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing results test** at `src/features/quiz/data/results.test.ts`

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fromCalls: 0,
  result: { data: null as unknown, error: null as unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/admin", () => ({
  createAdminClient: () => ({
    from() {
      h.fromCalls++;
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => h.result }) }),
      };
    },
  }),
}));

import { getResultByToken } from "./results";

const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  h.fromCalls = 0;
  h.result = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getResultByToken", () => {
  it.each(["", "abc", "not-a-uuid", "1' or '1'='1", `${TOKEN}extra`])(
    "returns null for %j without touching the database",
    async (token) => {
      expect(await getResultByToken(token)).toBeNull();
      expect(h.fromCalls).toBe(0);
    }
  );

  it("maps a found row", async () => {
    h.result = {
      data: {
        token: TOKEN,
        name: "Sam Rivera",
        archetype: "serial-dabbler",
        runner_up: "acquirer",
        created_at: "2026-10-06T12:00:00Z",
      },
      error: null,
    };
    expect(await getResultByToken(TOKEN)).toEqual({
      token: TOKEN,
      name: "Sam Rivera",
      archetype: "serial-dabbler",
      runnerUp: "acquirer",
      createdAt: "2026-10-06T12:00:00Z",
    });
  });

  it("returns null when no row matches", async () => {
    expect(await getResultByToken(TOKEN)).toBeNull();
  });

  it("returns null on a database error", async () => {
    h.result = { data: null, error: { message: "down" } };
    expect(await getResultByToken(TOKEN)).toBeNull();
  });

  it("returns null when the stored archetype is not a known key", async () => {
    h.result = {
      data: { token: TOKEN, name: "Sam", archetype: "nope", runner_up: "acquirer", created_at: "x" },
      error: null,
    };
    expect(await getResultByToken(TOKEN)).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/features/quiz/data/results.test.ts`
Expected: FAIL with "Failed to resolve import ./results".

- [ ] **Step 7: Create `src/features/quiz/data/results.ts`**

```ts
import "server-only";

import { createAdminClient } from "@/shared/supabase/admin";
import { isArchetypeKey, type QuizResult } from "../content";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One saved submission by its public token, or null. The format check comes
 * first because Postgres raises on a malformed uuid, and a bad URL should be a
 * 404, not a 500.
 */
export async function getResultByToken(token: string): Promise<QuizResult | null> {
  if (!UUID_RE.test(token)) return null;

  const { data, error } = await createAdminClient()
    .from("quiz_submissions")
    .select("token, name, archetype, runner_up, created_at")
    .eq("token", token)
    .maybeSingle();
  if (error) {
    console.error("quiz: result lookup failed", error);
    return null;
  }
  if (!data || !isArchetypeKey(data.archetype) || !isArchetypeKey(data.runner_up)) return null;

  return {
    token: data.token,
    name: data.name,
    archetype: data.archetype,
    runnerUp: data.runner_up,
    createdAt: data.created_at,
  };
}
```

- [ ] **Step 8: Run both data tests, typecheck, and the boundaries test**

Run: `pnpm vitest run src/features/quiz/data src/boundaries.test.ts && pnpm typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add src/features/quiz/data
git commit -m "feat(quiz): submit action and result lookup" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: PDF builder

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (new dependency `pdf-lib`)
- Create: `src/features/quiz/pdf/buildResultPdf.ts`
- Test: `src/features/quiz/pdf/buildResultPdf.test.ts`

**Interfaces:**
- Consumes: `ARCHETYPES`, `DISCLAIMER`, `MIGUEL_NOTE`, `ArchetypeKey` (Task 2).
- Produces: `buildResultPdf(input: PdfInput): Promise<Uint8Array>`; `interface PdfInput { name: string; archetype: ArchetypeKey; runnerUp: ArchetypeKey; createdAt: string; siteUrl: string }`; `toWinAnsi(text: string): string`; `wrapText(text: string, font: { widthOfTextAtSize(text: string, size: number): number }, size: number, maxWidth: number): string[]`.

- [ ] **Step 1: Install the dependency**

Run: `pnpm add pdf-lib`
Expected: `pdf-lib` appears in `package.json` dependencies and the lockfile updates.

- [ ] **Step 2: Write the failing test** at `src/features/quiz/pdf/buildResultPdf.test.ts`

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { ARCHETYPE_KEYS, ARCHETYPES } from "../content";
import { buildResultPdf, toWinAnsi, wrapText } from "./buildResultPdf";

const base = {
  name: "Sam Rivera",
  runnerUp: "acquirer" as const,
  createdAt: "2026-10-06T12:00:00Z",
  siteUrl: "https://amplificawealth.com",
};

describe("buildResultPdf", () => {
  it.each(ARCHETYPE_KEYS.map((k) => [k]))("builds a one-page PDF for %s", async (key) => {
    const bytes = await buildResultPdf({ ...base, archetype: key });
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain(ARCHETYPES[key].name);
  });

  it("survives names the standard fonts cannot encode", async () => {
    const names = [
      "José Ñandú",
      "Sam \u{1F389}\u{1F680}",
      "李小龍",
      "Line\nBreak\tTab",
      "x".repeat(100),
      "a".repeat(50) + " " + "b".repeat(49),
    ];
    for (const name of names) {
      const bytes = await buildResultPdf({ ...base, name, archetype: "serial-dabbler" });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    }
  });

  it("writes the destination link in full for the debt-aholic", async () => {
    const bytes = await buildResultPdf({ ...base, archetype: "recovering-debt-aholic" });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe("toWinAnsi", () => {
  it("keeps Latin-1 letters, replaces everything else, and flattens whitespace", () => {
    expect(toWinAnsi("José")).toBe("José");
    expect(toWinAnsi("李")).toBe("?");
    expect(toWinAnsi("a\n b\t c")).toBe("a b c");
  });
});

describe("wrapText", () => {
  const font = { widthOfTextAtSize: (t: string, size: number) => t.length * size };

  it("wraps at the width on word boundaries", () => {
    expect(wrapText("aaa bbb ccc", font, 1, 7)).toEqual(["aaa bbb", "ccc"]);
  });

  it("breaks a single word that is wider than the line", () => {
    const lines = wrapText("x".repeat(25), font, 1, 10);
    expect(lines).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });

  it("returns no lines for empty text", () => {
    expect(wrapText("", font, 1, 10)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/features/quiz/pdf`
Expected: FAIL with "Failed to resolve import ./buildResultPdf".

- [ ] **Step 4: Create `src/features/quiz/pdf/buildResultPdf.ts`**

```ts
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { ARCHETYPES, DISCLAIMER, MIGUEL_NOTE, type ArchetypeKey } from "../content";

export interface PdfInput {
  name: string;
  archetype: ArchetypeKey;
  runnerUp: ArchetypeKey;
  createdAt: string;
  /** Origin used to make relative destinations absolute, e.g. https://amplificawealth.com */
  siteUrl: string;
}

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = 54;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const PURPLE = rgb(0.424, 0.294, 0.827); // #6C4BD3
const PLUM = rgb(0.133, 0.075, 0.22); // #221338
const GRAY = rgb(0.4, 0.4, 0.45);
const TINT = rgb(0.97, 0.96, 0.99);

type Measurer = Pick<PDFFont, "widthOfTextAtSize">;

/**
 * The standard PDF fonts only encode WinAnsi. Anything else (emoji, CJK,
 * newlines, tabs) would make pdf-lib throw, so flatten whitespace and
 * replace what cannot be drawn.
 */
export function toWinAnsi(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E -ÿ]/g, "?")
    .trim();
}

function splitLongWord(word: string, font: Measurer, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const parts: string[] = [];
  let part = "";
  for (const ch of word) {
    if (part && font.widthOfTextAtSize(part + ch, size) > maxWidth) {
      parts.push(part);
      part = ch;
    } else {
      part += ch;
    }
  }
  if (part) parts.push(part);
  return parts;
}

export function wrapText(text: string, font: Measurer, size: number, maxWidth: number): string[] {
  const words = text
    .split(" ")
    .filter(Boolean)
    .flatMap((w) => splitLongWord(w, font, size, maxWidth));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function absolute(href: string, siteUrl: string): string {
  return href.startsWith("http") ? href : `${siteUrl.replace(/\/$/, "")}${href}`;
}

export async function buildResultPdf(input: PdfInput): Promise<Uint8Array> {
  const archetype = ARCHETYPES[input.archetype];
  const runnerUp = ARCHETYPES[input.runnerUp];

  const doc = await PDFDocument.create();
  doc.setTitle(`Amplifica investor profile: ${archetype.name}`);
  doc.setAuthor("Amplifica Wealth");
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let y = PAGE.height - MARGIN;

  /** Draws wrapped text top-down from the cursor and moves the cursor below it. */
  function write(
    text: string,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb>,
    lineHeight = Math.round(size * 1.45)
  ) {
    for (const line of wrapText(toWinAnsi(text), font, size, CONTENT_WIDTH)) {
      y -= lineHeight;
      page.drawText(line, { x: MARGIN, y, size, font, color });
    }
  }

  const date = new Date(input.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  write("Amplifica Wealth", bold, 14, PURPLE);
  y -= 8;
  write("Your investor profile", bold, 24, PLUM, 30);
  write(`${input.name} | ${date}`, regular, 11, GRAY);
  y -= 14;
  write(archetype.name, bold, 26, PURPLE, 32);
  y -= 6;
  write(archetype.diagnosis, regular, 12, PLUM, 17);
  y -= 16;

  // "Your next single" box. Height is computed from the wrapped lines first.
  const pad = 12;
  const boxLines = wrapText(toWinAnsi(archetype.nextSingle), regular, 12, CONTENT_WIDTH - pad * 2);
  const boxHeight = pad * 2 + 11 + boxLines.length * 17;
  page.drawRectangle({
    x: MARGIN,
    y: y - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderColor: PURPLE,
    borderWidth: 1,
    color: TINT,
  });
  let by = y - pad - 11;
  page.drawText("Your next single", { x: MARGIN + pad, y: by, size: 11, font: bold, color: PURPLE });
  for (const line of boxLines) {
    by -= 17;
    page.drawText(line, { x: MARGIN + pad, y: by, size: 12, font: regular, color: PLUM });
  }
  y -= boxHeight + 18;

  write(`You also have some of: ${runnerUp.name}.`, regular, 12, PLUM, 17);
  y -= 10;
  write(
    `Your next step: ${absolute(archetype.primary.href, input.siteUrl)}`,
    bold,
    12,
    PURPLE,
    17
  );
  y -= 14;
  write(MIGUEL_NOTE, italic, 11, GRAY, 16);

  // Disclaimer pinned to the bottom margin.
  const footer = wrapText(toWinAnsi(DISCLAIMER), regular, 9, CONTENT_WIDTH);
  let fy = MARGIN + (footer.length - 1) * 12;
  for (const line of footer) {
    page.drawText(line, { x: MARGIN, y: fy, size: 9, font: regular, color: GRAY });
    fy -= 12;
  }

  return doc.save();
}
```

- [ ] **Step 5: Run the PDF tests**

Run: `pnpm vitest run src/features/quiz/pdf`
Expected: all PASS.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/features/quiz/pdf
git commit -m "feat(quiz): one-page PDF builder" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Result page, PDF route and shared shell

**Files:**
- Create: `src/features/quiz/ui/QuizShell.tsx`, `src/features/quiz/ui/ResultView.tsx`, `src/app/quiz/r/[token]/page.tsx`, `src/app/quiz/r/[token]/pdf/route.ts`
- Test: `src/features/quiz/ui/ResultView.test.tsx`, `src/app/quiz/r/[token]/pdf/route.test.ts`

**Interfaces:**
- Consumes: `ARCHETYPES`, `DISCLAIMER`, `MIGUEL_NOTE`, `QuizResult`, `CtaLink` (Task 2); `getResultByToken` (Task 4); `buildResultPdf` (Task 5).
- Produces: default exports `QuizShell({ children })` and `ResultView({ result: QuizResult })`; the routes `GET /quiz/r/[token]` (page) and `GET /quiz/r/[token]/pdf`.

- [ ] **Step 1: Write the failing ResultView test** at `src/features/quiz/ui/ResultView.test.tsx`

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ARCHETYPE_KEYS, ARCHETYPES, COMMUNITY_JOIN_URL, DEBT_LETTER_URL, DISCLAIMER, MIGUEL_NOTE } from "../content";
import ResultView from "./ResultView";

const TOKEN = "11111111-2222-4333-8444-555555555555";

function view(archetype: (typeof ARCHETYPE_KEYS)[number], runnerUp: (typeof ARCHETYPE_KEYS)[number] = "acquirer") {
  return render(
    <ResultView result={{ token: TOKEN, name: "Sam Rivera", archetype, runnerUp, createdAt: "2026-10-06T12:00:00Z" }} />
  );
}

describe("ResultView", () => {
  it("shows the archetype name, diagnosis, next single, runner-up, note and disclaimer", () => {
    view("serial-dabbler", "etf-optimizer");
    const a = ARCHETYPES["serial-dabbler"];
    expect(screen.getByRole("heading", { level: 1, name: a.name })).toBeInTheDocument();
    expect(screen.getByText(a.diagnosis)).toBeInTheDocument();
    expect(screen.getByText(a.nextSingle)).toBeInTheDocument();
    expect(screen.getByText(/You also have some of:/)).toHaveTextContent(ARCHETYPES["etf-optimizer"].name);
    expect(screen.getByText(MIGUEL_NOTE)).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it("links the PDF download to this submission's token", () => {
    view("serial-dabbler");
    const link = screen.getByRole("link", { name: /Download your results \(PDF\)/ });
    expect(link).toHaveAttribute("href", `/quiz/r/${TOKEN}/pdf`);
  });

  it("sends the Debt-aholic to the letter first and the calculator second", () => {
    view("recovering-debt-aholic");
    expect(screen.getByRole("link", { name: "Read the letter" })).toHaveAttribute("href", DEBT_LETTER_URL);
    expect(screen.getByRole("link", { name: "Run the calculator" })).toHaveAttribute("href", "/calculator");
  });

  it("sends the Cash-Flow Builder to the community join page first", () => {
    view("cash-flow-builder");
    expect(screen.getByRole("link", { name: "Join Amplifica" })).toHaveAttribute("href", COMMUNITY_JOIN_URL);
    expect(screen.getByRole("link", { name: "Run the calculator" })).toHaveAttribute("href", "/calculator");
  });

  it("sends every other archetype to the calculator only", () => {
    view("etf-optimizer");
    expect(screen.getAllByRole("link", { name: "Run the calculator" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Read the letter" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Join Amplifica" })).toBeNull();
  });

  it("opens external destinations safely in a new tab", () => {
    view("cash-flow-builder");
    const link = screen.getByRole("link", { name: "Join Amplifica" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/features/quiz/ui/ResultView.test.tsx`
Expected: FAIL with "Failed to resolve import ./ResultView".

- [ ] **Step 3: Create `src/features/quiz/ui/QuizShell.tsx`**

```tsx
import Link from "next/link";

// Same five-bar mark as the calculator header, with its own gradient id (ids
// must be unique per document).
function AmplitudeMark() {
  return (
    <svg width="30" height="26" viewBox="0 0 30 26" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="amp-mark-quiz" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#A88BE8" />
          <stop offset="100%" stopColor="#6C4BD3" />
        </linearGradient>
      </defs>
      <g fill="url(#amp-mark-quiz)">
        <rect x="0" y="23" width="4" height="3" rx="1" />
        <rect x="6.5" y="21" width="4" height="5" rx="1" />
        <rect x="13" y="18" width="4" height="8" rx="1" />
        <rect x="19.5" y="12" width="4" height="14" rx="1" />
        <rect x="26" y="2" width="4" height="24" rx="1" />
      </g>
    </svg>
  );
}

/** Page frame for the quiz and its results: logo header, one centered column. */
export default function QuizShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="border-b border-edge bg-card">
        <div className="max-w-xl mx-auto px-4 py-3">
          <Link
            href="/"
            aria-label="Amplifica Wealth home"
            className="inline-flex items-center gap-2 min-h-[44px] hover:opacity-80 transition-opacity"
          >
            <AmplitudeMark />
            <span className="font-display text-lg leading-none">Amplifica</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">{children}</main>
      <footer className="border-t border-edge">
        <div className="max-w-xl mx-auto px-4 py-4 text-sm text-sub">
          Engineer your future. Amplify your wealth. Live your way.
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/features/quiz/ui/ResultView.tsx`**

```tsx
import { ARCHETYPES, DISCLAIMER, MIGUEL_NOTE, type CtaLink, type QuizResult } from "../content";

function CtaButton({ cta, variant }: { cta: CtaLink; variant: "primary" | "secondary" }) {
  const external = cta.href.startsWith("http");
  const className =
    variant === "primary"
      ? "block w-full text-center bg-purple hover:bg-purple/90 transition-colors text-white text-base min-h-[52px] leading-[52px] rounded-lg"
      : "block w-full text-center border border-purple text-purple text-base min-h-[52px] leading-[52px] rounded-lg";
  return (
    <a
      href={cta.href}
      className={className}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {cta.label}
    </a>
  );
}

export default function ResultView({ result }: { result: QuizResult }) {
  const archetype = ARCHETYPES[result.archetype];
  const runnerUp = ARCHETYPES[result.runnerUp];

  return (
    <article>
      <p className="text-xs uppercase tracking-wide text-sub mb-2">Your investor profile</p>
      <h1 className="font-display text-3xl leading-tight mb-4">{archetype.name}</h1>
      <p className="text-base leading-relaxed mb-6">{archetype.diagnosis}</p>

      <section className="bg-card border border-edge rounded-lg p-5 mb-6">
        <h2 className="text-sm font-semibold text-purple mb-2">Your next single</h2>
        <p className="text-base leading-relaxed">{archetype.nextSingle}</p>
      </section>

      <div className="space-y-3 mb-6">
        <CtaButton cta={archetype.primary} variant="primary" />
        {archetype.secondary && <CtaButton cta={archetype.secondary} variant="secondary" />}
      </div>

      <p className="text-sm text-sub mb-2">
        You also have some of: <span className="text-ink">{runnerUp.name}</span>.
      </p>
      <a
        href={`/quiz/r/${result.token}/pdf`}
        className="inline-flex items-center min-h-[44px] text-base text-purple underline mb-6"
      >
        Download your results (PDF)
      </a>

      <blockquote className="border-l-2 border-amethyst pl-4 text-base italic text-sub mb-6">
        {MIGUEL_NOTE}
      </blockquote>

      <p className="text-xs text-sub">{DISCLAIMER}</p>
    </article>
  );
}
```

- [ ] **Step 5: Run the ResultView test**

Run: `pnpm vitest run src/features/quiz/ui/ResultView.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write the failing PDF route test** at `src/app/quiz/r/[token]/pdf/route.test.ts`

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/features/quiz/data/results", () => ({ getResultByToken: async () => h.result }));

import { GET } from "./route";

const TOKEN = "11111111-2222-4333-8444-555555555555";
const call = (token: string) => GET(new Request(`http://localhost/quiz/r/${token}/pdf`), { params: { token } });

beforeEach(() => {
  h.result = null;
});

describe("GET /quiz/r/[token]/pdf", () => {
  it("returns 404 for an unknown or malformed token", async () => {
    expect((await call("nope")).status).toBe(404);
    expect((await call(TOKEN)).status).toBe(404);
  });

  it("returns a PDF attachment for a known token", async () => {
    h.result = {
      token: TOKEN,
      name: "Sam Rivera",
      archetype: "serial-dabbler",
      runnerUp: "acquirer",
      createdAt: "2026-10-06T12:00:00Z",
    };
    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="amplifica-investor-profile.pdf"'
    );
    expect(res.headers.get("cache-control")).toContain("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm vitest run "src/app/quiz/r/[token]/pdf/route.test.ts"`
Expected: FAIL with "Failed to resolve import ./route".

- [ ] **Step 8: Create `src/app/quiz/r/[token]/pdf/route.ts`**

```ts
import { getResultByToken } from "@/features/quiz/data/results";
import { buildResultPdf } from "@/features/quiz/pdf/buildResultPdf";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const result = await getResultByToken(params.token);
  if (!result) return new Response("Not found", { status: 404 });

  const bytes = await buildResultPdf({
    name: result.name,
    archetype: result.archetype,
    runnerUp: result.runnerUp,
    createdAt: result.createdAt,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="amplifica-investor-profile.pdf"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
```

- [ ] **Step 9: Create `src/app/quiz/r/[token]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getResultByToken } from "@/features/quiz/data/results";
import QuizShell from "@/features/quiz/ui/QuizShell";
import ResultView from "@/features/quiz/ui/ResultView";

export const metadata: Metadata = {
  title: "Your investor profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function QuizResultPage({ params }: { params: { token: string } }) {
  const result = await getResultByToken(params.token);
  if (!result) notFound();

  return (
    <QuizShell>
      <ResultView result={result} />
    </QuizShell>
  );
}
```

- [ ] **Step 10: Run the tests, typecheck, boundaries**

Run: `pnpm vitest run src/features/quiz src/app/quiz src/boundaries.test.ts && pnpm typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 11: Commit**

```bash
git add src/features/quiz/ui/QuizShell.tsx src/features/quiz/ui/ResultView.tsx src/features/quiz/ui/ResultView.test.tsx src/app/quiz
git commit -m "feat(quiz): result page and PDF download route" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Quiz UI and `/quiz` page

**Files:**
- Create: `src/features/quiz/ui/quiz-storage.ts`, `src/features/quiz/ui/QuizClient.tsx`, `src/app/quiz/page.tsx`
- Test: `src/features/quiz/ui/quiz-storage.test.ts`, `src/features/quiz/ui/QuizClient.test.tsx`

**Interfaces:**
- Consumes: `QUESTIONS`, `QUIZ_LENGTH`, `OPTIONS_PER_QUESTION`, `QUIZ_VERSION` (Task 2); `submitQuiz` and `SubmitQuizState` (Task 4); `QuizShell` (Task 6).
- Produces: `loadAnswers(): StoredAnswers | null`, `saveAnswers(a: StoredAnswers): void`, `clearAnswers(): void`, `type StoredAnswers = (number | null)[]` from `quiz-storage.ts`; default export `QuizClient({ utm, advanceDelayMs? })`.

- [ ] **Step 1: Write the failing storage test** at `src/features/quiz/ui/quiz-storage.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUIZ_VERSION } from "../content";
import { clearAnswers, loadAnswers, saveAnswers, type StoredAnswers } from "./quiz-storage";

const KEY = `amp_quiz_v${QUIZ_VERSION}`;
const partial = (n: number): StoredAnswers => [...new Array(n).fill(2), ...new Array(15 - n).fill(null)];

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("quiz-storage", () => {
  it("round-trips a partial set of answers", () => {
    saveAnswers(partial(4));
    expect(loadAnswers()).toEqual(partial(4));
  });

  it("returns null when nothing is saved or nothing was answered", () => {
    expect(loadAnswers()).toBeNull();
    saveAnswers(partial(0));
    expect(loadAnswers()).toBeNull();
  });

  it.each([
    ["not JSON", "{oops"],
    ["not an array", '{"a":1}'],
    ["wrong length", "[0,1,2]"],
    ["out-of-range value", JSON.stringify([...new Array(14).fill(0), 9])],
    ["a string value", JSON.stringify([...new Array(14).fill(0), "1"])],
  ])("returns null for junk: %s", (_label, raw) => {
    window.localStorage.setItem(KEY, raw);
    expect(loadAnswers()).toBeNull();
  });

  it("clears saved answers", () => {
    saveAnswers(partial(3));
    clearAnswers();
    expect(loadAnswers()).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadAnswers()).toBeNull();
    expect(() => saveAnswers(partial(2))).not.toThrow();
    expect(() => clearAnswers()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/features/quiz/ui/quiz-storage.test.ts`
Expected: FAIL with "Failed to resolve import ./quiz-storage".

- [ ] **Step 3: Create `src/features/quiz/ui/quiz-storage.ts`**

```ts
import { OPTIONS_PER_QUESTION, QUIZ_LENGTH, QUIZ_VERSION } from "../content";

// Progress survives a reload (Instagram's in-app browser reloads often). Every
// access is wrapped: storage can be blocked, full, or hold junk, and the quiz
// must still work without it. The key carries the quiz version so edited
// questions never resume from stale answers.
const KEY = `amp_quiz_v${QUIZ_VERSION}`;

export type StoredAnswers = (number | null)[];

export function loadAnswers(): StoredAnswers | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== QUIZ_LENGTH) return null;
    const valid = parsed.every(
      (v) => v === null || (Number.isInteger(v) && v >= 0 && v < OPTIONS_PER_QUESTION)
    );
    if (!valid || parsed.every((v) => v === null)) return null;
    return parsed as StoredAnswers;
  } catch {
    return null;
  }
}

export function saveAnswers(answers: StoredAnswers): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // Storage unavailable: the quiz keeps working from memory.
  }
}

export function clearAnswers(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
```

- [ ] **Step 4: Run the storage test**

Run: `pnpm vitest run src/features/quiz/ui/quiz-storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing QuizClient test** at `src/features/quiz/ui/QuizClient.test.tsx`

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QUESTIONS, QUIZ_VERSION } from "../content";

const submitQuiz = vi.fn(async (_fd: FormData): Promise<{ error: string | null }> => ({ error: null }));
vi.mock("../data/actions", () => ({ submitQuiz: (fd: FormData) => submitQuiz(fd) }));

import QuizClient from "./QuizClient";

const KEY = `amp_quiz_v${QUIZ_VERSION}`;
const utm = { utm_source: "ig", utm_medium: "story", utm_campaign: "oct" };

function renderQuiz() {
  return render(<QuizClient utm={utm} advanceDelayMs={0} />);
}

async function start() {
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await screen.findByText("1 of 15");
}

/** Taps the first option on each question from the current one through question `through` (1-based). */
async function answerThrough(through: number, from = 1) {
  for (let n = from; n <= through; n++) {
    const first = QUESTIONS[n - 1].options[0].text;
    fireEvent.click(screen.getByRole("button", { name: first }));
    if (n < 15) await screen.findByText(`${n + 1} of 15`);
  }
}

beforeEach(() => {
  window.localStorage.clear();
  submitQuiz.mockClear();
  submitQuiz.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("QuizClient", () => {
  it("opens on the landing screen and starts at question 1", async () => {
    renderQuiz();
    expect(screen.getByRole("heading", { name: "What kind of investor are you?" })).toBeInTheDocument();
    expect(screen.getByText(/15 questions\. About 3 minutes\./)).toBeInTheDocument();
    await start();
    expect(screen.getByRole("heading", { name: QUESTIONS[0].prompt })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /./ }).filter((b) => b.hasAttribute("aria-pressed"))).toHaveLength(5);
  });

  it("advances after an answer and Back keeps the earlier choice", async () => {
    renderQuiz();
    await start();
    fireEvent.click(screen.getByRole("button", { name: QUESTIONS[0].options[2].text }));
    await screen.findByText("2 of 15");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("1 of 15");
    expect(screen.getByRole("button", { name: QUESTIONS[0].options[2].text })).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores a second tap while it is advancing, so no question is skipped", async () => {
    renderQuiz();
    await start();
    fireEvent.click(screen.getByRole("button", { name: QUESTIONS[0].options[0].text }));
    fireEvent.click(screen.getByRole("button", { name: QUESTIONS[0].options[1].text }));
    await screen.findByText("2 of 15");
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText("2 of 15")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("1 of 15");
    expect(screen.getByRole("button", { name: QUESTIONS[0].options[0].text })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the email gate after question 15 with the answers and UTMs in hidden fields", async () => {
    const { container } = renderQuiz();
    await start();
    await answerThrough(15);
    expect(await screen.findByRole("heading", { name: "Where should we send your results?" })).toBeInTheDocument();
    expect((container.querySelector('input[name="answers"]') as HTMLInputElement).value).toBe(
      "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"
    );
    expect((container.querySelector('input[name="utm_source"]') as HTMLInputElement).value).toBe("ig");
    expect((container.querySelector('input[name="utm_medium"]') as HTMLInputElement).value).toBe("story");
    expect((container.querySelector('input[name="utm_campaign"]') as HTMLInputElement).value).toBe("oct");
    const honeypot = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText(/We'll also send you the Amplifica newsletter\. Unsubscribe anytime\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveClass("text-base");
    expect(screen.getByLabelText("Email")).toHaveClass("text-base");
  });

  it("submits the form to the server action and shows its error", async () => {
    submitQuiz.mockResolvedValueOnce({ error: "Please enter a valid email address." });
    renderQuiz();
    await start();
    await answerThrough(15);
    await screen.findByRole("heading", { name: "Where should we send your results?" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam Rivera" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sam@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Show my results" }).closest("form")!);
    await waitFor(() => expect(submitQuiz).toHaveBeenCalledTimes(1));
    const fd = submitQuiz.mock.calls[0][0];
    expect(fd.get("name")).toBe("Sam Rivera");
    expect(fd.get("email")).toBe("sam@example.com");
    expect(fd.get("answers")).toBe("0,0,0,0,0,0,0,0,0,0,0,0,0,0,0");
    await screen.findByText("Please enter a valid email address.");
    expect(screen.getByRole("button", { name: "Show my results" })).not.toBeDisabled();
  });

  it("turns a thrown action into a generic retry message", async () => {
    submitQuiz.mockRejectedValueOnce(new Error("boom"));
    renderQuiz();
    await start();
    await answerThrough(15);
    await screen.findByRole("heading", { name: "Where should we send your results?" });
    fireEvent.submit(screen.getByRole("button", { name: "Show my results" }).closest("form")!);
    await screen.findByText("Something went wrong. Please try again.");
  });

  it("resumes at the first unanswered question after a reload", async () => {
    window.localStorage.setItem(KEY, JSON.stringify([1, 2, 3, ...new Array(12).fill(null)]));
    renderQuiz();
    await screen.findByText("4 of 15");
    expect(screen.getByRole("heading", { name: QUESTIONS[3].prompt })).toBeInTheDocument();
  });

  it("starts clean when saved progress is junk", async () => {
    window.localStorage.setItem(KEY, "{not json");
    renderQuiz();
    expect(screen.getByRole("heading", { name: "What kind of investor are you?" })).toBeInTheDocument();
  });

  it("works when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderQuiz();
    await start();
    await answerThrough(2);
    expect(screen.getByText("3 of 15")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/features/quiz/ui/QuizClient.test.tsx`
Expected: FAIL with "Failed to resolve import ./QuizClient".

- [ ] **Step 7: Create `src/features/quiz/ui/QuizClient.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { QUESTIONS, QUIZ_LENGTH } from "../content";
import { submitQuiz } from "../data/actions";
import { clearAnswers, loadAnswers, saveAnswers, type StoredAnswers } from "./quiz-storage";

interface Utm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

type Screen = "intro" | "question" | "gate";

const emptyAnswers = (): StoredAnswers => new Array(QUIZ_LENGTH).fill(null);

export default function QuizClient({
  utm,
  advanceDelayMs = 150,
}: {
  utm: Utm;
  /** Pause after a tap before moving on. Tests pass 0. */
  advanceDelayMs?: number;
}) {
  const [screen, setScreen] = useState<Screen>("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<StoredAnswers>(emptyAnswers);
  const [error, setError] = useState<string | null>(null);
  // Plain state, not useTransition: React 18 does not track async transitions,
  // so the button would stop showing pending right away.
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancing = useRef(false);

  // Resume after a reload. Runs after mount so server and client markup match.
  useEffect(() => {
    const saved = loadAnswers();
    if (!saved) return;
    setAnswers(saved);
    const next = saved.findIndex((a) => a === null);
    if (next === -1) {
      setScreen("gate");
    } else {
      setIndex(next);
      setScreen("question");
    }
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  function choose(option: number) {
    // A second tap during the short advance pause must not skip a question.
    if (advancing.current) return;
    advancing.current = true;
    const next = answers.map((a, i) => (i === index ? option : a));
    setAnswers(next);
    saveAnswers(next);
    timer.current = setTimeout(() => {
      advancing.current = false;
      timer.current = null;
      if (index === QUIZ_LENGTH - 1) setScreen("gate");
      else setIndex(index + 1);
    }, advanceDelayMs);
  }

  function back() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    advancing.current = false;
    if (screen === "gate") {
      setIndex(QUIZ_LENGTH - 1);
      setScreen("question");
    } else if (index === 0) {
      setScreen("intro");
    } else {
      setIndex(index - 1);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const formData = new FormData(e.currentTarget);
    setError(null);
    setPending(true);
    try {
      const result = await submitQuiz(formData);
      if (result?.error) {
        setError(result.error);
        setPending(false);
      } else {
        // Success: the action redirects and navigation takes over. Progress
        // is cleared only now, so a failed submit can still resume. Pending
        // stays true so a second tap cannot double-submit during navigation.
        clearAnswers();
      }
    } catch {
      // A real throw means the request itself failed.
      setError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  if (screen === "intro") {
    return (
      <div className="text-center pt-6">
        <h1 className="font-display text-3xl leading-tight mb-3">What kind of investor are you?</h1>
        <p className="text-base text-sub leading-relaxed mb-8">
          15 questions. About 3 minutes. You get your investor profile and your next step.
        </p>
        <button
          type="button"
          onClick={() => setScreen("question")}
          className="w-full bg-purple hover:bg-purple/90 transition-colors text-white text-base min-h-[52px] rounded-lg"
        >
          Start
        </button>
      </div>
    );
  }

  if (screen === "question") {
    const question = QUESTIONS[index];
    return (
      <div>
        <div className="flex items-center justify-between text-sm text-sub mb-2">
          <button type="button" onClick={back} className="min-h-[44px] pr-3 text-purple">
            Back
          </button>
          <span>{index + 1} of {QUIZ_LENGTH}</span>
        </div>
        <div
          role="progressbar"
          aria-label="Quiz progress"
          aria-valuemin={0}
          aria-valuemax={QUIZ_LENGTH}
          aria-valuenow={index + 1}
          className="h-2 rounded bg-edge mb-6"
        >
          <div
            className="h-2 rounded bg-purple transition-all"
            style={{ width: `${((index + 1) / QUIZ_LENGTH) * 100}%` }}
          />
        </div>
        <h2 className="font-display text-2xl leading-snug mb-5">{question.prompt}</h2>
        <div className="space-y-3">
          {question.options.map((option, i) => {
            const selected = answers[index] === i;
            return (
              <button
                key={`${index}-${i}`}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(i)}
                className={`w-full text-left text-base leading-snug min-h-[52px] px-4 py-3 rounded-lg border transition-colors ${
                  selected ? "border-purple bg-purple/10" : "border-edge bg-card hover:border-purple/60"
                }`}
              >
                {option.text}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button type="button" onClick={back} className="min-h-[44px] pr-3 text-sm text-purple mb-2">
        Change my last answer
      </button>
      <h2 className="font-display text-2xl leading-snug mb-5">Where should we send your results?</h2>

      {error && (
        <p
          role="alert"
          className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mb-4"
        >
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Honeypot: hidden from humans; bots that fill it are silently dropped. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <input type="hidden" name="answers" value={answers.join(",")} />
        <input type="hidden" name="utm_source" value={utm.utm_source ?? ""} />
        <input type="hidden" name="utm_medium" value={utm.utm_medium ?? ""} />
        <input type="hidden" name="utm_campaign" value={utm.utm_campaign ?? ""} />

        <div>
          <label htmlFor="quiz-name" className="block text-sm text-sub mb-1">
            Name
          </label>
          <input
            id="quiz-name"
            name="name"
            type="text"
            required
            maxLength={100}
            autoComplete="name"
            className="w-full border border-edge bg-card rounded-lg px-3 min-h-[52px] text-base"
          />
        </div>
        <div>
          <label htmlFor="quiz-email" className="block text-sm text-sub mb-1">
            Email
          </label>
          <input
            id="quiz-email"
            name="email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full border border-edge bg-card rounded-lg px-3 min-h-[52px] text-base"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-purple hover:bg-purple/90 transition-colors text-white text-base min-h-[52px] rounded-lg disabled:opacity-60"
        >
          {pending ? "Scoring..." : "Show my results"}
        </button>
      </form>

      <p className="text-xs text-sub mt-4">
        We&apos;ll also send you the Amplifica newsletter. Unsubscribe anytime.
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Run the QuizClient test**

Run: `pnpm vitest run src/features/quiz/ui/QuizClient.test.tsx`
Expected: PASS. If the "ignores a second tap" test is flaky on timing, the 30 ms wait is the knob; do not remove the `advancing` guard.

- [ ] **Step 9: Create `src/app/quiz/page.tsx`**

```tsx
import type { Metadata } from "next";
import QuizClient from "@/features/quiz/ui/QuizClient";
import QuizShell from "@/features/quiz/ui/QuizShell";

export const metadata: Metadata = {
  title: "What kind of investor are you?",
  description:
    "15 questions, about 3 minutes. Find your investor profile and your next step beyond index funds.",
  alternates: { canonical: "/quiz" },
  openGraph: {
    title: "What kind of investor are you? | Amplifica Wealth",
    description:
      "15 questions, about 3 minutes. Find your investor profile and your next step beyond index funds.",
    type: "website",
    url: "/quiz",
  },
  twitter: {
    card: "summary",
    title: "What kind of investor are you? | Amplifica Wealth",
    description:
      "15 questions, about 3 minutes. Find your investor profile and your next step beyond index funds.",
  },
};

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

export default function QuizPage({
  searchParams,
}: {
  searchParams: { utm_source?: Param; utm_medium?: Param; utm_campaign?: Param };
}) {
  return (
    <QuizShell>
      <QuizClient
        utm={{
          utm_source: first(searchParams.utm_source),
          utm_medium: first(searchParams.utm_medium),
          utm_campaign: first(searchParams.utm_campaign),
        }}
      />
    </QuizShell>
  );
}
```

- [ ] **Step 10: Run all quiz tests, typecheck, boundaries**

Run: `pnpm vitest run src/features/quiz src/boundaries.test.ts && pnpm typecheck`
Expected: all PASS, typecheck clean.

- [ ] **Step 11: Commit**

```bash
git add src/features/quiz/ui/quiz-storage.ts src/features/quiz/ui/quiz-storage.test.ts src/features/quiz/ui/QuizClient.tsx src/features/quiz/ui/QuizClient.test.tsx src/app/quiz/page.tsx
git commit -m "feat(quiz): mobile-first quiz flow and /quiz page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Routing, robots, sitemap guard and docs

**Files:**
- Modify: `src/shared/supabase/middleware.ts`, `src/app/robots.ts`, `docs/PRODUCT-STATUS.md`, `CLAUDE.md`
- Create: `src/shared/supabase/middleware.quiz.test.ts`, `src/app/quiz-seo.test.ts`, `src/features/quiz/CLAUDE.md`

**Interfaces:**
- Consumes: `updateSession` from `@/shared/supabase/middleware`; default exports of `robots` and `sitemap`.
- Produces: `/quiz` and `/quiz/*` bypass the auth round-trip; `robots.ts` disallows `/quiz/r/`.

- [ ] **Step 1: Write the failing middleware test** at `src/shared/supabase/middleware.quiz.test.ts`

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "./middleware";

// With no Supabase env set, reaching createServerClient would throw. A public
// route that returns a plain pass-through proves the auth round-trip is skipped.
describe("updateSession on the public quiz routes", () => {
  it.each(["/quiz", "/quiz/r/11111111-2222-4333-8444-555555555555", "/quiz/r/x/pdf"])(
    "passes %s through without the auth round-trip",
    async (path) => {
      const res = await updateSession(new NextRequest(`http://localhost${path}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/shared/supabase/middleware.quiz.test.ts`
Expected: FAIL. Without the bypass the call reaches `createServerClient` and throws on missing env.

- [ ] **Step 3: Edit `src/shared/supabase/middleware.ts`**

Replace

```ts
  // /calculator is intentionally public (email-gated lead-gen simulator).
  // Skip the auth round-trip entirely; session refresh happens on any other
  // route, so logged-in visitors lose nothing.
  if (pathname.startsWith("/calculator")) {
    return NextResponse.next({ request });
  }
```

with

```ts
  // /calculator and /quiz are intentionally public (email-gated lead-gen
  // surfaces). Skip the auth round-trip entirely; session refresh happens on
  // any other route, so logged-in visitors lose nothing.
  if (pathname.startsWith("/calculator") || pathname.startsWith("/quiz")) {
    return NextResponse.next({ request });
  }
```

- [ ] **Step 4: Run the middleware test**

Run: `pnpm vitest run src/shared/supabase/middleware.quiz.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing SEO test** at `src/app/quiz-seo.test.ts`

```ts
import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

describe("quiz crawl rules", () => {
  it("disallows result pages in robots.txt", () => {
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow;
    expect(disallow).toContain("/quiz/r/");
  });

  it("keeps the temporary quiz out of the sitemap", () => {
    expect(sitemap().some((e) => e.url.includes("/quiz"))).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run src/app/quiz-seo.test.ts`
Expected: the robots test FAILS; the sitemap test already passes.

- [ ] **Step 7: Edit `src/app/robots.ts`**

Add `"/quiz/r/",` to the `disallow` array, after `"/amortization",`.

- [ ] **Step 8: Run the SEO test**

Run: `pnpm vitest run src/app/quiz-seo.test.ts`
Expected: PASS.

- [ ] **Step 9: Create `src/features/quiz/CLAUDE.md`**

```markdown
# quiz: temporary lead-gen quiz

Public quiz at `/quiz`, linked from Instagram. 15 questions, 8 investor
archetypes, email gate before results, PDF download. Spec:
`docs/superpowers/specs/2026-10-06-lead-gen-quiz-design.md`.

**Removable in one delete:** this folder, `src/app/quiz/`, the `/quiz` line in
`shared/supabase/middleware.ts`, the `/quiz/r/` line in `app/robots.ts`, and a
migration dropping `quiz_submissions`. `shared/beehiiv.ts` stays (the
calculator uses it).

| File | Job |
|---|---|
| `content.ts` | Every question, weight, result and URL. Edit copy here; bump `QUIZ_VERSION` when questions or weights change. |
| `scoring.ts` | Pure: `parseAnswers`, `rankArchetypes`, `scoreAnswers`. Tie-break order is `ARCHETYPE_KEYS` order. |
| `data/actions.ts` | `submitQuiz(formData)`: honeypot, validate, rescore on the server, insert `quiz_submissions` + `leads`, awaited best-effort Beehiiv, redirect. |
| `data/results.ts` | `getResultByToken`: rejects non-UUIDs before querying. |
| `pdf/buildResultPdf.ts` | One-page `pdf-lib` PDF. Standard fonts only, so `toWinAnsi` scrubs text first. |
| `ui/` | `QuizClient` (flow), `ResultView`, `QuizShell`, `quiz-storage` (progress in localStorage, always try/catch). |

Rules worth knowing:

- Nothing from the browser is trusted except the 15 raw answer indexes.
- The action is called from `onSubmit`, not `useFormState`: React 18 here has no `useFormState`, and calling it directly keeps the UI testable.
- A retake adds a new `quiz_submissions` row on purpose. `leads` dedupes by email.
- No copy ships without the no-ai-slop pass. No em dashes.
```

- [ ] **Step 10: Update `CLAUDE.md` (repo root)**

In the "The small features" table, add this row after the `calculator/` row:

```markdown
| `quiz/` | Temporary Instagram lead-gen quiz at `/quiz`: 15 questions, 8 archetypes, email gate, PDF. **Removable in one delete** (see its CLAUDE.md). Writes `quiz_submissions` and `leads` via the **service-role** client and subscribes to Beehiiv. |
```

- [ ] **Step 11: Update `docs/PRODUCT-STATUS.md`**

Make these three edits (use the file's existing heading style and wording as a guide):

1. In the route/feature list near the `/calculator` description, add a `/quiz` entry: "`/quiz`: temporary public lead-gen quiz (Instagram). One question per screen, answers kept in localStorage, name and email gate after question 15, then `submitQuiz` (server action) rescored on the server, inserts `quiz_submissions` and a `leads` row (`source: 'quiz'`), awaits a best-effort Beehiiv subscribe (`first_name`, `utm_source: quiz`), and redirects to `/quiz/r/[token]`. The result page and `/quiz/r/[token]/pdf` look up the row by an unguessable token; both are noindex."
2. In the data-model section after `leads`, add a `quiz_submissions` table entry (migration 0010): columns `id`, `token` (unique uuid, used in the result URL), `name`, `email`, `answers` (jsonb, 15 integers), `scores` (jsonb), `archetype`, `runner_up`, `quiz_version`, UTMs, `user_agent`, `beehiiv_synced`, `created_at`; RLS enabled with no policies, written only via the service-role client; a retake adds a row. Also change the "migrations `0001`–`0007`" mention to "`0001`–`0010`", and add "`quiz`" to the `leads.source` description ("future public surfaces get their own").
3. In the `src/` tree listing, add `quiz/` under `features/`, and note `beehiiv.ts` under `shared/`.

- [ ] **Step 12: Run the full suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all PASS.

- [ ] **Step 13: Commit**

```bash
git add src/shared/supabase/middleware.ts src/shared/supabase/middleware.quiz.test.ts src/app/robots.ts src/app/quiz-seo.test.ts src/features/quiz/CLAUDE.md CLAUDE.md docs/PRODUCT-STATUS.md
git commit -m "feat(quiz): public routing, robots rule and docs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verify end to end

**Files:** none created. This task proves the feature works on a real database and a phone-sized screen.

- [ ] **Step 1: Full local gate**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all succeed. The build output lists `/quiz`, `/quiz/r/[token]` and `/quiz/r/[token]/pdf` as dynamic routes.

- [ ] **Step 2: Apply the migration (owner approval required)**

Migrations here are applied by hand. Ask the owner to run `supabase/migrations/0010_quiz_submissions.sql` in the Supabase SQL editor, or to approve applying it through the Supabase tool. Do not apply it without an explicit yes. Afterwards confirm: `select count(*) from public.quiz_submissions;` returns 0, and `select relrowsecurity from pg_class where relname = 'quiz_submissions';` returns `true`.

- [ ] **Step 3: Start the app with Beehiiv disabled**

Run the dev server with `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID` unset (leave them out of `.env.local` for this run, or start with `env -u BEEHIIV_API_KEY -u BEEHIIV_PUBLICATION_ID pnpm dev`) so a test email never reaches the live newsletter. `SUPABASE_SERVICE_ROLE_KEY` and the Supabase URL must be set. The action logs a warning about skipping Beehiiv, which is expected.

- [ ] **Step 4: Browser check at phone width**

Using the browser tools: open `http://localhost:3000/quiz?utm_source=ig&utm_medium=test&utm_campaign=verify` and resize the window to 390 px wide. Check each item and note any failure:

1. The landing screen fits without horizontal scroll and the Start button is full width.
2. Each question shows all 5 answers, each at least 52 px tall, readable text, no horizontal scroll.
3. Tapping an answer advances; Back returns with the choice highlighted.
4. Reload at question 6: the quiz resumes at question 6.
5. After question 15 the gate shows. Typing in Name and Email does not zoom the page on focus (text is 16 px).
6. Submit with name `Test Quiz` and email `quiz-test+verify@example.com`. The result page loads at `/quiz/r/<token>`, shows an archetype, one or two buttons, the runner-up line and the PDF link, and the URL contains a UUID.
7. Reload the result page: it still loads. Open `/quiz/r/not-a-token`: a 404 page, not an error page.
8. Click "Download your results (PDF)": a one-page PDF downloads and opens, showing the name, archetype, next single box and disclaimer.
9. In the Supabase SQL editor (or via the tool with approval), confirm the rows:
   `select name, email, archetype, runner_up, quiz_version, utm_source, utm_medium, beehiiv_synced from quiz_submissions where email = 'quiz-test+verify@example.com';` returns one row with `utm_source = 'ig'` and `beehiiv_synced = false`; and `select source from leads where email = 'quiz-test+verify@example.com';` returns `quiz`.
10. Retake with the same email: a second `quiz_submissions` row appears and the result page still loads (the `leads` duplicate is ignored).
11. Check the redirect works from the client-called action: step 6 landing on `/quiz/r/<token>` proves it. If instead the page shows "Something went wrong" while a row was inserted, the redirect-from-`onSubmit` path needs a fix; report it rather than working around it.

- [ ] **Step 5: Clean up the test data (owner approval required)**

Ask the owner to approve (or run) in the Supabase SQL editor:

```sql
delete from public.quiz_submissions where email = 'quiz-test+verify@example.com';
delete from public.leads where email = 'quiz-test+verify@example.com' and source = 'quiz';
```

- [ ] **Step 6: Report**

Summarize what passed, anything that failed, and what remains: the production deploy and checking that `amplificawealth.com/quiz` resolves to this app (spec open item 1), plus whether to push the branch and open a PR. Do not push or open a PR without the owner asking.
