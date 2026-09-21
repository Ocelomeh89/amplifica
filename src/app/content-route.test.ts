import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import robots from "./robots";
import sitemap from "./sitemap";

// /content is one person's page. Each half of "private" is asserted.
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
    expect(layout).toContain("isContentOwner(");
    expect(layout).toContain("showContent=");
    const sidebar = readFileSync("src/app/(app)/Sidebar.tsx", "utf8");
    expect(sidebar).toContain("showContent ? [contentNavItem] : []");
  });

  it("every content page and action opens with requireContentOwner", () => {
    const files = [
      "src/app/(app)/content/page.tsx",
      "src/app/(app)/content/queue/page.tsx",
      "src/app/(app)/content/ideas/[id]/page.tsx",
      "src/app/(app)/content/sources/page.tsx",
      "src/features/content/data/actions.ts",
    ];
    for (const f of files) {
      expect(readFileSync(f, "utf8"), f).toContain("requireContentOwner()");
    }
  });

  it("the metrics cron is bearer-protected by CRON_SECRET and scheduled once", () => {
    const route = readFileSync("src/app/api/content/cron/metrics/route.ts", "utf8");
    expect(route).toContain("isAuthorized(req, process.env.CRON_SECRET)");
    expect(route).toContain("createAdminClient()");
    const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons).toEqual([{ path: "/api/content/cron/metrics", schedule: "0 10 * * *" }]);
  });
});
