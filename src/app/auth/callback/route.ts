import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  // Only allow relative in-app redirects (e.g. /reset-password); default to dashboard.
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/dashboard";

  // GoTrue can redirect here with an error instead of a token.
  const providerError =
    url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(providerError)}`, url)
    );
  }

  const supabase = createClient();
  let authError: string | null = null;

  if (tokenHash && type) {
    // Token-hash flow: stateless, so it works even when the email link is
    // opened in a different browser/device than the one that requested it
    // (no PKCE code-verifier cookie required). This is the reliable path for
    // magic links and password-reset links.
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    authError = error?.message ?? null;
  } else if (code) {
    // PKCE flow: requires the code-verifier cookie set when the link was
    // requested, so it only completes in the same browser.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error?.message ?? null;
  } else {
    authError = "This sign-in link is missing its token or has expired. Request a new one.";
  }

  if (authError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(authError)}`, url)
    );
  }

  return NextResponse.redirect(new URL(next, url));
}
