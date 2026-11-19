"use client";

import { useFormState, useFormStatus } from "react-dom";
import { registerForWebinar, type RegisterState } from "@/features/webinar/data/actions";
import { WEBINAR } from "@/features/webinar/event";

const initialState: RegisterState = { error: null, done: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-purple hover:bg-purple/90 transition-colors text-white text-sm py-2 rounded disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save my seat"}
    </button>
  );
}

interface Utm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export default function WebinarSignup({ utm }: { utm: Utm }) {
  const [state, formAction] = useFormState(registerForWebinar, initialState);

  if (state.done) {
    return (
      <div role="status" className="w-full max-w-md bg-card border border-edge rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-1">You&apos;re registered</h2>
        <p className="text-sm text-sub">
          {WEBINAR.when}. We&apos;ll email you the link before we start.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-card border border-edge rounded-lg p-6">
      {state.error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-4">{state.error}</p>
      )}

      <form action={formAction} className="space-y-3">
        {/* Honeypot: hidden from humans; bots that fill it are silently dropped. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <input type="hidden" name="utm_source" value={utm.utm_source ?? ""} />
        <input type="hidden" name="utm_medium" value={utm.utm_medium ?? ""} />
        <input type="hidden" name="utm_campaign" value={utm.utm_campaign ?? ""} />

        <label className="block">
          <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Name</span>
          <input
            name="name"
            type="text"
            required
            autoComplete="name"
            maxLength={200}
            className="w-full border border-edge rounded px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full border border-edge rounded px-2 py-1.5 text-sm"
          />
        </label>
        <SubmitButton />
      </form>

      <p className="text-xs text-sub mt-4">
        You&apos;ll also get the free weekly letter. Unsubscribe anytime.
      </p>
    </div>
  );
}
