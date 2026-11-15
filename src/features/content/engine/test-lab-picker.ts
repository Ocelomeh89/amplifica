import { topicLabel } from "./brand";
import { valueLabel, type ValueCount } from "./experiments";
import type { ActiveFocus } from "./focus";
import { HOOK_TYPES, ONSCREEN_TEXT } from "./tags";
import { PAIR_REPEAT_DAYS, type TestKind, type TestStatus, type TestVariable, type TestVerdict } from "./test-lab-verdict";

// The picker: which Trial Reel test to propose next. Pure over the evidence, the lists and past tests.
// It returns every valid question, best first; the flow writes a card for each in turn until one opens.

export type Held = { hook_type?: string; onscreen_text?: string; topic?: string; pillar: string };

export type Question = {
  rule: 1 | 2 | 3 | 4 | 5;
  kind: TestKind;
  variable: TestVariable;
  /** The value in question. */
  a: string;
  /** What it is compared against. */
  b: string;
  held: Held;
  /** One idea for a cut test; two for a topic test (a's idea, then b's). */
  ideaIds: string[];
  reason: string;
};

export type PastTest = {
  variable: TestVariable;
  a: string;
  b: string;
  status: TestStatus;
  verdict: TestVerdict | null;
  held: Held;
  opened_at: string | null;
  judged_at: string | null;
};

export type PickerInput = {
  counts: Record<TestVariable, ValueCount[]>;
  control: { hook_type: string; onscreen_text: string };
  focus: ActiveFocus;
  /** Topics of the eligible Reels that won, per hook type, plus the topics of hook tests that had a winner. */
  hookWinTopics: Record<string, string[]>;
  endedSkips: { dimension: "hook_type" | "topic"; value: string; ended_on: string }[];
  topics: { slug: string; label: string; pillar: string }[];
  /** The claimable Inbox Reel ideas, best first. */
  ideas: { id: string; topic: string; pillar: string }[];
  past: PastTest[];
  /** YYYY-MM-DD, America/Chicago. */
  today: string;
};

const DAY = 86_400_000;
/** A test that reached `open` counts as asked; a failed or still-proposing one never did. */
const ASKED: TestStatus[] = ["open", "judged", "skipped", "not_run"];
const SECOND_CHANCE_DAYS = 28;

const ZERO = (value: string): ValueCount => ({ value, won: 0, lost: 0, flat: 0, total: 0, share: 0 });

export function pickQuestions(input: PickerInput): Question[] {
  const ctx = new Ctx(input);
  return [...ctx.rule1(), ...ctx.rule2(), ...ctx.rule3(), ...ctx.rule4(), ...ctx.rule5()].filter((q) => ctx.valid(q));
}

export function currentBest(variable: TestVariable, input: PickerInput): string {
  return new Ctx(input).best(variable);
}

class Ctx {
  constructor(private input: PickerInput) {}

  private get skip() {
    return this.input.focus.skip;
  }

  private values(variable: TestVariable): string[] {
    if (variable === "hook_type") return [...HOOK_TYPES];
    if (variable === "onscreen_text") return [...ONSCREEN_TEXT];
    return this.input.topics.map((t) => t.slug);
  }

  private row(variable: TestVariable, value: string): ValueCount {
    return this.input.counts[variable].find((r) => r.value === value) ?? ZERO(value);
  }

  private skipped(variable: TestVariable, value: string): boolean {
    if (variable === "hook_type") return this.skip.hook_type.includes(value);
    if (variable === "topic") return this.skip.topic.includes(value);
    return false;
  }

  /** Best first: wins, then win share, then posts, then list order. Skipped values are left out. */
  private ranked(variable: TestVariable, among?: string[]): string[] {
    const all = this.values(variable);
    const pool = (among ?? all).filter((v) => !this.skipped(variable, v));
    return pool
      .map((v) => ({ v, r: this.row(variable, v), i: all.indexOf(v) }))
      .sort((x, y) => y.r.won - x.r.won || y.r.share - x.r.share || y.r.total - x.r.total || x.i - y.i)
      .map((x) => x.v);
  }

  best(variable: TestVariable): string {
    if (variable === "hook_type") return this.input.control.hook_type;
    if (variable === "onscreen_text") return this.input.control.onscreen_text;
    return this.ranked("topic")[0] ?? "";
  }

  private pillarOf(topic: string): string | undefined {
    return this.input.topics.find((t) => t.slug === topic)?.pillar;
  }

