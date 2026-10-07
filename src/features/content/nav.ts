import { Sparkles } from "lucide-react";
import { isContentOwner } from "@/features/content/engine/owner";

// Sidebar registration. The layout renders this only for the content owner.
export const contentNavItem = {
  to: "/content",
  label: "Content",
  icon: Sparkles,
};

/** Whether the layout should show the sidebar entry. Keeps the owner env var inside the feature. */
export function showContentNav(userId: string | null | undefined): boolean {
  return isContentOwner(userId, process.env.CONTENT_OWNER_USER_ID);
}
