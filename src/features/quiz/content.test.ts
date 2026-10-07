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
