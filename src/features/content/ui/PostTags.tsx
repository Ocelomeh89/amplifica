"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TagChips from "./TagChips";
import TagEditor from "./TagEditor";
import type { PostTags as Tags } from "@/features/content/engine/tags";

// The post's tag chips (each links to Performance filtered by that tag) and the
// same correction editor the table uses.
export default function PostTags({ id, row }: { id: string; row: Tags & { caption: string } }) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <TagChips row={row} basePath="/content/performance" />
        <button
          type="button"
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
          className="min-h-11 px-2 text-sm text-purple hover:underline"
        >
          {editing ? "Close editor" : "Edit tags"}
        </button>
      </div>
      {editing && (
        <TagEditor
          id={id}
          row={row}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
