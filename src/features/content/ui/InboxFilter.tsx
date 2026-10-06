import Link from "next/link";
import clsx from "clsx";
import { FORMATS, FORMAT_LABEL, type Format } from "@/features/content/engine/types";

type Counts = Record<Format | "all", number>;

// Type filter for the Inbox. Plain links to /content?format=..., so a filtered
// view can be bookmarked and nothing needs client state.
export default function InboxFilter({ active, counts }: { active: Format | null; counts: Counts }) {
  const chips: { key: Format | "all"; label: string; href: string }[] = [
    { key: "all", label: "All", href: "/content" },
    ...FORMATS.map((f) => ({ key: f, label: FORMAT_LABEL[f], href: `/content?format=${f}` })),
  ];
  return (
    <nav aria-label="Filter by type" className="flex flex-wrap gap-1.5 mb-3">
      {chips.map((c) => {
        const isActive = (active ?? "all") === c.key;
        const empty = counts[c.key] === 0 && !isActive;
        return (
          <Link
            key={c.key}
            href={c.href}
            aria-current={isActive ? "page" : undefined}
            className={clsx(
              "text-xs px-2.5 py-1 rounded-full border",
              isActive ? "bg-purple text-white border-purple" : "border-edge hover:bg-edge",
              empty && "opacity-50"
            )}
          >
            {c.label} <span className={isActive ? "text-white/80" : "text-sub"}>{counts[c.key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
