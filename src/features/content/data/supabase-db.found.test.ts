// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { supabaseFoundDb } from "./supabase-db";

function fakeClient() {
  const download = vi.fn(async (_path: string) => ({ data: new Blob([new Uint8Array([1, 2])]), error: null }));
  const client = { storage: { from: (_bucket: string) => ({ download }) } };
  return { client: client as unknown as Parameters<typeof supabaseFoundDb>[0], download };
}

describe("supabaseFoundDb.loadFile", () => {
  it("refuses a path outside the user's folder without calling storage", async () => {
    const { client, download } = fakeClient();
    const db = supabaseFoundDb(client, "user-1");
    await expect(db.loadFile("user-2/abc.pdf")).rejects.toThrow("download: path is not in your folder");
    await expect(db.loadFile("user-1x/abc.pdf")).rejects.toThrow("download: path is not in your folder");
    expect(download).not.toHaveBeenCalled();
  });
  it("downloads a path in the user's folder", async () => {
    const { client, download } = fakeClient();
    const db = supabaseFoundDb(client, "user-1");
    expect(Array.from(await db.loadFile("user-1/abc.pdf"))).toEqual([1, 2]);
    expect(download).toHaveBeenCalledWith("user-1/abc.pdf");
  });
});
