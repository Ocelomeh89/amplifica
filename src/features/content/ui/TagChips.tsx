"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  TAG_LABELS,
  captionLength,
  coverSummary,
  isLowConfidence,
  type PostTags,
  type TagName,
} from "@/features/content/engine/tags";

type Chip = { key: string; label: string; filter: string | null; name: TagName | null };

function chipsFor(row: PostTags & { caption: string }): Chip[] {
  const out: Chip[] = [];
  const add = (name: TagName, value: string) => {
    if (value) out.push({ key: name, label: TAG_LABELS[value] ?? value, filter: `${name}:${value}`, name });
  };
  add("hook_type", row.hook_type);
  add("post_style", row.post_style);
  add("message", row.message);
  add("cta_type", row.cta_type);
  if (row.onscreen_text && row.onscreen_text !== "none") add("onscreen_text", row.onscreen_text);
  const cover = coverSummary(row);
  if (cover) {
    const first = row.cover_face ? "cover_face:true" : row.cover_text ? "cover_text:true" : row.cover_number ? "cover_number:true" : "cover_face:false";
    out.push({ key: "cover", label: `Cover: ${cover}`, filter: first, name: "cover_face" });
  }
  // Caption length is derived from the caption, so it shows on every post.
  const len = captionLength(row.caption);
  out.push({ key: "caption_length", label: `${TAG_LABELS[len] ?? len[0].toUpperCase() + len.slice(1)} caption`, filter: `caption_length:${len}`, name: null });
  return out;
}

function LockMark() {
  return (
    <svg aria-label="corrected" role="img" viewBox="0 0 16 16" className="inline-block w-3 h-3 ml-1 align-[-1px]" fill="currentColor">
      <path d="M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3Zm-1.5 3a1.5 1.5 0 1 1 3 0v2h-3V4Z" />
    </svg>
  );
}

export default function TagChips({ row }: { row: PostTags & { caption: string } }) {
  const params = useSearchParams();
  const chips = chipsFor(row);
  const tagged = chips.some((c) => c.key !== "caption_length");
  const hrefFor = (filter: string) => {
    const next = new URLSearchParams(params.toString());
    if (!next.getAll("tag").includes(filter)) next.append("tag", filter);
    return `?${next.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-1 min-w-[12rem]">
      {chips.map((c) => {
        const low = c.name !== null && isLowConfidence(row, c.name);
        const locked = c.name !== null && row.tag_locks.includes(c.name);
        return (
          <Link
            key={c.key}
            href={hrefFor(c.filter!)}
            scroll={false}
            className={clsx("text-xs px-2 py-0.5 rounded-full bg-edge/60 text-ink hover:bg-edge", low && "opacity-60")}
            title={low ? "Low confidence" : undefined}
          >
            {c.label}
            {low && <span aria-hidden> ?</span>}
            {locked && <LockMark />}
          </Link>
        );
      })}
      {!tagged && <span className="text-xs text-sub">tagging next Monday</span>}
    </div>
  );
}
