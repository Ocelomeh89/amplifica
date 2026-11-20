import { requireUser } from "@/shared/supabase/auth";
import { showContentNav } from "@/features/content/nav";
import { canUseInvestments } from "@/shared/investments-access";
import { viewingAsEveryone } from "@/shared/view-mode";
import Sidebar from "./Sidebar";
import ViewToggle from "./ViewToggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const allowListed = canUseInvestments(user.id);
  // Only allow-listed users can switch views; for anyone else the cookie is ignored.
  const everyone = allowListed && viewingAsEveryone();
  const showContent = showContentNav(user.id) && !everyone;
  const showInvestments = allowListed && !everyone;

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar email={user.email ?? ""} showContent={showContent} showInvestments={showInvestments} />
      <main className="flex-1 p-4 sm:p-8 overflow-x-hidden">
        {allowListed && <ViewToggle everyone={everyone} />}
        {children}
      </main>
    </div>
  );
}
