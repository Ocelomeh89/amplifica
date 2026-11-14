import { describe, expect, it } from "vitest";
import { CARD_TOOL_NAME, CHECK_TOOL_NAME } from "@/features/content/engine/test-lab-card";
import type { ToolCaller } from "./claude";
import { withGatePass } from "./gate.fake";
import { NOW, fakeTestsDb, testLabInput, TOPICS, IDEAS } from "./test-lab.fake";
import { runProposal, skipTest, startProposal } from "./test-lab";

const outline = ["Open on the number", "Say why it matters", "Give the next step"];
const card = (hookA: string, hookB: string, over: { cardA?: string; cardB?: string; outlineB?: string[] } = {}) => ({
  why: "This checks a hook you have not tried against your usual.",
  versions: [
    { label: "a", hook: hookA, card_text: over.cardA ?? "", outline },
    { label: "b", hook: hookB, card_text: over.cardB ?? "", outline: over.outlineB ?? outline },
  ],
  notes: { record_once: "Record the body once.", record_twice: "Record two openings.", cuts: "Only the first line differs." },
});
const pass = { verdict: "pass", reader: "daniel", pillar: "w2-advantage", amplifica_pillar: "the-numbers", failed: [] };
const fail = (rewrite: Record<string, unknown>) => ({ verdict: "fail", reader: "daniel", pillar: "w2-advantage", amplifica_pillar: "the-numbers", failed: [{ item: "guardrails", reason: "No." }], rewrite });

function script(cards: unknown[], gate?: (text: string) => unknown, check?: (text: string) => unknown) {
  let i = 0;
  const calls: string[] = [];
  const base: ToolCaller = {
    async call(input) {
      calls.push(input.tool.name);
      if (input.tool.name === CARD_TOOL_NAME) {
        const c = cards[Math.min(i++, cards.length - 1)];
        if (c instanceof Error) throw c;
        return c;
      }
      if (input.tool.name === CHECK_TOOL_NAME) {
        const v = check?.(input.text);
        if (v instanceof Error) throw v;
        return v;
      }
      throw new Error(`unexpected tool ${input.tool.name}`);
    },
  };
  const caller = withGatePass(base, gate);
  return { caller, calls };
}
const left = () => 280;

async function run(db: ReturnType<typeof fakeTestsDb>, s: ReturnType<typeof script>, timeLeft = left) {
  const started = await startProposal(db, "button", NOW);
  if (!started.ok) throw new Error(started.error);
  await runProposal(db, s.caller, started.id, NOW, timeLeft);
  return db.get(started.id);
}
const ideasDb = (over: Parameters<typeof testLabInput>[1] = { hook_type: ["ranking", "warning"] }) => fakeTestsDb({ input: testLabInput({}, over), ideas: IDEAS });

