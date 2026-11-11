import { describe, expect, it } from "vitest";
import { clickUpChatPoster, postDigests, renderDigest, type DigestBatch, type DigestDb } from "./gate-digest";

const NOW = new Date("2026-11-11T12:00:00Z");
const SITE = "https://amplificawealth.com";

describe("renderDigest", () => {
  it("lists the passed ideas and counts the rest", () => {
    const text = renderDigest({
      date: "2026-11-11",
      passed: [
        { id: "a", format: "reel", hook: "Your paycheck is an asset" },
        { id: "b", format: "newsletter", hook: "Net worth is the wrong scoreboard" },
      ],
      failed: 1,
      siteUrl: SITE,
    });
    expect(text).toBe(
      [
        "**Content ideas for 2026-11-11**: 2 passed the brand gate",
        "",
        "1. [Reel] Your paycheck is an asset: https://amplificawealth.com/content/ideas/a",
        "2. [Newsletter] Net worth is the wrong scoreboard: https://amplificawealth.com/content/ideas/b",
        "",
        "1 didn't pass: https://amplificawealth.com/content/performance",
      ].join("\n")
    );
  });

  it("drops the failed line when everything passed", () => {
    const text = renderDigest({ date: "2026-11-11", passed: [{ id: "a", format: "reel", hook: "h" }], failed: 0, siteUrl: SITE });
    expect(text).not.toContain("didn't pass");
  });
});

function fakeDb(batches: DigestBatch[]) {
  const stamped: string[] = [];
  const db: DigestDb = {
    async openBatches() {
      return batches.filter((b) => !stamped.includes(b.batch));
    },
    async markDigested(batch) {
      stamped.push(batch);
    },
  };
  return { db, stamped };
}

const idea = (id: string, status: string, source_kind: string | null = "granola") => ({ id, format: "reel", hook: `hook ${id}`, status, source_kind });

describe("postDigests", () => {
  it("skips a batch that still has an idea waiting for the gate", async () => {
    const { db, stamped } = fakeDb([{ batch: "b1", ideas: [idea("a", "inbox"), idea("b", "gating")] }]);
    const posts: string[] = [];
    expect(await postDigests(db, async (m) => void posts.push(m), NOW, SITE)).toBe(0);
    expect(posts).toEqual([]);
    expect(stamped).toEqual([]);
  });

  it("posts each settled batch once and stamps it", async () => {
    const { db, stamped } = fakeDb([{ batch: "b1", ideas: [idea("a", "inbox"), idea("b", "gate_failed")] }]);
    const posts: string[] = [];
    expect(await postDigests(db, async (m) => void posts.push(m), NOW, SITE)).toBe(1);
    expect(posts[0]).toContain("1 passed the brand gate");
    expect(posts[0]).toContain("1 didn't pass");
    expect(stamped).toEqual(["b1"]);
    expect(await postDigests(db, async (m) => void posts.push(m), NOW, SITE)).toBe(0);
  });

  it("stamps a found-content batch without posting, and lists only the routine's ideas in a mixed one", async () => {
    const { db, stamped } = fakeDb([
      { batch: "found", ideas: [idea("a", "inbox", "url"), idea("b", "inbox", "upload")] },
      { batch: "mixed", ideas: [idea("c", "inbox", "granola"), idea("d", "inbox", "url")] },
    ]);
    const posts: string[] = [];
    await postDigests(db, async (m) => void posts.push(m), NOW, SITE);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("hook c");
    expect(posts[0]).not.toContain("hook d");
    expect(stamped.sort()).toEqual(["found", "mixed"]);
  });

  it("leaves a batch unstamped when the post fails", async () => {
    const { db, stamped } = fakeDb([{ batch: "b1", ideas: [idea("a", "inbox")] }]);
    expect(await postDigests(db, async () => { throw new Error("clickup down"); }, NOW, SITE)).toBe(0);
    expect(stamped).toEqual([]);
  });
});

describe("clickUpChatPoster", () => {
  it("posts markdown to the digest channel in the workspace", async () => {
    const calls: [string, RequestInit][] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    await clickUpChatPoster({ token: "tok", workspaceId: "9011777568" }, fetchImpl)("hello");
    expect(calls[0][0]).toBe("https://api.clickup.com/api/v3/workspaces/9011777568/chat/channels/7-9011777568-8/messages");
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ type: "message", content_format: "text/md", content: "hello" });
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe("tok");
  });

  it("throws on a failed response or missing settings", async () => {
    const bad = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    await expect(clickUpChatPoster({ token: "tok", workspaceId: "w" }, bad)("x")).rejects.toThrow();
    await expect(clickUpChatPoster({ token: undefined, workspaceId: "w" })("x")).rejects.toThrow();
  });
});
