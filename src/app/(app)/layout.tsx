import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar email={user.email ?? ""} />
      <main className="flex-1 p-4 sm:p-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
