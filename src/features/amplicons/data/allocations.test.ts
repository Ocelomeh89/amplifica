import { describe, expect, it } from "vitest";
import { saveSplit } from "./allocations";

type Res = { data?: unknown; error: { code?: string; message: string } | null };

// A stand-in for the Supabase client: every query chain resolves to the canned
// result for its table; rpc calls are recorded.
function fakeClient(tables: Record<string, Res>, rpcResult: Res = { error: null }) {
  const rpcCalls: unknown[] = [];
  const chainFor = (r: Res) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "in"]) c[m] = () => c;
    c.then = (res: (v: Res) => unknown) => Promise.resolve(r).then(res);
    return c;
  };
  return {
    rpcCalls,
    client: {
      from: (t: string) => chainFor(tables[t] ?? { data: [], error: null }),
      rpc: (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        return Promise.resolve(rpcResult);
      },
    },
  };
}

const missing = { data: null, error: { code: "42P01", message: "relation does not exist" } };

describe("saveSplit", () => {
  it("an empty split is a no-op before migration 0019", async () => {
    const f = fakeClient({ amplicon_splits: missing });
    await expect(saveSplit(f.client as never, "amp", [])).resolves.toBeUndefined();
    expect(f.rpcCalls).toEqual([]);
  });

  it("a real split before migration 0019 fails loudly", async () => {
    const f = fakeClient({ amplicon_splits: missing });
    await expect(saveSplit(f.client as never, "amp", [{ investment_option_id: "o", pct: 1 }])).rejects.toThrow(
      "migration 0019"
    );
  });

  it("saving the current split again writes nothing", async () => {
    const f = fakeClient({
      amplicon_splits: { data: [{ id: "s1", seq: 1, amplicon_id: "amp", created_at: "x" }], error: null },
      amplicon_allocations: { data: [{ split_id: "s1", investment_option_id: "o", pct: 1 }], error: null },
    });
    await saveSplit(f.client as never, "amp", [{ investment_option_id: "o", pct: 1 }]);
    expect(f.rpcCalls).toEqual([]);
  });

  it("no history and no split writes nothing (still Default growth)", async () => {
    const f = fakeClient({ amplicon_splits: { data: [], error: null } });
    await saveSplit(f.client as never, "amp", []);
    expect(f.rpcCalls).toEqual([]);
  });

  it("a changed split is saved as a new version through the database function", async () => {
    const f = fakeClient({
      amplicon_splits: { data: [{ id: "s1", seq: 1, amplicon_id: "amp", created_at: "x" }], error: null },
      amplicon_allocations: { data: [{ split_id: "s1", investment_option_id: "o", pct: 1 }], error: null },
    });
    await saveSplit(f.client as never, "amp", []);
    expect(f.rpcCalls).toEqual([{ name: "save_amplicon_split", args: { p_amplicon_id: "amp", p_allocations: [] } }]);
  });

  it("a database error still throws", async () => {
    const f = fakeClient({ amplicon_splits: { data: [], error: null } }, { error: { code: "P0001", message: "Split must add up to 100%." } });
    await expect(saveSplit(f.client as never, "amp", [{ investment_option_id: "o", pct: 1 }])).rejects.toThrow("100%");
  });
});
