import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Applied by hand in the Supabase SQL editor, like 0008. Assert the parts that matter.
describe("0009_content_uploads.sql", () => {
  const sql = readFileSync("supabase/migrations/0009_content_uploads.sql", "utf8");
  it("creates a private bucket with a size limit", () => {
    expect(sql).toMatch(/'content-uploads',\s*'content-uploads',\s*false,\s*4194304/);
  });
  it("scopes read, insert, and update to the owner's folder", () => {
    for (const op of ["select", "insert", "update"]) expect(sql).toMatch(new RegExp(`for ${op}`, "i"));
    expect(sql).toContain("(storage.foldername(name))[1] = auth.uid()::text");
  });
});
