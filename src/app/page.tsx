import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Interim landing: until a public homepage ships, the domain's best public
  // asset is the calculator. Members go straight to their dashboard.
  redirect(user ? "/dashboard" : "/calculator");
}
