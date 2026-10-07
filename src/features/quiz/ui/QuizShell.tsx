import Link from "next/link";

// Same five-bar mark as the calculator header, with its own gradient id (ids
// must be unique per document).
function AmplitudeMark() {
  return (
    <svg width="30" height="26" viewBox="0 0 30 26" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="amp-mark-quiz" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#A88BE8" />
          <stop offset="100%" stopColor="#6C4BD3" />
        </linearGradient>
      </defs>
      <g fill="url(#amp-mark-quiz)">
        <rect x="0" y="23" width="4" height="3" rx="1" />
        <rect x="6.5" y="21" width="4" height="5" rx="1" />
        <rect x="13" y="18" width="4" height="8" rx="1" />
        <rect x="19.5" y="12" width="4" height="14" rx="1" />
        <rect x="26" y="2" width="4" height="24" rx="1" />
      </g>
    </svg>
  );
}

/** Page frame for the quiz and its results: logo header, one centered column. */
export default function QuizShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <header className="border-b border-edge bg-card">
        <div className="max-w-xl mx-auto px-4 py-3">
          <Link
            href="/"
            aria-label="Amplifica Wealth home"
            className="inline-flex items-center gap-2 min-h-[44px] hover:opacity-80 transition-opacity"
          >
            <AmplitudeMark />
            <span className="font-display text-lg leading-none">Amplifica</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-6">{children}</main>
      <footer className="border-t border-edge">
        <div className="max-w-xl mx-auto px-4 py-4 text-sm text-sub">
          Engineer your future. Amplify your wealth. Live your way.
        </div>
      </footer>
    </div>
  );
}