describe("runProposal", () => {
  it("both versions pass: the test opens with two versions and their gate records", async () => {
    const db = ideasDb();
    const s = script([card("Hook for ranking", "Hook for question")]);
    const t = await run(db, s);
    expect(t).toMatchObject({ status: "open", kind: "opening", variable: "hook_type", value_a: "ranking", value_b: "question", rule: 5, question: "Does Ranking beat Question?" });
    expect(t?.reason).toBe("You have not tried Ranking in the last 90 days. Is it better than Question, your usual?");
    expect(t?.why).toContain("checks a hook");
    expect(t?.versions.map((v) => [v.label, v.value, v.hook])).toEqual([["a", "ranking", "Hook for ranking"], ["b", "question", "Hook for question"]]);
    expect(t?.versions[0].idea_id).toBe(t?.versions[1].idea_id);
    expect(t?.versions[0].gate).toMatchObject({ rewritten: false, result: { verdict: "pass" } });
    expect(s.caller.gateCalls).toHaveLength(2);
    expect(s.calls).toEqual([CARD_TOOL_NAME]);
    expect(t?.opened_at).toBe(NOW.toISOString());
  });

  it("a version that fails the gate twice drops the test, and the picker's next question is tried", async () => {
    const db = ideasDb();
    const s = script(
      [card("Ranking hook", "BADB question hook"), card("Warning hook", "Good question hook")],
      (text) => {
        if (text.includes("BADB question hook")) return fail({ hook: "BADB rewritten", outline });
        if (text.includes("BADB rewritten")) return fail({ hook: "still bad", outline });
        return undefined;
      }
    );
    const t = await run(db, s);
    expect(t).toMatchObject({ status: "open", value_a: "warning", value_b: "question" });
    expect(t?.dropped).toHaveLength(1);
    const dropped = t?.dropped as { question: string; why: string }[];
    expect(dropped[0]).toMatchObject({ question: "Does Ranking beat Question?" });
    expect(dropped[0].why).toBeTruthy();
  });

  it("a rewrite that changes the hook type counts as a fail", async () => {
    const db = ideasDb({ hook_type: ["ranking"] });
    const s = script(
      [card("Ranking hook", "Question hook")],
      (text) => (text.includes("Ranking hook") && !text.includes("Rewritten") ? fail({ hook: "Rewritten ranking hook", outline }) : undefined),
      () => ({ hook_type: "story-moment" })
    );
    const first = await run(db, s);
    expect(s.calls).toContain(CHECK_TOOL_NAME);
    expect(first?.status).toBe("failed");
    expect(first?.dropped).toHaveLength(1);
  });

  it("a rewrite that keeps the hook type passes, and the rewritten hook is stored", async () => {
    const db = ideasDb({ hook_type: ["ranking"] });
    const s = script(
      [card("Ranking hook", "Question hook")],
      (text) => (text.includes("Ranking hook") && !text.includes("Rewritten") ? fail({ hook: "Rewritten ranking hook", outline }) : undefined),
      () => ({ hook_type: "ranking" })
    );
    const t = await run(db, s);
    expect(t?.status).toBe("open");
    expect(t?.versions[0]).toMatchObject({ hook: "Rewritten ranking hook" });
    expect(t?.versions[0].gate).toMatchObject({ rewritten: true });
  });

  it("a rewrite that changes the topic counts as a fail", async () => {
    const db2 = fakeTestsDb({ input: testLabInput({}, { topic: ["credit"] }), ideas: IDEAS });
    const s = script(
      [card("Credit hook", "Paycheck hook")],
      (text) => (text.includes("Credit hook") && !text.includes("Rewritten") ? fail({ hook: "Rewritten credit hook", outline }) : undefined),
      () => ({ topic: "debt" })
    );
    const t = await run(db2, s);
    expect(s.calls).toContain(CHECK_TOOL_NAME);
    expect(t?.status).toBe("failed");
    expect(t?.dropped).toHaveLength(1);
  });

  it("a rewrite that changes the card style counts as a fail, and makes no check call", async () => {
    const db = fakeTestsDb({ input: testLabInput({}, { onscreen_text: ["none"] }), ideas: IDEAS });
    const s = script(
      [card("Stop saving.", "Stop saving.")],
      (text) => (text.includes("### card") ? fail({ hook: "Stop saving.", card: "Something else entirely", outline }) : undefined)
    );
    const t = await run(db, s);
    expect(s.calls).toEqual([CARD_TOOL_NAME]);
    expect(t?.status).toBe("failed");
    expect(t?.dropped).toHaveLength(1);
  });

  it("a card test sets the card text from the style: the hook for repeats-hook and nothing for none", async () => {
    const db = fakeTestsDb({ input: testLabInput({}, { onscreen_text: ["none"] }), ideas: IDEAS });
    const t = await run(db, script([card("Stop saving.", "Stop saving.", { cardA: "ignored", cardB: "ignored" })]));
    expect(t).toMatchObject({ status: "open", kind: "card", value_a: "none", value_b: "repeats-hook" });
    expect(t?.versions.map((v) => v.card_text)).toEqual(["", "Stop saving."]);
  });

  it("a rewrite that changes a shared part drops the test", async () => {
    const db = ideasDb({ hook_type: ["ranking"] });
    const s = script(
      [card("Ranking hook", "Question hook")],
      (text) => (text.includes("Question hook") && !text.includes("Different") ? fail({ hook: "Question hook", outline: ["Different", "Outline", "Entirely"] }) : undefined),
      () => ({ hook_type: "question" })
    );
    const t = await run(db, s);
    expect(t?.status).toBe("failed");
    expect(t?.dropped).toHaveLength(1);
  });

  it("a gate pillar that differs from the held pillar drops the test", async () => {
    const db = ideasDb({ hook_type: ["ranking"] });
    const t = await run(db, script([card("Ranking hook", "Question hook")], (text) => (text.includes("Question hook") ? { ...pass, pillar: "freedom-paradox" } : undefined)));
    expect(t?.status).toBe("failed");
    expect(t?.dropped).toHaveLength(1);
  });

  it("a gate error drops the test", async () => {
    const db = ideasDb({ hook_type: ["ranking"] });
    const t = await run(db, script([card("Ranking hook", "Question hook")], () => new Error("gate down")));
    expect(t?.status).toBe("failed");
    expect(t?.dropped).toHaveLength(1);
  });

  it("an invalid card drops the question", async () => {
    const db = ideasDb({ hook_type: ["ranking", "warning"] });
    const bad = { ...card("a", "b"), why: "" };
    const t = await run(db, script([bad, card("Warning hook", "Question hook")]));
    expect(t).toMatchObject({ status: "open", value_a: "warning" });
    expect(t?.dropped).toHaveLength(1);
  });

  it("an opening card whose two hooks are the same drops the question", async () => {
    const db = ideasDb({ hook_type: ["ranking", "warning"] });
    const t = await run(db, script([card("Same hook", "Same hook"), card("Warning hook", "Question hook")]));
    expect(t).toMatchObject({ status: "open", value_a: "warning" });
  });

  it("after three dropped tests the run stops and says so", async () => {
    const db = ideasDb({ hook_type: ["ranking", "warning", "identity", "promise"] });
    const t = await run(db, script([card("One", "Two")], () => ({ ...pass, pillar: "freedom-paradox" })));
    expect(t).toMatchObject({ status: "failed", error: "Three proposed tests did not meet the brand standard. Nothing was proposed." });
    expect(t?.dropped).toHaveLength(3);
  });

  it("with no valid question the run fails and nothing stays proposing", async () => {
    const db = fakeTestsDb({ input: testLabInput({}, { hook_type: ["ranking"] }), ideas: [] });
    const t = await run(db, script([card("A", "B")]));
    expect(t).toMatchObject({ status: "failed", error: "No test is left to propose." });
    expect(db.tests.some((x) => x.status === "proposing")).toBe(false);
  });

  it("stops when under 90 seconds remain", async () => {
    const db = ideasDb();
    const t = await run(db, script([card("A", "B")]), () => 60);
    expect(t).toMatchObject({ status: "failed", error: "Ran out of time. Try again." });
  });

  it("never throws: the caller throws on the first call and the row is failed", async () => {
    const db = ideasDb();
    const t = await run(db, script([new Error("Claude is down")]));
    expect(t).toMatchObject({ status: "failed", error: "Claude is down" });
  });

  it("a topic test writes one version per idea, a's idea first", async () => {
    const db = fakeTestsDb({ input: testLabInput({}, { topic: ["credit"] }), ideas: IDEAS });
    const t = await run(db, script([card("Credit hook", "Paycheck hook")]));
    expect(t).toMatchObject({ status: "open", kind: "topic", value_a: "credit", value_b: "paycheck" });
    expect(t?.versions.map((v) => v.idea_id)).toEqual(["i-credit", "i-paycheck"]);
    expect(TOPICS.length).toBeGreaterThan(0);
  });
});

