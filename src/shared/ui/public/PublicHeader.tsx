import Link from "next/link";
import { COMMUNITY_URL, NEWSLETTER_URL, SIGN_IN_URL } from "@/shared/links";
import AmplitudeMark from "./AmplitudeMark";
import SocialLinks from "./SocialLinks";

const NAV_LINK = "text-white/80 hover:text-white transition-colors";

/** Plum bar shared by the public pages; the logged-in app uses the sidebar instead. */
export default function PublicHeader() {
  return (
    <header className="bg-plum text-white">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <Link
          href="/"
          aria-label="Amplifica Wealth home"
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
        >
          <AmplitudeMark id="amp-mark-header" size={26} />
          <span className="font-display text-lg leading-none">Amplifica Wealth</span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-5 text-sm">
          <Link href="/calculator" className={`${NAV_LINK} hidden sm:inline`}>
            Calculator
          </Link>
          <a href={NEWSLETTER_URL} className={`${NAV_LINK} hidden sm:inline`}>
            Newsletter
          </a>
          <a href={COMMUNITY_URL} className={`${NAV_LINK} hidden md:inline`}>
            Community
          </a>
          <SocialLinks tone="onPlum" />
          <a href={SIGN_IN_URL} className="text-amethyst hover:text-white transition-colors">
            Sign in
          </a>
        </nav>
      </div>
    </header>
  );
}
