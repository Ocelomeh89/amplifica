import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { deleteIdeaDrafts } from "./supabase-drafts-db";

function client(error: { message: string } | null) {
  const calls: [string, string][] = [];
  const chain = {
    delete: vi.fn(() => chain),
    eq: vi.fn((col: string, val: string) => {
      calls.push([col, val]);
      return calls.length >= 2 ? Promise.resolve({ error }) : chain;
    }),
  };
  return { c: { from: vi.fn(() => chain) } as unknown as SupabaseClient<Database>, calls, chain };
}

describe("deleteIdeaDrafts", () => {
  it("deletes by idea and user, both scoped", async () => {
    const { c, calls } = client(null);
    await deleteIdeaDrafts(c, "user-1", "idea-1");
    expect(calls).toEqual([["idea_id", "idea-1"], ["user_id", "user-1"]]);
  });
  it("throws with the database message on failure", async () => {
    const { c } = client({ message: "denied" });
    await expect(deleteIdeaDrafts(c, "u", "i")).rejects.toThrow("delete drafts: denied");
  });
});
