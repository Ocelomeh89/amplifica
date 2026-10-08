import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Source-level guards for the content feature and its routes. They read files
// rather than import them, so the feature does not reach into app/.
const read = (f: string) => readFileSync(f, "utf8");

describe("content stays owner-only", () => {
  it("every content page and action opens with requireContentOwner", () => {
    const files = [
      "src/app/(app)/content/page.tsx",
      "src/app/(app)/content/queue/page.tsx",
      "src/app/(app)/content/performance/page.tsx",
      "src/app/(app)/content/week/page.tsx",
      "src/app/(app)/content/ideas/[id]/page.tsx",
      "src/app/(app)/content/sources/page.tsx",
      "src/features/content/data/actions.ts",
    ];
    for (const f of files) expect(read(f), f).toContain("requireContentOwner()");
  });

  it("every /api/content route opens with authorizeRoutine", () => {
    const routes = [
      "src/app/api/content/context/route.ts",
      "src/app/api/content/ingest/route.ts",
      "src/app/api/content/found/queued/route.ts",
      "src/app/api/content/drafts/queue/route.ts",
      "src/app/api/content/drafts/route.ts",
      "src/app/api/content/cron/metrics/route.ts",
      "src/app/api/content/voice/route.ts",
    ];
    for (const f of routes) expect(read(f), f).toContain("authorizeRoutine(req, process.env.");
  });

  it("pages hold no Supabase queries: reads live in data/queries.ts", () => {
    const pages = [
      "src/app/(app)/content/page.tsx",
      "src/app/(app)/content/queue/page.tsx",
      "src/app/(app)/content/week/page.tsx",
      "src/app/(app)/content/ideas/[id]/page.tsx",
      "src/app/(app)/content/sources/page.tsx",
    ];
    for (const f of pages) expect(read(f), f).not.toMatch(/supabase\s*\.from\(/);
  });

  it("comments do not crowd the routine's dedup window or the Sources page", () => {
    const db = read("src/features/content/data/supabase-db.ts");
    expect(db.match(/\.neq\("kind", "comment"\)/g)?.length).toBe(2);
    const queries = read("src/features/content/data/queries.ts");
    expect(queries.match(/\.neq\("kind", "comment"\)/g)?.length).toBe(1);
  });

  it("the metrics cron is bearer-protected by CRON_SECRET and scheduled once", () => {
    const route = read("src/app/api/content/cron/metrics/route.ts");
    expect(route).toContain("authorizeRoutine(req, process.env.CRON_SECRET)");
    expect(route).toContain("createAdminClient()");
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
    expect(vercel.crons).toEqual([{ path: "/api/content/cron/metrics", schedule: "0 10 * * *" }]);
  });
});
