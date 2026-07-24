"use client";

import { useFormState, useFormStatus } from "react-dom";
import { captureLead, type CaptureLeadState } from "./actions";

const initialState: CaptureLeadState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-purple hover:bg-purple/90 transition-colors text-white text-sm py-2 rounded disabled:opacity-60"
    >
      {pending ? "Unlocking…" : "Unlock the calculator"}
    </button>
  );
}

interface Utm {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export default function EmailGate({ utm }: { utm: Utm }) {
  const [state, formAction] = useFormState(captureLead, initialState);

  return (
    <div className="w-full max-w-md mx-auto bg-card border border-edge rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-1">Try the flywheel calculator</h2>
      <p className="text-sm text-sub mb-5">
        See how the flywheel compounds: model your monthly savings, line of credit,
        and income investments, and find your financial optionality date. Enter your
        email to unlock the full simulator.
      </p>

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
          <span className="block text-[11px] text-sub uppercase tracking-wide mb-1">Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full border border-edge rounded px-2 py-1.5 text-sm"
          />
        </label>
        <SubmitButton />
      </form>

      <p className="text-xs text-sub mt-4">
        No spam. You&apos;ll get the free weekly letter; unsubscribe anytime.
      </p>
    </div>
  );
}
