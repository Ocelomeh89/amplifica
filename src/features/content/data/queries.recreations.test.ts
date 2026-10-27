import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { loadOpenRecreations } from "./queries";

vi.mock("server-only", () => ({}));

type Call = [string, ...unknown[]];

function fakeClient(tables: Record<string, unknown[]>) {
  const log: Call[] = [];
  const client = {
    from(table: string) {
      const b: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok),
      };
      for (const m of ["select", "eq", "in", "or", "order", "limit"]) {
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

const NOW = new Date("2026-10-26T15:00:00Z");
const row = (id: string, status: string, created_at: string) => ({
  id, source_post_id: "p1", mode: "same-recipe", status, options: [], error: "", idea_id: null, created_at,
});

describe("loadOpenRecreations", () => {
  it("reads the owner's pending, ready and failed cards, keeping live ones past 7 days, newest first", async () => {
    const { client, log } = fakeClient({ content_recreations: [], content_posts: [] });
    await loadOpenRecreations(client, "u1", NOW);
    expect(log).toContainEqual(["content_recreations.eq", "user_id", "u1"]);
    expect(log).toContainEqual(["content_recreations.in", "status", ["pending", "ready", "failed"]]);
    // Live cards (pending, ready) stay however old; only failed ones age out after 7 days.
    expect(log).toContainEqual(["content_recreations.or", "status.in.(pending,ready),created_at.gte.2026-10-19T15:00:00.000Z"]);
    expect(log).toContainEqual(["content_recreations.order", "created_at", { ascending: false }]);
  });

  it("shows a pending card older than 10 minutes as failed with Timed out, without writing", async () => {
    const { client } = fakeClient({
      content_recreations: [row("old", "pending", "2026-10-26T14:40:00Z"), row("fresh", "pending", "2026-10-26T14:55:00Z")],
      content_posts: [{ id: "p1", thumbnail_url: "t", caption: "c" }],
    });
    const out = await loadOpenRecreations(client, "u1", NOW);
    expect(out.find((r) => r.id === "old")).toMatchObject({ status: "failed", error: "Timed out" });
    expect(out.find((r) => r.id === "fresh")?.status).toBe("pending");
  });

  it("attaches the source post's thumbnail and caption", async () => {
    const { client } = fakeClient({
      content_recreations: [row("r1", "ready", "2026-10-26T14:59:00Z")],
      content_posts: [{ id: "p1", thumbnail_url: "https://t", caption: "Cap" }],
    });
    const [r] = await loadOpenRecreations(client, "u1", NOW);
    expect(r.source).toEqual({ id: "p1", thumbnail_url: "https://t", caption: "Cap" });
  });
});
