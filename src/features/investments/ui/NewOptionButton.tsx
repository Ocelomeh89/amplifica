"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import Card from "@/shared/ui/Card";
import OptionForm from "./OptionForm";

export default function NewOptionButton() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1 mb-4"
      >
        <Plus className="w-4 h-4" /> Add investment option
      </button>
    );
  }
  return (
    <Card title="New investment option">
      <OptionForm onDone={() => setOpen(false)} />
    </Card>
  );
}
