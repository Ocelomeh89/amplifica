import { cookies } from "next/headers";
import { canUseInvestments } from "./investments-access";

// "View as everyone else": an allow-listed user can flip a cookie to see the app
// the way users outside INVESTMENTS_USER_IDS see it. Display only; RLS and data
// are untouched, and the cookie grants nothing to a user who isn't allow-listed.
export const VIEW_COOKIE = "amp_view";

export function viewingAsEveryone(): boolean {
  return cookies().get(VIEW_COOKIE)?.value === "everyone";
}

/** Whether investment options, splits and the fund check are on for this request. */
export function investmentsOn(userId: string | null | undefined): boolean {
  return canUseInvestments(userId) && !viewingAsEveryone();
}
