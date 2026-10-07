// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("@/features/quiz/data/results", () => ({ getResultByToken: async () => h.result }));

import { GET } from "./route";

const TOKEN = "11111111-2222-4333-8444-555555555555";
const call = (token: string) => GET(new Request(`http://localhost/quiz/r/${token}/pdf`), { params: { token } });

beforeEach(() => {
  h.result = null;
});

describe("GET /quiz/r/[token]/pdf", () => {
  it("returns 404 for an unknown or malformed token", async () => {
    expect((await call("nope")).status).toBe(404);
    expect((await call(TOKEN)).status).toBe(404);
  });

  it("returns a PDF attachment for a known token", async () => {
    h.result = {
      token: TOKEN,
      name: "Sam Rivera",
      archetype: "serial-dabbler",
      runnerUp: "acquirer",
      createdAt: "2026-10-06T12:00:00Z",
    };
    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="amplifica-investor-profile.pdf"'
    );
    expect(res.headers.get("cache-control")).toContain("no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });
});
