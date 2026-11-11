import { describe, expect, it } from "vitest";
import { writeAllocations } from "./allocations";

// A stand-in for the Supabase client: records calls, returns a canned error.
function fakeClient(error: { code?: string; message: string } | null) {
  const calls: string[] = [];
  const result = { error };
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.then = (res: (v: typeof result) => unknown) => Promise.resolve(result).then(res);
  return {
    calls,
    client: {
      from: (t: string) => ({
        delete: () => {
          calls.push(`delete ${t}`);
          return chain;
        },
        insert: () => {
          calls.push(`insert ${t}`);
          return Promise.resolve(result);
        },
      }),
    },
  };
}

describe("writeAllocations before migration 0019", () => {
  it("an empty split is a no-op when the table is missing", async () => {
    const { client } = fakeClient({ code: "42P01", message: 'relation "amplicon_allocations" does not exist' });
    await expect(writeAllocations(client as never, "u", "a", [])).resolves.toBeUndefined();
  });

  it("PostgREST's missing-table code counts too", async () => {
    const { client } = fakeClient({ code: "PGRST205", message: "Could not find the table" });
    await expect(writeAllocations(client as never, "u", "a", [])).resolves.toBeUndefined();
  });

  it("a real split still fails loudly when the table is missing", async () => {
    const { client } = fakeClient({ code: "42P01", message: "missing" });
    await expect(writeAllocations(client as never, "u", "a", [{ investment_option_id: "o", pct: 1 }])).rejects.toThrow();
  });

  it("other errors still throw", async () => {
    const { client } = fakeClient({ code: "42501", message: "denied" });
    await expect(writeAllocations(client as never, "u", "a", [])).rejects.toThrow("denied");
  });
});
