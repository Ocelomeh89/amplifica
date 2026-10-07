// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "./middleware";

// With no Supabase env set, reaching createServerClient would throw. A public
// route that returns a plain pass-through proves the auth round-trip is skipped.
describe("updateSession on the public quiz routes", () => {
  it.each(["/quiz", "/quiz/r/11111111-2222-4333-8444-555555555555", "/quiz/r/x/pdf"])(
    "passes %s through without the auth round-trip",
    async (path) => {
      const res = await updateSession(new NextRequest(`http://localhost${path}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  );
});
