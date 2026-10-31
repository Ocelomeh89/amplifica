import Link from "next/link";
import { COMMUNITY_URL, NEWSLETTER_URL, SIGN_IN_URL } from "@/shared/links";
import SocialLinks from "./SocialLinks";

export default function PublicFooter() {
  return (
    <footer className="border-t border-edge">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-sm">
            Engineer your future. Amplify your wealth. Live your way.
          </span>
          <div className="flex flex-wrap items-center gap-6">
            <nav aria-label="Footer" className="flex gap-6 text-sm text-sub">
              <Link href="/calculator" className="hover:text-purple">Calculator</Link>
              <a href={NEWSLETTER_URL} className="hover:text-purple">Newsletter</a>
              <a href={COMMUNITY_URL} className="hover:text-purple">Community</a>
              <a href={SIGN_IN_URL} className="hover:text-purple">Sign in</a>
            </nav>
            <SocialLinks tone="onCream" />
          </div>
        </div>
        <p className="text-xs text-sub max-w-3xl">
          © 2026 Amplifica Wealth. Educational publisher, not a registered
          investment adviser. Nothing here is financial, legal, or tax advice, and
          no return is promised or implied. Borrowing to invest involves real risk,
          including the loss of borrowed principal.
        </p>
      </div>
    </footer>
  );
}
