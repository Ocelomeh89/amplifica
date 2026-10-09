import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import robots from "./robots";
import sitemap from "./sitemap";

// /content is one person's page. These are the halves of "private" that live
// outside the feature; the rest is in src/features/content/wiring.test.ts.
describe("/content stays private and owner-only", () => {
  it("sits inside the authed (app) group", () => {
    expect(() => readFileSync("src/app/(app)/content/page.tsx", "utf8")).not.toThrow();
  });

  it("is disallowed in robots.txt", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    const all = list.flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : [r.disallow]));
    expect(all).toContain("/content");
  });

  it("is absent from the sitemap", () => {
    expect(sitemap().some((e) => e.url.includes("/content"))).toBe(false);
  });

  it("is shown in the sidebar only behind the owner flag", () => {
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(layout).toContain("showContentNav(");
    expect(layout).toContain("showContent=");
    const sidebar = readFileSync("src/app/(app)/Sidebar.tsx", "utf8");
    expect(sidebar).toContain("showContent ? [contentNavItem] : []");
  });
});
