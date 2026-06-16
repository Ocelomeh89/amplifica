"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createLoC } from "./actions";
import Card from "@/components/Card";
import Field from "@/components/Field";
import NumberInput from "@/components/NumberInput";

export default function NewLoCForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1 mb-4"
      >
        <Plus className="w-4 h-4" /> Add Line of Credit
      </button>
    );
  }

  return (
    <Card title="New Line of Credit">
      <form action={async (fd) => { await createLoC(fd); setOpen(false); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              name="name"
              required
              className="w-full border border-edge rounded px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Type">
            <select
              name="loc_type"
              required
              className="w-full border border-edge rounded px-2 py-1.5 text-sm"
              defaultValue="HELOC"
            >
              <option value="HELOC">HELOC</option>
              <option value="PLOC">PLOC</option>
            </select>
          </Field>
          <Field label="Size ($)">
            <NumberInput name="size" defaultValue={50000} min={0} step={1000} required />
          </Field>
          <Field label="Utilization ($)">
            <NumberInput name="utilization" defaultValue={0} min={0} step={1000} />
          </Field>
        </div>
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-1.5 rounded">
            Add
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
