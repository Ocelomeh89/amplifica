// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Production /content and /content/sources returned 500 on Vercel with
// ERR_REQUIRE_ESM: jsdom 29 pulls html-encoding-sniffer@6, which require()s the
// ESM-only @exodus/bytes, and Vercel's runtime cannot load that. jsdom 26 uses
// html-encoding-sniffer@4 (CommonJS all the way down). Node 24 on a laptop
// loads the ESM package fine, so only the lockfile can catch a regression
// before deploy. Remove this test only if the deployed runtime is proven to
// load ESM-only packages from a require() call.
describe("jsdom dependency tree", () => {
  const lock = readFileSync("pnpm-lock.yaml", "utf8");

  it("has no ESM-only @exodus/bytes package entry", () => {
    // Match an entry such as `'@exodus/bytes@1.15.1':`, not the deprecation note
    // that whatwg-encoding@3 carries ("Use @exodus/bytes instead").
    expect(lock).not.toMatch(/^ +'?@exodus\/bytes@\d/m);
  });

  it("resolves html-encoding-sniffer to the CommonJS 4.x line", () => {
    const versions = [...lock.matchAll(/^ {2}html-encoding-sniffer@(\d+)\./gm)].map((m) => Number(m[1]));
    expect(versions.length).toBeGreaterThan(0);
    expect(Math.max(...versions)).toBeLessThanOrEqual(4);
  });
});
