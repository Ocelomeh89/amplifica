"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/content", label: "Inbox" },
  { href: "/content/queue", label: "Queues" },
  { href: "/content/sources", label: "Sources" },
];

// The pages under /content share one row of tabs. Performance, Week, and
// Taste are added by later PRs.
export default function ContentTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 mb-4 border-b border-edge">
      {TABS.map((t) => {
        const active = t.href === "/content" ? pathname === "/content" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "px-3 py-2 text-sm -mb-px border-b-2",
              active ? "border-purple text-purple font-medium" : "border-transparent text-sub hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
