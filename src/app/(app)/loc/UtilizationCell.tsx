"use client";

import { useState } from "react";
import { updateUtilization } from "./actions";

export default function UtilizationCell({ id, value }: { id: string; value: number }) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-left hover:underline"
        title="Click to edit"
      >
        ${value.toLocaleString()}
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await updateUtilization(fd);
        setEditing(false);
      }}
      className="flex items-center gap-1"
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="utilization"
        type="number"
        autoFocus
        value={localValue}
        onChange={(e) => setLocalValue(Number(e.target.value))}
        step={100}
        min={0}
        className="w-24 border border-zinc-300 rounded px-1 py-0.5 text-sm"
      />
      <button type="submit" className="text-xs text-purple hover:underline">Save</button>
      <button
        type="button"
        onClick={() => { setLocalValue(value); setEditing(false); }}
        className="text-xs text-sub hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}
