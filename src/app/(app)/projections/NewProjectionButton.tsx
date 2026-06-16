"use client";

import { Plus } from "lucide-react";
import { createProjection } from "./actions";

export default function NewProjectionButton() {
  return (
    <form action={createProjection}>
      <button
        type="submit"
        className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1 mb-4"
      >
        <Plus className="w-4 h-4" /> New projection
      </button>
    </form>
  );
}
