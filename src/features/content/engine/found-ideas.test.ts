import { describe, expect, it } from "vitest";
import { FOUND_TOOL_NAME, foundOutputSchema, foundToolSchema, renderUserTurn, toIngestPayload, type FoundContext } from "./found-ideas";

const idea = {
  format: "reel", title: "T", hook: "H", hook_alt: null, belief_attacked: "b", value_to_listener: "v",
  why_it_stops: "w", outline: [{ beat: "x" }], quote: "q", quote_ref: "model's ref", pillar: "method",
  hook_type: "belief-attacking", score: 0.5,
};
const source = {
  kind: "url" as const, external_id: "https://example.com/post", title: "Their post",
  url: "https://example.com/post", meta: { angle: "counterpoint" }, mined_at: null,
};
const context: FoundContext = {
  taste_rules: [{ rule: "Prefer concrete dollars", evidence_count: 4 }],
  recent_feedback: [],
  queue_depth: { reel: 2 },
  known_titles: ["Already proposed title"],
};

describe("foundOutputSchema", () => {
  it("accepts 1 to 10 ideas and defaults the excerpt", () => {
    expect(foundOutputSchema.parse({ ideas: [idea] }).source_excerpt).toBe("");
  });
  it("rejects zero ideas, more than ten, and malformed ideas", () => {
    expect(foundOutputSchema.safeParse({ ideas: [] }).success).toBe(false);
    expect(foundOutputSchema.safeParse({ ideas: Array(11).fill(idea) }).success).toBe(false);
    expect(foundOutputSchema.safeParse({ ideas: [{ ...idea, title: "" }] }).success).toBe(false);
    expect(foundOutputSchema.safeParse("not json").success).toBe(false);
  });
});

describe("foundToolSchema", () => {
  it("is a plain object schema with an ideas array and no $schema key", () => {
    const s = foundToolSchema() as { type: string; properties: Record<string, unknown>; $schema?: string };
    expect(FOUND_TOOL_NAME).toBe("record_ideas");
    expect(s.type).toBe("object");
    expect(Object.keys(s.properties)).toEqual(expect.arrayContaining(["ideas", "source_excerpt"]));
    expect(s.$schema).toBeUndefined();
  });
});

describe("renderUserTurn", () => {
  const base = { title: "Their post", url: "https://example.com/post", text: "BODY TEXT", note: "why I saved it", angleBlock: "ANGLE: TWIST.", context, isPdf: false };
  it("carries the note, angle, dedupe titles, and the source text, flagged as untrusted", () => {
    const t = renderUserTurn(base);
    expect(t).toContain("why I saved it");
    expect(t).toContain("ANGLE: TWIST.");
    expect(t).toContain("Already proposed title");
    expect(t).toContain("BODY TEXT");
    expect(t).toMatch(/not instructions/i);
  });
  it("says (no note) when the note is blank and omits the angle line for open", () => {
    const t = renderUserTurn({ ...base, note: "  ", angleBlock: "" });
    expect(t).toContain("(no note)");
    expect(t).not.toContain("ANGLE:");
  });
  it("for a PDF refers to the attachment and asks for the excerpt instead of inlining text", () => {
    const t = renderUserTurn({ ...base, text: "", isPdf: true });
    expect(t).toMatch(/attached PDF/);
    expect(t).toMatch(/source_excerpt/);
    expect(t).not.toContain("<source>");
  });
});

describe("toIngestPayload", () => {
  const out = foundOutputSchema.parse({ ideas: [idea, { ...idea, title: "T2" }] });
  it("points every idea at the one source and stamps today's batch_date", () => {
    const p = toIngestPayload(out, source, "open", "2026-10-01");
    expect(p.sources).toHaveLength(1);
    expect(p.sources[0]).toMatchObject({ kind: "url", external_id: source.external_id, status: "allowed" });
    expect(p.ideas.every((i) => i.source_ref?.external_id === source.external_id && i.batch_date === "2026-10-01")).toBe(true);
  });
  it("keeps the model's quote_ref for open, overrides it with the URL for counterpoint and twist", () => {
    expect(toIngestPayload(out, source, "open", "2026-10-01").ideas[0].quote_ref).toBe("model's ref");
    expect(toIngestPayload(out, source, "counterpoint", "2026-10-01").ideas[0].quote_ref).toBe("https://example.com/post");
    expect(toIngestPayload(out, source, "twist", "2026-10-01").ideas[1].quote_ref).toBe("https://example.com/post");
  });
  it("marks the source mined only when asked", () => {
    expect(toIngestPayload(out, source, "open", "2026-10-01").sources[0].mined_at).toBeUndefined();
    expect(toIngestPayload(out, { ...source, mined_at: "2026-10-01T15:00:00Z" }, "open", "2026-10-01").sources[0].mined_at).toBe("2026-10-01T15:00:00Z");
  });
  it("throws when the result is not a valid ingest payload", () => {
    expect(() => toIngestPayload(out, { ...source, url: "not a url" }, "open", "2026-10-01")).toThrow();
  });
});
