/**
 * The product gate for investment options, Amplicon splits and the fund check.
 * Only the user ids listed in INVESTMENTS_USER_IDS (comma-separated) see them.
 * RLS is still the security boundary; this decides who sees the feature at all.
 * An unset or empty env var opens it to nobody.
 */
export function canUseInvestments(
  userId: string | null | undefined,
  allowList: string | undefined = process.env.INVESTMENTS_USER_IDS
): boolean {
  if (!userId || !allowList) return false;
  return allowList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}
