"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/shared/supabase/auth";
import { canUseInvestments } from "@/shared/investments-access";
import { VIEW_COOKIE } from "@/shared/view-mode";

// Switch between "My view" and "Everyone else". Only allow-listed users can set it.
export async function setViewMode(fd: FormData) {
  const { user } = await requireUser();
  if (!canUseInvestments(user.id)) return;
  if (fd.get("mode") === "everyone") {
    cookies().set(VIEW_COOKIE, "everyone", { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 30 });
  } else {
    cookies().delete(VIEW_COOKIE);
  }
  revalidatePath("/", "layout");
}
