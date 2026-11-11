import { describe, expect, it } from "vitest";
import {
  AMPLIFICA_PILLARS,
  GATE_ITEMS,
  PILLARS,
  PILLAR_SLUGS,
  VERIFIED_FIGURES,
  brandBrief,
  gateOutputSchema,
  gateSystemPrompt,
  gateToolSchema,
  pillarBalance,
  pillarName,
  renderGateTurn,
  retiredWordHits,
} from "./brand";

const failBody = { verdict: "fail", reader: null, pillar: null, amplifica_pillar: null, failed: [{ item: "reader", reason: "No reader." }] };
const fullRewrite = { title: "T", hook: "H", outline: ["a", "b", "c"] };

describe("brand standard", () => {
  it("lists the five personal pillars as slugs, in order, with their names", () => {
    expect(PILLAR_SLUGS).toEqual(["freedom-paradox", "expensive-tuition", "physics-of-wealth", "w2-advantage", "life-by-design"]);
    expect(pillarName("w2-advantage")).toBe("The W-2 Advantage");
    expect(pillarName("velocity")).toBe("velocity");
  });

  it("finds retired words regardless of case", () => {
    expect(retiredWordHits("Get out of the Waiting Room with velocity banking")).toEqual(["waiting room", "velocity banking"]);
    expect(retiredWordHits("A plain sentence")).toEqual([]);
  });

  it("states the whole standard in the system prompt", () => {
    const p = gateSystemPrompt();
    for (const s of ["Daniel", "Stephen", "investing capacity", "optionality", "~/.claude/skills/brand-writing/SKILL.md"]) expect(p).toContain(s);
    for (const pl of PILLARS) expect(p).toContain(pl.name);
    for (const a of AMPLIFICA_PILLARS) expect(p).toContain(a.name);
    for (const f of VERIFIED_FIGURES) expect(p).toContain(f);
    for (const g of GATE_ITEMS) expect(p).toContain(g.item);
  });

  it("requires a full rewrite on a fail only when rewriting", () => {
    const keys = ["title", "hook", "outline"];
    expect(gateOutputSchema(keys, true).safeParse(failBody).success).toBe(false);
    expect(gateOutputSchema(keys, true).safeParse({ ...failBody, rewrite: fullRewrite }).success).toBe(true);
    expect(gateOutputSchema(keys, true).safeParse({ ...failBody, rewrite: { title: "T", hook: "H" } }).success).toBe(false);
    expect(gateOutputSchema(keys, false).safeParse(failBody).success).toBe(true);
  });

  it("requires reader and both pillars on a pass", () => {
    const pass = { verdict: "pass", reader: "daniel", pillar: "w2-advantage", amplifica_pillar: "the-numbers", failed: [] };
    expect(gateOutputSchema(["hook"], false).safeParse(pass).success).toBe(true);
    expect(gateOutputSchema(["hook"], false).safeParse({ ...pass, reader: null }).success).toBe(false);
    expect(gateOutputSchema(["hook"], false).safeParse({ ...pass, pillar: "velocity" }).success).toBe(false);
  });

  it("builds a tool schema with the piece's keys under rewrite", () => {
    const s = gateToolSchema(["title", "outline"], true) as { properties: Record<string, { properties?: Record<string, unknown> }> };
    expect(Object.keys(s.properties.rewrite.properties ?? {})).toEqual(["title", "outline"]);
    expect((gateToolSchema(["title"], false) as { properties: Record<string, unknown> }).properties.rewrite).toBeUndefined();
  });

  it("renders the piece and says whether to rewrite", () => {
    const t = renderGateTurn({ format: "reel", fields: { hook: "My hook", outline: ["one", "two"] }, rewrite: true });
    expect(t).toContain("My hook");
    expect(t).toContain("- two");
    expect(t).toMatch(/rewrite/i);
    expect(renderGateTurn({ format: "reel", fields: { hook: "x" }, rewrite: false })).toMatch(/do not rewrite/i);
  });

  it("counts pillars in the current Chicago week only", () => {
    const now = new Date("2026-11-10T15:00:00Z"); // Tuesday
    const rows = [
      { pillar: "w2-advantage", at: "2026-11-09T12:00:00Z" }, // Monday this week
      { pillar: "w2-advantage", at: "2026-11-10T01:00:00Z" }, // Monday evening Chicago
      { pillar: "life-by-design", at: "2026-11-09T05:30:00Z" }, // Sunday 23:30 Chicago, last week
      { pillar: "velocity", at: "2026-11-10T12:00:00Z" },
    ];
    expect(pillarBalance(rows, now)).toEqual({ "freedom-paradox": 0, "expensive-tuition": 0, "physics-of-wealth": 0, "w2-advantage": 2, "life-by-design": 0 });
  });

  it("gives generators a short brand brief", () => {
    const b = brandBrief();
    expect(b).toContain("Daniel");
    expect(b).toContain("Stephen");
    for (const pl of PILLARS) expect(b).toContain(pl.name);
    expect(b.length).toBeLessThan(gateSystemPrompt().length);
  });
});

describe("gateLine", () => {
  it("names the reader and the pillar from a stored gate record, and nothing for a legacy idea", async () => {
    const { gateLine } = await import("./brand");
    const gate = { result: { verdict: "pass", reader: "stephen", pillar: "expensive-tuition", amplifica_pillar: "the-numbers", failed: [] }, rewritten: false, checked_at: "x" };
    expect(gateLine(gate)).toBe("Stephen · Expensive Tuition");
    expect(gateLine(null)).toBeNull();
    expect(gateLine({ result: { verdict: "fail", reader: null, pillar: null } })).toBeNull();
  });
});
