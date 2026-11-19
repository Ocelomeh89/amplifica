// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  updates: 0,
  code: null as string | null,
  subscribe: vi.fn(async (_input: unknown) => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: () => ({ get: () => "test-agent" }) }));
vi.mock("@/shared/beehiiv", () => ({ subscribeToNewsletter: h.subscribe }));
vi.mock("@/shared/supabase/admin", () => ({
  createAdminClient: () => ({
    from() {
      return {
        insert(row: Record<string, unknown>) {
          h.inserts.push(row);
          return Promise.resolve({ error: h.code ? { code: h.code } : null });
        },
        update() {
          const chain = {
            eq: () => chain,
            then(resolve: (v: { error: null }) => void) {
              h.updates++;
              resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  }),
}));

import { WEBINAR } from "../event";
import { registerForWebinar } from "./actions";

const START = { error: null, done: false };
function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  h.inserts = [];
  h.updates = 0;
  h.code = null;
  h.subscribe.mockClear();
  h.subscribe.mockResolvedValue(true);
});

describe("registerForWebinar", () => {
  it("stores name and email under the webinar source and syncs Beehiiv", async () => {
    const res = await registerForWebinar(
      START,
      form({ name: " Dana Reyes ", email: " Dana@Example.com ", utm_source: "ig" })
    );
    expect(res).toEqual({ error: null, done: true });
    expect(h.inserts[0]).toMatchObject({
      name: "Dana Reyes",
      email: "dana@example.com",
      source: WEBINAR.source,
      utm_source: "ig",
    });
    expect(h.subscribe).toHaveBeenCalledWith({
      email: "dana@example.com",
      source: WEBINAR.source,
      firstName: "Dana",
    });
    expect(h.updates).toBe(1);
  });

  it("requires a name and a valid email", async () => {
    expect((await registerForWebinar(START, form({ name: "", email: "a@b.co" }))).error).toMatch(/name/);
    expect((await registerForWebinar(START, form({ name: "A", email: "nope" }))).error).toMatch(/email/);
    expect(h.inserts).toHaveLength(0);
  });

  it("treats a repeat registration as success", async () => {
    h.code = "23505";
    expect(await registerForWebinar(START, form({ name: "A", email: "a@b.co" }))).toEqual({
      error: null,
      done: true,
    });
  });

  it("reports other insert failures and skips Beehiiv", async () => {
    h.code = "XX000";
    const res = await registerForWebinar(START, form({ name: "A", email: "a@b.co" }));
    expect(res.done).toBe(false);
    expect(h.subscribe).not.toHaveBeenCalled();
  });

  it("drops honeypot submissions silently", async () => {
    const res = await registerForWebinar(START, form({ name: "A", email: "a@b.co", website: "x" }));
    expect(res.done).toBe(true);
    expect(h.inserts).toHaveLength(0);
  });

  it("still succeeds when Beehiiv fails", async () => {
    h.subscribe.mockResolvedValue(false);
    const res = await registerForWebinar(START, form({ name: "A", email: "a@b.co" }));
    expect(res.done).toBe(true);
    expect(h.updates).toBe(0);
  });
});