  private topicsIn(pillar: string): string[] {
    return this.input.topics.filter((t) => t.pillar === pillar).map((t) => t.slug);
  }

  /** The value a topic test compares against: the current best topic when it shares a's pillar, else the best of a's pillar. */
  private topicRival(a: string): string | null {
    const pillar = this.pillarOf(a);
    if (!pillar) return null;
    const inPillar = this.ranked("topic", this.topicsIn(pillar)).filter((t) => t !== a);
    const best = this.best("topic");
    if (best !== a && this.pillarOf(best) === pillar) return best;
    return inPillar[0] ?? null;
  }

  private ideaWhere(f: (i: PickerInput["ideas"][number]) => boolean) {
    return this.input.ideas.find((i) => !this.skip.topic.includes(i.topic) && f(i));
  }

  private pastAsked(variable: TestVariable): PastTest[] {
    return this.input.past.filter((p) => p.variable === variable && ASKED.includes(p.status));
  }

  private daysSince(iso: string): number {
    return (Date.parse(this.input.today) - Date.parse(iso.slice(0, 10))) / DAY;
  }

  /** A pair asked inside the repeat window, in either order. */
  private pairRecent(variable: TestVariable, a: string, b: string): boolean {
    return this.pastAsked(variable).some((p) => {
      const same = (p.a === a && p.b === b) || (p.a === b && p.b === a);
      const at = p.opened_at ?? p.judged_at;
      return same && (at === null || this.daysSince(at) < PAIR_REPEAT_DAYS);
    });
  }

  private labelOf(variable: TestVariable, v: string): string {
    return variable === "topic" ? topicLabel(v, this.input.topics) : valueLabel(v);
  }

  valid(q: Question): boolean {
    if (q.a === q.b || q.a === "" || q.b === "") return false;
    if (this.skipped(q.variable, q.a) || this.skipped(q.variable, q.b)) return false;
    if (q.held.hook_type && this.skip.hook_type.includes(q.held.hook_type)) return false;
    if (q.held.topic && this.skip.topic.includes(q.held.topic)) return false;
    if (this.pairRecent(q.variable, q.a, q.b)) return false;
    const needed = q.kind === "topic" ? 2 : 1;
    return q.ideaIds.length === needed;
  }

  // ---- one question from a value in question and what it is compared against ----

  /** A cut or topic test of `a` against `b`, or null when no idea can carry it. `hookIdea` picks the opening test's idea. */
  private make(
    rule: Question["rule"],
    variable: TestVariable,
    a: string,
    b: string,
    reason: (la: string, lb: string) => string,
    opts: { hookIdea?: (i: PickerInput["ideas"][number]) => boolean; hookHeld?: string } = {}
  ): Question | null {
    const la = this.labelOf(variable, a);
    const lb = this.labelOf(variable, b);
    if (variable === "hook_type") {
      const idea = this.ideaWhere(opts.hookIdea ?? (() => true));
      if (!idea) return null;
      return { rule, kind: "opening", variable, a, b, held: { topic: idea.topic, pillar: idea.pillar }, ideaIds: [idea.id], reason: reason(la, lb) };
    }
    const hook = opts.hookHeld ?? this.input.control.hook_type;
    if (variable === "topic") {
      const pillar = this.pillarOf(a);
      if (!pillar || this.pillarOf(b) !== pillar) return null;
      const ia = this.ideaWhere((i) => i.topic === a);
      const ib = this.ideaWhere((i) => i.topic === b);
      if (!ia || !ib) return null;
      return { rule, kind: "topic", variable, a, b, held: { hook_type: hook, pillar }, ideaIds: [ia.id, ib.id], reason: reason(la, lb) };
    }
    const idea = this.ideaWhere(() => true);
    if (!idea) return null;
    return { rule, kind: "card", variable, a, b, held: { hook_type: hook, topic: idea.topic, pillar: idea.pillar }, ideaIds: [idea.id], reason: reason(la, lb) };
  }

  private compact(list: (Question | null)[]): Question[] {
    return list.filter((q): q is Question => q !== null);
  }

  // ---- the five rules ----

