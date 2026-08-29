// The load-bearing rule of the whole design: builders emit PRE-TAX series in
// their own entryBasis and know nothing about taxes or inflation. Those layers
// run once, downstream, identically for every option — which is what makes
// comparability structural rather than a discipline someone has to maintain.
//
// Nothing enforced it. A builder that reached into tax/ or inflation.ts would
// compile, pass its own unit tests, and quietly produce a number that is not
// comparable to the other eight. This test is the enforcement.
//
// node:fs is used deliberately: the no-I/O rule binds the engine, not its
// tests, and reading the source is the only way to catch an import that has
// not been written yet.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The tests run under the jsdom environment, where import.meta.url is not a
// file URL, so the directory is resolved from the vitest root instead. The
// "finds builders to check" case below fails loudly if that ever stops
// pointing at the real directory.
const BUILD_DIR = join(process.cwd(), "src", "lib", "compare", "build");

// Matches any import or re-export whose module specifier mentions tax or
// inflation, at any depth of relative path.
const FORBIDDEN = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["'][^"']*(?:tax|inflation)[^"']*["']/;

function sourceFiles(): string[] {
  return readdirSync(BUILD_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();
}

describe("builders are structurally isolated from the tax and inflation layers", () => {
  it("finds builders to check, so a rename cannot make this test vacuous", () => {
    expect(sourceFiles().length).toBeGreaterThan(0);
  });

  it("imports nothing from tax/ or inflation.ts", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(join(BUILD_DIR, file), "utf8");
      if (FORBIDDEN.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("catches the violation it is meant to catch", () => {
    // A guard on the guard: if the pattern stopped matching, the test above
    // would pass silently forever.
    expect(FORBIDDEN.test('import { exitTax } from "../tax/exit";')).toBe(true);
    expect(FORBIDDEN.test('import { deflate } from "../inflation";')).toBe(true);
    expect(FORBIDDEN.test('export { x } from "./tax/engine";')).toBe(true);
    expect(FORBIDDEN.test('import { zeroSeries } from "../types";')).toBe(false);
  });
});
