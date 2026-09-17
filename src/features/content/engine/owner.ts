/**
 * The product gate for /content: one user, named by CONTENT_OWNER_USER_ID.
 * RLS is still the security boundary; this decides who sees the page at all.
 * An unset or empty env var opens the page to nobody.
 */
export function isContentOwner(
  userId: string | null | undefined,
  ownerId: string | undefined
): boolean {
  return Boolean(userId) && Boolean(ownerId) && userId === ownerId;
}