  rule1(): Question[] {
    const judged = this.input.past
      .filter((p) => p.status === "judged" && p.judged_at)
      .sort((x, y) => (y.judged_at as string).localeCompare(x.judged_at as string))[0];
    if (!judged || (judged.verdict !== "a" && judged.verdict !== "b")) return [];
    const winner = judged.verdict === "a" ? judged.a : judged.b;
    const faced = new Set(this.pastAsked(judged.variable).flatMap((p) => (p.a === winner ? [p.b] : p.b === winner ? [p.a] : [])));

    if (judged.variable === "hook_type") {
      const topic = judged.held.topic ?? "";
      const challengers = this.ranked("hook_type").filter((h) => h !== winner && !faced.has(h));
      return this.compact(
        challengers.map((b) =>
          this.make(1, "hook_type", winner, b, (A, B) => `${A} won its last test on ${topicLabel(topic, this.input.topics)}. Does it still beat ${B} on a different topic?`, {
            hookIdea: (i) => i.topic !== topic && i.pillar === judged.held.pillar,
          })
        )
      );
    }
    if (judged.variable === "topic") {
      const pillar = this.pillarOf(winner) ?? judged.held.pillar;
      const challengers = this.ranked("topic", this.topicsIn(pillar)).filter((t) => t !== winner);
      return this.compact(
        challengers.map((b) =>
          this.make(1, "topic", winner, b, (A, B) => `${A} won its last test. Does it beat ${B}, with the same hook?`, { hookHeld: judged.held.hook_type })
        )
      );
    }
    // A card style won: the one style that test did not include, under a hook that differs from that test's.
    const remaining = ONSCREEN_TEXT.filter((s) => s !== judged.a && s !== judged.b);
    const hook = this.ranked("hook_type").find((h) => h !== judged.held.hook_type);
    if (!hook) return [];
    return this.compact(remaining.map((b) => this.make(1, "onscreen_text", winner, b, (A, B) => `${A} won its last test. Does it beat ${B} under a different hook?`, { hookHeld: hook })));
  }

  rule2(): Question[] {
    const out: (Question | null)[] = [];
    for (const hook of this.input.focus.doubleDown.hook_type) {
      const topics = [...new Set(this.input.hookWinTopics[hook] ?? [])];
      if (topics.length !== 1) continue;
      const only = topics[0];
      const rival = this.best("hook_type") !== hook ? this.best("hook_type") : this.ranked("hook_type").find((h) => h !== hook);
      if (!rival) continue;
      out.push(
        this.make(2, "hook_type", hook, rival, (A, B) => `${A} keeps winning, but only on ${topicLabel(only, this.input.topics)}. Does it beat ${B} on a different topic?`, {
          hookIdea: (i) => i.topic !== only,
        })
      );
    }
    return this.compact(out);
  }

  /** Rules 3 to 5: hooks first, then topics, then card styles, each against the current best. */
  private sweep(rule: 3 | 4 | 5, pick: (variable: TestVariable) => string[], reason: (variable: TestVariable, a: string) => (la: string, lb: string) => string): Question[] {
    const out: (Question | null)[] = [];
    for (const variable of ["hook_type", "topic", "onscreen_text"] as const) {
      for (const a of pick(variable)) {
        const b = variable === "topic" ? this.topicRival(a) : this.best(variable);
        if (b === null || b === a) continue;
        out.push(this.make(rule, variable, a, b, reason(variable, a)));
      }
    }
    return this.compact(out);
  }

  rule3(): Question[] {
    return this.sweep(
      3,
      (variable) => this.ranked(variable).filter((v) => {
        const r = this.row(variable, v);
        return r.total >= 1 && r.total <= 2 && r.won >= 1;
      }),
      (variable, a) => (la, lb) => {
        const r = this.row(variable, a);
        return `${la} has won ${r.won} of ${r.total}. Is it better than ${lb}, your usual?`;
      }
    );
  }

  rule4(): Question[] {
    const { today } = this.input;
    const back = this.input.endedSkips.filter((s) => {
      const age = (Date.parse(today) - Date.parse(s.ended_on)) / DAY;
      if (age < 0 || age > SECOND_CHANCE_DAYS) return false;
      // No later test has included the value.
      return !this.pastAsked(s.dimension).some((p) => (p.a === s.value || p.b === s.value) && (p.opened_at ?? "") >= s.ended_on);
    });
    return this.sweep(
      4,
      (variable) => back.filter((s) => s.dimension === variable).map((s) => s.value),
      () => (la, lb) => `${la} is back after 90 days off. Is it better than ${lb} now?`
    );
  }

  rule5(): Question[] {
    return this.sweep(
      5,
      (variable) => this.values(variable).filter((v) => this.row(variable, v).total === 0 && !this.skipped(variable, v)),
      () => (la, lb) => `You have not tried ${la} in the last 90 days. Is it better than ${lb}, your usual?`
    );
  }
}
