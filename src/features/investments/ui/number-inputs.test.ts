import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Dollar inputs must accept any amount: a step of 100 makes the browser
// refuse $5,000 (min 1) or a real balance like $52,347.
describe("dollar inputs", () => {
  for (const f of ["MovesCard.tsx", "CheckinForm.tsx"]) {
    it(`${f} accepts any amount`, () => {
      const src = readFileSync(`src/features/investments/ui/${f}`, "utf8");
      expect(src).not.toMatch(/step=\{100\}/);
      expect(src).toContain('step="any"');
    });
  }
});
