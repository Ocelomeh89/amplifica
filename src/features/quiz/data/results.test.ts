// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fromCalls: 0,
  result: { data: null as unknown, error: null as unknown },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/shared/supabase/admin", () => ({
  createAdminClient: () => ({
    from() {
      h.fromCalls++;
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => h.result }) }),
      };
    },
  }),
}));

import { getResultByToken } from "./results";

const TOKEN = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  h.fromCalls = 0;
  h.result = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getResultByToken", () => {
  it.each(["", "abc", "not-a-uuid", "1' or '1'='1", `${TOKEN}extra`])(
    "returns null for %j without touching the database",
    async (token) => {
      expect(await getResultByToken(token)).toBeNull();
      expect(h.fromCalls).toBe(0);
    }
  );

  it("maps a found row", async () => {
    h.result = {
      data: {
        token: TOKEN,
        name: "Sam Rivera",
        archetype: "serial-dabbler",
        runner_up: "acquirer",
        created_at: "2026-10-06T12:00:00Z",
      },
      error: null,
    };
    expect(await getResultByToken(TOKEN)).toEqual({
      token: TOKEN,
      name: "Sam Rivera",
      archetype: "serial-dabbler",
      runnerUp: "acquirer",
      createdAt: "2026-10-06T12:00:00Z",
    });
  });

  it("returns null when no row matches", async () => {
    expect(await getResultByToken(TOKEN)).toBeNull();
  });

  it("returns null on a database error", async () => {
    h.result = { data: null, error: { message: "down" } };
    expect(await getResultByToken(TOKEN)).toBeNull();
  });

  it("returns null when the stored archetype is not a known key", async () => {
    h.result = {
      data: { token: TOKEN, name: "Sam", archetype: "nope", runner_up: "acquirer", created_at: "x" },
      error: null,
    };
    expect(await getResultByToken(TOKEN)).toBeNull();
  });
});
