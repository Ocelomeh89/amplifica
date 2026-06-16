import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PasswordInput from "@/components/PasswordInput";
import { updatePassword } from "./actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Reached via the recovery link (which sets a session through /auth/callback).
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-cream">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-1">Set a new password</h1>
        <p className="text-sm text-sub mb-5">Choose a new password for {user.email}.</p>

        {searchParams.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-4">
            {searchParams.error}
          </p>
        )}

        <form action={updatePassword} className="space-y-3">
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">New password</span>
            <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button
            type="submit"
            className="w-full bg-purple hover:bg-purple/90 transition-colors text-white text-sm py-2 rounded"
          >
            Update password
          </button>
        </form>
      </div>
    </main>
  );
}
