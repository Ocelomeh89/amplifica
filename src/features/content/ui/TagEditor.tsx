"use client";

import { useState, useTransition } from "react";
import { saveTagCorrection } from "@/features/content/data/tag-actions";
import {
  CTA_TYPES,
  HOOK_TYPES,
  MESSAGES,
  ONSCREEN_TEXT,
  POST_STYLES,
  TAG_LABELS,
  type PostTags,
} from "@/features/content/engine/tags";

const SELECTS = [
  { name: "hook_type", label: "Hook type", list: HOOK_TYPES },
  { name: "post_style", label: "Post style", list: POST_STYLES },
  { name: "message", label: "Message", list: MESSAGES },
  { name: "cta_type", label: "Call to action", list: CTA_TYPES },
  { name: "onscreen_text", label: "On-screen text", list: ONSCREEN_TEXT },
] as const;
const COVERS = [
  { name: "cover_face", label: "Face on cover" },
  { name: "cover_text", label: "Text on cover" },
  { name: "cover_number", label: "Number on cover" },
] as const;
const input = "w-full rounded-lg border border-edge bg-card px-2 py-1.5 text-sm";

const yesNo = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "");

export default function TagEditor({ id, row, onDone }: { id: string; row: PostTags; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      const r = await saveTagCorrection(fd);
      setError(r.error);
      if (!r.error) onDone();
    });
  return (
    <form action={submit} className="grid gap-3 sm:grid-cols-3 py-3">
      <input type="hidden" name="id" value={id} />
      {SELECTS.map((s) => {
        const value = row[s.name];
        return (
          <label key={s.name} className="text-sm">
            <span className="block text-sub mb-1">{s.label}</span>
            <input type="hidden" name={`orig_${s.name}`} value={value} />
            <select name={s.name} defaultValue={value} className={input}>
              <option value="">Not tagged</option>
              {s.list.map((v) => (
                <option key={v} value={v}>
                  {TAG_LABELS[v]}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      {COVERS.map((c) => (
        <label key={c.name} className="text-sm">
          <span className="block text-sub mb-1">{c.label}</span>
          <input type="hidden" name={`orig_${c.name}`} value={yesNo(row[c.name])} />
          <select name={c.name} defaultValue={yesNo(row[c.name])} className={input}>
            <option value="">Not tagged</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      ))}
      <label className="text-sm sm:col-span-3">
        <span className="block text-sub mb-1">Spoken hook</span>
        <input type="hidden" name="orig_hook_spoken" value={row.hook_spoken} />
        <input name="hook_spoken" defaultValue={row.hook_spoken} maxLength={500} className={input} />
      </label>
      <label className="text-sm sm:col-span-3">
        <span className="block text-sub mb-1">On-screen hook</span>
        <input type="hidden" name="orig_hook_onscreen" value={row.hook_onscreen} />
        <input name="hook_onscreen" defaultValue={row.hook_onscreen} maxLength={500} className={input} />
      </label>
      <div className="sm:col-span-3 flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-purple text-white px-3 py-1.5 text-sm disabled:opacity-60">
          {pending ? "Saving…" : "Save and lock"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-sub hover:text-ink">
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-sm text-red-600">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
