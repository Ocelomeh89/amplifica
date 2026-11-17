import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseOptionForm, monthStart, versionRow, parseMoveForm, parseCheckinForm } from "./parse";

const fd = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

describe("parseOptionForm", () => {
  it("parses an infinite illiquid interest-only option", () => {
    expect(
      parseOptionForm(fd({ name: " Oak St rental ", option_type: "interest_only", rate_pct: "8", term_infinite: "on" }))
    ).toEqual({ name: "Oak St rental", option_type: "interest_only", rate_pct: 0.08, term_months: null, liquid: false });
  });

  it("parses a finite liquid amortized option", () => {
    const r = parseOptionForm(
      fd({ name: "Note", option_type: "amortized", rate_pct: "10", term_months: "60", liquid: "on" })
    );
    expect(r.term_months).toBe(60);
    expect(r.liquid).toBe(true);
  });

  it("rejects a bad type", () => {
    expect(() => parseOptionForm(fd({ name: "x", option_type: "bond", rate_pct: "5", term_infinite: "on" }))).toThrow();
  });

  it("rejects a zero finite term", () => {
    expect(() =>
      parseOptionForm(fd({ name: "x", option_type: "appreciation", rate_pct: "5", term_months: "0" }))
    ).toThrow();
  });

  it("rejects an empty name", () => {
    expect(() =>
      parseOptionForm(fd({ name: "  ", option_type: "appreciation", rate_pct: "5", term_infinite: "on" }))
    ).toThrow();
  });

  it("rejects a rate above 100%", () => {
    expect(() =>
      parseOptionForm(fd({ name: "x", option_type: "appreciation", rate_pct: "150", term_infinite: "on" }))
    ).toThrow();
  });
});

describe("versions", () => {
  it("monthStart turns a month into its first day", () => {
    expect(monthStart("2026-11")).toBe("2026-11-01");
  });

  it("versionRow is dated to the first of the edit month", () => {
    const row = versionRow("opt1", "user1", {
      name: "n",
      option_type: "appreciation",
      rate_pct: 0.07,
      term_months: null,
      liquid: true,
    }, "2026-11");
    expect(row).toEqual({
      option_id: "opt1",
      user_id: "user1",
      effective_month: "2026-11-01",
      option_type: "appreciation",
      rate_pct: 0.07,
      term_months: null,
      liquid: true,
    });
  });

  it("a same-month edit upserts on the version key", () => {
    const src = readFileSync("src/features/investments/data/actions.ts", "utf8");
    expect(src).toContain('onConflict: "option_id,effective_month"');
  });
});


describe("parseMoveForm", () => {
  it("maps default-growth to null", () => {
    expect(parseMoveForm(fd({ from: "default-growth", to: "opt1", amount: "5000", month: "2026-03" }))).toEqual({
      from_option_id: null,
      to_option_id: "opt1",
      amount: 5000,
      move_month: "2026-03-01",
    });
  });

  it("rejects a move to the same option", () => {
    expect(() => parseMoveForm(fd({ from: "opt1", to: "opt1", amount: "5", month: "2026-03" }))).toThrow();
  });

  it("rejects a non-positive amount", () => {
    expect(() => parseMoveForm(fd({ from: "opt1", to: "opt2", amount: "0", month: "2026-03" }))).toThrow();
  });

  it("rejects a missing month", () => {
    expect(() => parseMoveForm(fd({ from: "opt1", to: "opt2", amount: "5", month: "" }))).toThrow();
  });
});

describe("parseCheckinForm", () => {
  it("rejects a future check-in", () => {
    expect(() => parseCheckinForm(fd({ option: "opt1", value: "10", month: "2026-12" }), "2026-11")).toThrow(
      "A check-in can't be in the future."
    );
  });

  it("accepts a check-in of zero", () => {
    expect(parseCheckinForm(fd({ option: "default-growth", value: "0", month: "2026-11" }), "2026-11")).toEqual({
      investment_option_id: null,
      value: 0,
      checkin_month: "2026-11-01",
    });
  });

  it("rejects a negative value", () => {
    expect(() => parseCheckinForm(fd({ option: "opt1", value: "-1", month: "2026-10" }), "2026-11")).toThrow();
  });
});
