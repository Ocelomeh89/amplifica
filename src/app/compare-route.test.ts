import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import robots from "./robots";
import sitemap from "./sitemap";

// "Unlinked" is the kind of property that quietly stops being true, so all
// four halves of it are asserted rather than assumed.
describe("/compare stays private and unlinked", () => {
  it("sits inside the authed (app) group, which redirects anonymous users", () => {
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(layout).toContain('redirect("/login")');
    // The page's mere existence at this path is what gates it.
    expect(() => readFileSync("src/app/(app)/compare/page.tsx", "utf8")).not.toThrow();
  });

  it("is disallowed in robots.txt", () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    const all = list.flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : [r.disallow]));
    expect(all).toContain("/compare");
  });

  it("is absent from the sitemap", () => {
    expect(sitemap().some((e) => e.url.endsWith("/compare"))).toBe(false);
  });

  it("is not linked from the sidebar", () => {
    const sidebar = readFileSync("src/components/Sidebar.tsx", "utf8");
    expect(sidebar).not.toContain("/compare");
  });
});
