// Deliberately unlinked. Inside the (app) group, so the layout's
// redirect("/login") gates it; absent from the sidebar, robots and sitemap,
// so only someone logged in who has the link arrives here.
//
// The whole tool runs client-side — the comparison engine is pure, with no
// Next or Supabase imports anywhere beneath src/lib/compare.

import CompareClient from "@/components/compare/CompareClient";

export const metadata = {
  title: "Compare investments",
  robots: { index: false, follow: false },
};

export default function ComparePage() {
  return <CompareClient />;
}
