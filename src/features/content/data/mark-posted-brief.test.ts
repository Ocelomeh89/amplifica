import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { linkBriefExperiment } from "./mark-posted-brief";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];

/** Answers maybeSingle per table and logs every call. */
function fakeClient(rows: { experiment?: unknown; post?: unknown }) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {
        maybeSingle: () => Promise.resolve({ data: table === "content_experiments" ? (rows.experiment ?? null) : (rows.post ?? null), error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
      };
      for (const m of ["select", "eq", "update"]) {
        b[m] = (...args: unknown[]) => {
          log.push([`${table}.${m}`, ...args]);
          return b;
        };
      }
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, log };
}

const EXP = { id: "e1", recipe: { hook_type: "paradox", onscreen_text: "none", cta_type: "save", post_style: "talking-head", cover: "face", message: "velocity", topic: "t" } };
const POST = { id: "p1", posted_at: "2026-10-20T12:00:00Z", tagged_at: null, hook_used: "Hook" };
const A = { ideaId: "i1", platform: "instagram" as const, externalId: "ABC", now: new Date("2026-10-27T12:00:00Z") };

describe("linkBriefExperiment", () => {
  it("links the experiment, sets the judgment date a week after posting and tags an untagged Instagram post", async () => {
    const { client, log } = fakeClient({ experiment: EXP, post: POST });
    await linkBriefExperiment(client, "u1", A);
    expect(log).toContainEqual(["content_experiments.update", { post_id: "p1", status: "posted", judge_at: "2026-10-27T12:00:00.000Z" }]);
    const tagUpdate = log.find((c) => c[0] === "content_posts.update");
    expect(tagUpdate?.[1]).toMatchObject({ hook_type: "paradox", cover_face: true, hook_spoken: "Hook" });
    expect(log).toContainEqual(["content_posts.eq", "user_id", "u1"]);
  });

  it("keeps the tags of a post that is already tagged but still links the experiment", async () => {
    const { client, log } = fakeClient({ experiment: EXP, post: { ...POST, tagged_at: "2026-10-26T00:00:00Z" } });
    await linkBriefExperiment(client, "u1", A);
    expect(log.some((c) => c[0] === "content_posts.update")).toBe(false);
    expect(log.some((c) => c[0] === "content_experiments.update")).toBe(true);
  });

  it("links a YouTube post without writing tags", async () => {
    const { client, log } = fakeClient({ experiment: EXP, post: POST });
    await linkBriefExperiment(client, "u1", { ...A, platform: "youtube" });
    expect(log.some((c) => c[0] === "content_posts.update")).toBe(false);
    expect(log.some((c) => c[0] === "content_experiments.update")).toBe(true);
  });

  it("changes nothing for an idea with no open experiment", async () => {
    const { client, log } = fakeClient({ post: POST });
    await linkBriefExperiment(client, "u1", A);
    expect(log.some((c) => c[0].endsWith(".update"))).toBe(false);
  });
});
