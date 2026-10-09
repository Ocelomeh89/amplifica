import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Bearer check for the two routine endpoints. Constant-time compare so the
 * token cannot be guessed byte by byte. An unset secret authorizes nobody.
 */
export function isAuthorized(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length));
  const want = Buffer.from(secret);
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}

/**
 * The guard every /api/content endpoint opens with: bearer check, then the
 * owner id. Returns the owner, or the response to send back.
 */
export function authorizeRoutine(
  req: Request,
  secret: string | undefined
): { owner: string } | { response: NextResponse } {
  if (!isAuthorized(req, secret)) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const owner = process.env.CONTENT_OWNER_USER_ID;
  if (!owner) {
    return { response: NextResponse.json({ error: "CONTENT_OWNER_USER_ID is not set" }, { status: 500 }) };
  }
  return { owner };
}
