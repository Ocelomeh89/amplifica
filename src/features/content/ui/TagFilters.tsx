"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TAG_LABELS, type TagFilter } from "@/features/content/engine/tags";

const NAME_LABEL: Record<string, string> = {
  hook_type: "Hook",
  onscreen_text: "On-screen text",
  message: "Message",
  cta_type: "CTA",
  post_style: "Style",
  cover_face: "Cover face",
  cover_text: "Cover text",
  cover_number: "Cover number",
  caption_length: "Caption",
};

export default function TagFilters({ filters }: { filters: TagFilter[] }) {
  const params = useSearchParams();
  if (filters.length === 0) return null;
  const without = (drop: string | null) => {
    const next = new URLSearchParams(params.toString());
    next.delete("tag");
    for (const f of filters) {
      const item = `${f.name}:${f.value}`;
      if (item !== drop) next.append("tag", item);
    }
    const q = next.toString();
    return q ? `?${q}` : "?";
  };
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 text-sm" aria-label="Active filters">
      <span className="text-sub">Showing posts with</span>
      {filters.map((f) => {
        const item = `${f.name}:${f.value}`;
        const value = f.value === "true" ? "yes" : f.value === "false" ? "no" : TAG_LABELS[f.value] ?? f.value;
        return (
          <Link
            key={item}
            href={without(item)}
            scroll={false}
            aria-label={`Remove filter ${NAME_LABEL[f.name]} ${value}`}
            className="px-2 py-1 rounded-full bg-purple/10 text-purple hover:bg-purple/20"
          >
            {NAME_LABEL[f.name]}: {value} <span aria-hidden>×</span>
          </Link>
        );
      })}
      <Link href={without("*")} scroll={false} className="text-sub hover:text-ink underline">
        clear all
      </Link>
    </div>
  );
}