describe("startProposal", () => {
  it("refuses while a test is open, and while one is being proposed", async () => {
    const db = ideasDb();
    const first = await startProposal(db, "button", NOW);
    expect(first.ok).toBe(true);
    expect(await startProposal(db, "button", NOW)).toMatchObject({ ok: false, reason: "busy", error: "A test is already being proposed." });
    await runProposal(db, script([card("A hook", "B hook")]).caller, (first as { id: string }).id, NOW, left);
    expect(await startProposal(db, "button", NOW)).toMatchObject({ ok: false, reason: "open", error: "A test is already open." });
  });

  it("refuses the fourth button press of the day, counting every status, and never caps the routine", async () => {
    const db = ideasDb();
    const t = (id: string, status: string) => ({ ...db.tests[0], id, status, created_at: "2026-11-16T07:00:00Z", versions: [] }) as never;
    for (const [id, status] of [["x1", "failed"], ["x2", "skipped"], ["x3", "judged"]]) db.tests.push(t(id, status));
    expect(await startProposal(db, "button", NOW)).toMatchObject({ ok: false, reason: "cap", error: "That's 3 test proposals today. Try again tomorrow." });
    expect((await startProposal(db, "routine", NOW)).ok).toBe(true);
  });

  it("fails a proposing row 11 minutes old and starts a new one", async () => {
    const db = ideasDb();
    const old = await startProposal(db, "button", new Date(NOW.getTime() - 11 * 60_000));
    expect(old.ok).toBe(true);
    // The fake stamps rows with NOW, so age the row by hand.
    db.tests[0].created_at = new Date(NOW.getTime() - 11 * 60_000).toISOString();
    const next = await startProposal(db, "button", NOW);
    expect(next.ok).toBe(true);
    expect(db.tests[0]).toMatchObject({ status: "failed", error: "Timed out" });
  });
});

describe("skipTest", () => {
  it("a skipped test frees its ideas", async () => {
    const db = ideasDb({ hook_type: ["ranking"] });
    const t = await run(db, script([card("Ranking hook", "Question hook")]));
    expect(t?.status).toBe("open");
    const held = t?.versions[0].idea_id as string;
    expect((await db.pickerInput(NOW)).ideas.map((i) => i.id)).not.toContain(held);
    expect(await skipTest(db, t!.id, "Not this week")).toEqual({ error: null });
    expect(await db.get(t!.id)).toMatchObject({ status: "skipped", skip_reason: "Not this week" });
    expect((await db.pickerInput(NOW)).ideas.map((i) => i.id)).toContain(held);
  });

  it("skip needs an open test, and a reason", async () => {
    const db = ideasDb();
    const started = await startProposal(db, "button", NOW);
    const id = (started as { id: string }).id;
    expect(await skipTest(db, id, "Not now")).toEqual({ error: "Only an open test can be skipped." });
    await runProposal(db, script([card("A hook", "B hook")]).caller, id, NOW, left);
    expect(await skipTest(db, id, "   ")).toEqual({ error: "Say why in a few words." });
    expect(await skipTest(db, id, "x".repeat(201))).toEqual({ error: "Say why in a few words." });
    expect(await skipTest(db, id, "Not now")).toEqual({ error: null });
    expect(await skipTest(db, id, "Again")).toEqual({ error: "Only an open test can be skipped." });
  });
});
