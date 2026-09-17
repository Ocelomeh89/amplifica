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
