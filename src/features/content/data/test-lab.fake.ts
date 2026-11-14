import { HOOK_TYPES } from "@/features/content/engine/tags";
import { EMPTY_FOCUS } from "@/features/content/engine/focus";
import type { ValueCount } from "@/features/content/engine/experiments";
import type { PickerInput } from "@/features/content/engine/test-lab-picker";
import type { OpenPatch, TestsDb, TestView, VersionInsert, VersionRow } from "./test-lab";

// An in-memory TestsDb for the Trial Reel test flow tests.

export const NOW = new Date("2026-11-16T15:00:00Z"); // 09:00 Chicago; the day starts 06:00Z

const row = (value: string, won: number, total: number): ValueCount => ({ value, won, lost: total - won, flat: 0, total, share: total ? won / total : 0 });

export const TOPICS = [
  { slug: "paycheck", label: "Paycheck", pillar: "w2-advantage" },
  { slug: "debt", label: "Debt", pillar: "w2-advantage" },
  { slug: "credit", label: "Credit", pillar: "w2-advantage" },
  { slug: "taxes", label: "Taxes", pillar: "freedom-paradox" },
];

export type FakeIdea = { id: string; title: string; hook: string; topic: string; pillar: string; status: string };
export const IDEAS: FakeIdea[] = TOPICS.map((t) => ({ id: `i-${t.slug}`, title: `Idea on ${t.label}`, hook: `Old hook on ${t.slug}`, topic: t.slug, pillar: t.pillar, status: "inbox" }));

/** Every value is explored (5 posts, no win), so only the values a test changes to zero posts produce questions (rule 5). */
export function testLabInput(over: Partial<PickerInput> = {}, zero: { hook_type?: string[]; topic?: string[]; onscreen_text?: string[] } = {}): PickerInput {
  const counts = (variable: "hook_type" | "topic" | "onscreen_text", values: string[]) => values.map((v) => (zero[variable]?.includes(v) ? row(v, 0, 0) : row(v, 0, 5)));
  return {
    counts: {
      hook_type: counts("hook_type", [...HOOK_TYPES]),
      topic: counts("topic", TOPICS.map((t) => t.slug)),
      onscreen_text: counts("onscreen_text", ["repeats-hook", "adds-to-hook", "none"]),
    },
    control: { hook_type: "question", onscreen_text: "repeats-hook" },
    focus: EMPTY_FOCUS,
    hookWinTopics: {},
    endedSkips: [],
    topics: TOPICS,
    ideas: [],
    past: [],
    today: "2026-11-16",
    ...over,
  };
}

export type FakeSeed = { input?: PickerInput; ideas?: FakeIdea[]; tests?: TestView[]; median?: number | null; useIdeaFails?: boolean };

