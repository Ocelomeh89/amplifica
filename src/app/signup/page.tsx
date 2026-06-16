import { signup } from "./actions";
import PasswordInput from "@/components/PasswordInput";
import Link from "next/link";

export default function SignupPage({ searchParams }: { searchParams: { error?: string; sent?: string } }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-8 bg-cream">
      <div className="w-full max-w-md bg-card border border-edge rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-1">Create your account</h1>
        <p className="text-sm text-sub mb-5">The Amplifier is single-tenant per user.</p>

        {searchParams.error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-4">{searchParams.error}</p>
        )}
        {searchParams.sent && (
          <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 mb-4">
            Confirmation email sent. Check your inbox.
          </p>
        )}

        <form action={signup} className="space-y-3">
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Email</span>
            <input name="email" type="email" required className="w-full border border-edge rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Password</span>
            <PasswordInput name="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button type="submit" className="w-full bg-purple hover:bg-purple/90 transition-colors text-white text-sm py-2 rounded">Sign up</button>
        </form>

        <p className="text-sm text-sub mt-5">
          Already have an account? <Link href="/login" className="text-purple hover:underline">Log in</Link>
        </p>
      </div>
    </main>
  );
}
