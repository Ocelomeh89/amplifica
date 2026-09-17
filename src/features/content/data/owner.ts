import { notFound } from "next/navigation";
import { requireUser } from "@/shared/supabase/auth";
import { isContentOwner } from "@/features/content/engine/owner";

/**
 * requireUser(), then the owner check. Anyone signed in but not the owner
 * gets a 404, which reveals nothing about the page's existence.
 */
export async function requireContentOwner() {
  const { supabase, user } = await requireUser();
  if (!isContentOwner(user.id, process.env.CONTENT_OWNER_USER_ID)) notFound();
  return { supabase, user };
}
