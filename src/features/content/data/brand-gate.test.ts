import { describe, expect, it } from "vitest";
import type { ToolCaller, ToolCallInput } from "./claude";
import { gatePiece } from "./brand-gate";

/** Returns queued responses in order; a queued Error is thrown. */
function scripted(responses: unknown[]): ToolCaller & { calls: ToolCallInput[] } {
  const calls: ToolCallInput[] = [];
  return {
    calls,
    async call(input) {
      calls.push(input);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const piece = { format: "reel", fields: { title: "Old title", hook: "Old hook", outline: ["a", "b", "c"] } };
const pass = { verdict: "pass", reader: "daniel", pillar: "w2-advantage", amplifica_pillar: "the-numbers", failed: [] };
const rewrite = { title: "New title", hook: "New hook", outline: ["x", "y", "z"] };
const fail = (extra: Record<string, unknown> = {}) => ({
  verdict: "fail",
  reader: null,
  pillar: null,
  amplifica_pillar: null,
  failed: [{ item: "situation", reason: "Too vague." }],
  ...extra,
});

describe("gatePiece", () => {
  it("passes on the first check with one call", async () => {
    const c = scripted([pass]);
    const o = await gatePiece(c, piece, { rewrite: true });
    expect(c.calls).toHaveLength(1);
    expect(o).toMatchObject({ status: "passed", rewritten: false, fields: piece.fields });
  });

  it("rewrites a fail and passes on the re-check", async () => {
    const c = scripted([fail({ rewrite }), pass]);
    const o = await gatePiece(c, piece, { rewrite: true });
    expect(c.calls).toHaveLength(2);
    expect(c.calls[1].text).toContain("New hook");
    expect(c.calls[1].text).toMatch(/do not rewrite/i);
    expect(o).toMatchObject({ status: "passed", rewritten: true, fields: rewrite, original: piece.fields });
  });

  it("fails when the rewrite fails its re-check, with the second reasons", async () => {
    const c = scripted([fail({ rewrite }), fail({ failed: [{ item: "reader", reason: "Still nobody." }] })]);
    const o = await gatePiece(c, piece, { rewrite: true });
    expect(o.status).toBe("failed");
    if (o.status === "failed") expect(o.result.failed).toEqual([{ item: "reader", reason: "Still nobody." }]);
  });

  it("does not rewrite when told not to", async () => {
    const c = scripted([fail()]);
    const o = await gatePiece(c, piece, { rewrite: false });
    expect(c.calls).toHaveLength(1);
    expect(o.status).toBe("failed");
  });

  it("fails a model pass that uses retired words", async () => {
    const c = scripted([pass]);
    const o = await gatePiece(c, { format: "reel", fields: { hook: "Escape the waiting room" } }, { rewrite: false });
    expect(o.status).toBe("failed");
    if (o.status === "failed") expect(o.result.failed.map((f) => f.item)).toContain("retired-words");
  });

  it("checks a rewrite for retired words too", async () => {
    const c = scripted([fail({ rewrite: { ...rewrite, hook: "Velocity banking, explained" } }), pass]);
    const o = await gatePiece(c, piece, { rewrite: true });
    expect(o.status).toBe("failed");
  });

  it("returns error when the caller throws or answers badly, on either call", async () => {
    expect((await gatePiece(scripted([new Error("down")]), piece, { rewrite: true })).status).toBe("error");
    expect((await gatePiece(scripted([{}]), piece, { rewrite: true })).status).toBe("error");
    expect((await gatePiece(scripted([fail({ rewrite }), new Error("down")]), piece, { rewrite: true })).status).toBe("error");
    expect((await gatePiece(scripted([fail({ rewrite }), {}]), piece, { rewrite: true })).status).toBe("error");
  });
});
