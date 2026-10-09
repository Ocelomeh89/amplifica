import { requireUser } from "@/shared/supabase/auth";
import { showContentNav } from "@/features/content/nav";
import Sidebar from "./Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const showContent = showContentNav(user.id);

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar email={user.email ?? ""} showContent={showContent} />
      <main className="flex-1 p-4 sm:p-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
