import { redirect } from "next/navigation";
import { createClient } from "./server";

/**
 * The authenticated caller, or a redirect to /login.
 *
 * Every protected page and every mutation opens the same three lines: build a
 * request-scoped client, ask who is calling, bounce anonymous callers. Written
 * out fourteen times, the rule was only ever as reliable as whoever remembered
 * to copy it — a new action that simply omitted it would have looked no
 * different from one that did not need it.
 *
 * `redirect` throws, so `user` is non-null to every caller past this line.
 *
 * Two callers deliberately do NOT use this and should not be folded in:
 * `app/page.tsx` redirects the caller who IS signed in, and
 * `loc/actions.ts::updateUtilization` leans on RLS rather than a check here.
 */
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
