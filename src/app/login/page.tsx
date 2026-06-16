import { login, requestMagicLink, requestPasswordReset } from "./actions";
import PasswordInput from "@/components/PasswordInput";
import Link from "next/link";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; sent?: string; reset?: string };
}) {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-cream">
      <div className="w-full max-w-md bg-white border border-zinc-200 rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-1">Log in to Amplifica</h1>
        <p className="text-sm text-sub mb-5">Engineer your future. Amplify your wealth. Live your way.</p>

        {searchParams.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-4">{searchParams.error}</p>
        )}
        {searchParams.sent && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-4">
            Magic link sent. Check your email.
          </p>
        )}
        {searchParams.reset && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-4">
            Password reset link sent. Check your email.
          </p>
        )}

        <form action={login} className="space-y-3">
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Email</span>
            <input name="email" type="email" required className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Password</span>
            <PasswordInput name="password" required autoComplete="current-password" />
          </label>
          <button type="submit" className="w-full bg-purple hover:bg-purple/90 transition-colors text-white text-sm py-2 rounded">Log in</button>
          <button
            type="submit"
            formAction={requestPasswordReset}
            formNoValidate
            className="w-full text-xs text-sub hover:text-ink transition-colors"
          >
            Forgot password? Send a reset link
          </button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <div className="flex-1 h-px bg-zinc-200" />
          <span className="text-xs text-sub">or</span>
          <div className="flex-1 h-px bg-zinc-200" />
        </div>

        <form action={requestMagicLink} className="space-y-3">
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Email for magic link</span>
            <input name="email" type="email" required className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" className="w-full bg-zinc-100 hover:bg-zinc-200 text-sm py-2 rounded">Send magic link</button>
        </form>

        <p className="text-sm text-sub mt-5">
          No account? <Link href="/signup" className="text-purple hover:underline">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
