import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Safety net for the magic-link / OAuth code exchange. Supabase can land an
  // auth `code` (or an `error`) on a route other than /auth/callback — most
  // commonly when it falls back to the Site URL because the redirect target
  // wasn't allow-listed. Without this, the code is never exchanged and the
  // visitor is stranded on a logged-out page (e.g. the home screen). Forward
  // it to /auth/callback so the session actually gets established.
  if (pathname !== "/auth/callback") {
    const code = searchParams.get("code");
    if (code) {
      const callbackUrl = new URL("/auth/callback", request.url);
      callbackUrl.searchParams.set("code", code);
      const next = searchParams.get("next");
      if (next && next.startsWith("/")) callbackUrl.searchParams.set("next", next);
      return NextResponse.redirect(callbackUrl);
    }
    const authError = searchParams.get("error_description") ?? searchParams.get("error");
    if (authError) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", authError);
      return NextResponse.redirect(loginUrl);
    }
  }

  // /calculator is intentionally public (email-gated lead-gen simulator).
  // Skip the auth round-trip entirely; session refresh happens on any other
  // route, so logged-in visitors lose nothing.
  if (pathname.startsWith("/calculator")) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/amplicons") ||
    pathname.startsWith("/loc") ||
    pathname.startsWith("/projections") ||
    pathname.startsWith("/settings");
  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