export function fakeTestsDb(seed: FakeSeed = {}) {
  const input = seed.input ?? testLabInput({}, { hook_type: ["ranking", "warning"] });
  const ideas: FakeIdea[] = (seed.ideas ?? IDEAS).map((i) => ({ ...i }));
  const tests: TestView[] = (seed.tests ?? []).map((t) => ({ ...t, versions: t.versions.map((v) => ({ ...v })) }));
  let seq = 0;
  const stamp = NOW.toISOString();

  const emptyRow = (id: string, trigger: "routine" | "button"): TestView => ({
    id, user_id: "u1", kind: null, variable: null, value_a: null, value_b: null, held: {}, rule: null, question: "", reason: "", why: "", notes: {},
    status: "proposing", trigger, dropped: [], error: "", skip_reason: "", verdict: null, verdict_line: "", conclusion: "",
    opened_at: null, judged_at: null, effects_at: null, closed_at: null, created_at: stamp, updated_at: stamp, versions: [],
  });
  const heldIdeaIds = () => new Set(tests.filter((t) => t.status === "proposing" || t.status === "open").flatMap((t) => t.versions.map((v) => v.idea_id).filter((x): x is string => x !== null)));

  const db: TestsDb & { tests: TestView[]; ideas: FakeIdea[] } = {
    tests,
    ideas,
    async expireStale(beforeIso) {
      for (const t of tests) if (t.status === "proposing" && t.created_at < beforeIso) Object.assign(t, { status: "failed", error: "Timed out", closed_at: stamp });
    },
    async live() {
      return tests.find((t) => t.status === "proposing" || t.status === "open") ?? null;
    },
    async countSince(sinceIso) {
      return tests.filter((t) => t.created_at >= sinceIso).length;
    },
    async insertProposing(trigger) {
      if (tests.some((t) => t.status === "proposing" || t.status === "open")) return null;
      const id = `t${++seq}`;
      tests.push(emptyRow(id, trigger));
      return id;
    },
    async pickerInput() {
      const held = heldIdeaIds();
      return { ...input, ideas: ideas.filter((i) => i.status === "inbox" && !held.has(i.id)).map((i) => ({ id: i.id, topic: i.topic, pillar: i.pillar })) };
    },
    async writerContext(q) {
      return {
        ideas: q.ideaIds.map((id) => {
          const i = ideas.find((x) => x.id === id);
          return { title: i?.title ?? "", hook: i?.hook ?? "", topic: i?.topic ?? "" };
        }),
        skipReasons: tests.filter((t) => t.status === "skipped").map((t) => t.skip_reason),
        recentHooks: [],
        rules: [],
        pillarTopics: input.topics.filter((t) => t.pillar === q.held.pillar).map((t) => t.slug),
      };
    },
    async openTest(id, patch: OpenPatch, versions: VersionInsert[]) {
      const t = tests.find((x) => x.id === id);
      if (!t || t.status !== "proposing") return false;
      Object.assign(t, patch, { status: "open" });
      t.versions = versions.map<VersionRow>((v) => ({
        id: `v${++seq}`, user_id: "u1", test_id: id, label: v.label, value: v.value, idea_id: v.idea_id, hook: v.hook, card_text: v.card_text,
        outline: v.outline, gate: v.gate as unknown as VersionRow["gate"], post_id: null, link: "", typed_views: null, typed_saves: null, typed_shares: null,
        views_24h: null, saves_24h: null, shares_24h: null, read_at: null, promote: false, created_at: stamp, updated_at: stamp,
      }));
      return true;
    },
    async failTest(id, error, dropped) {
      const t = tests.find((x) => x.id === id);
      if (!t || t.status !== "proposing") return;
      Object.assign(t, { status: "failed", error, dropped, closed_at: stamp });
    },
    async get(id) {
      return tests.find((t) => t.id === id) ?? null;
    },
    async openTests() {
      return tests.filter((t) => t.status === "open");
    },
    async saveTyped(testId, label, n) {
      const t = tests.find((x) => x.id === testId);
      if (!t || t.status !== "open") return false;
      const v = t.versions.find((x) => x.label === label);
      if (!v) return false;
      Object.assign(v, { typed_views: n.views, typed_saves: n.saves, typed_shares: n.shares, link: n.link });
      return true;
    },
    async median24h() {
      return seed.median ?? null;
    },
    async labels() {
      return Object.fromEntries(TOPICS.map((t) => [t.slug, t.label]));
    },
    async judge(id, patch) {
      const t = tests.find((x) => x.id === id);
      if (!t || t.status !== "open") return false;
      for (const pv of patch.versions) Object.assign(t.versions.find((v) => v.label === pv.label) ?? {}, { views_24h: pv.views_24h, saves_24h: pv.saves_24h, shares_24h: pv.shares_24h, read_at: pv.read_at, promote: pv.promote });
      Object.assign(t, { status: "judged", verdict: patch.verdict, verdict_line: patch.verdict_line, judged_at: patch.judged_at });
      return true;
    },
    async pendingEffects() {
      return tests.filter((t) => t.status === "judged" && t.effects_at === null);
    },
    async useIdea(ideaId, postId) {
      if (seed.useIdeaFails) throw new Error("idea write failed");
      if (postId !== null) throw new Error("Linked posts are not built yet.");
      const i = ideas.find((x) => x.id === ideaId);
      if (i && (i.status === "inbox" || i.status === "queued")) i.status = "archived";
    },
    async markEffects(id, atIso) {
      const t = tests.find((x) => x.id === id);
      if (t) t.effects_at = atIso;
    },
    async close(id, status, reason) {
      const t = tests.find((x) => x.id === id);
      if (!t || t.status !== "open") return false;
      Object.assign(t, status === "skipped" ? { status, skip_reason: reason, closed_at: stamp } : { status, error: reason, closed_at: stamp });
      return true;
    },
  };
  return db;
}
