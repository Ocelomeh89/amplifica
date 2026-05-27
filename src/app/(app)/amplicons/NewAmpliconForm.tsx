"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createAmplicon } from "./actions";
import Card from "@/components/Card";
import Field from "@/components/Field";
import NumberInput from "@/components/NumberInput";

export default function NewAmpliconForm() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-ink text-white text-sm px-3 py-1.5 rounded inline-flex items-center gap-1 mb-4"
      >
        <Plus className="w-4 h-4" /> Add Amplicon
      </button>
    );
  }

  return (
    <Card title="New Amplicon">
      <form action={async (fd) => { await createAmplicon(fd); setOpen(false); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input
              name="name"
              required
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Type" hint="e.g. Real Estate Note, Trust Deed">
            <input
              name="ai_type"
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Face value ($)">
            <NumberInput name="face_value" defaultValue={25000} min={0} step={1000} required />
          </Field>
          <Field label="Term (months)">
            <NumberInput name="term_months" defaultValue={36} min={1} step={1} required />
          </Field>
          <Field label="Annual interest (%)">
            <NumberInput name="interest_pct" defaultValue={8} min={0} step={0.1} required />
          </Field>
          <Field label="Start date">
            <input
              name="start_date"
              type="date"
              required
              className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
            />
          </Field>
        </div>
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-ink text-white text-sm px-4 py-1.5 rounded">
            Add Amplicon
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm px-4 py-1.5 rounded text-sub hover:bg-zinc-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
