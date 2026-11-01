"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createAmplicon } from "@/features/amplicons/data/actions";
import Card from "@/shared/ui/Card";
import AmpliconFields from "./AmpliconFields";

export default function NewAmpliconForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1 mb-4"
      >
        <Plus className="w-4 h-4" /> Add Amplicon
      </button>
    );
  }

  return (
    <Card title="New Amplicon">
      <form action={async (fd) => { await createAmplicon(fd); setOpen(false); }} className="space-y-3">
        <AmpliconFields />
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-1.5 rounded">
            Add Amplicon
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm px-4 py-1.5 rounded text-sub hover:bg-edge"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
