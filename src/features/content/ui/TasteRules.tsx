"use client";

import { useState } from "react";
import Link from "next/link";
import {
  addRuleAction,
  approveRuleAction,
  proposeRulesAction,
  rejectRuleAction,
  setRuleOnAction,
} from "@/features/content/data/taste-actions";
import type { NoteRow, RuleRow, TastePage } from "@/features/content/data/taste";

const btn = "min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50 disabled:cursor-not-allowed";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function NoteLine({ note }: { note: NoteRow }) {
  const what = note.source === "pass" ? `Pass: ${note.text}` : `${note.chips.join(", ") || "No chips"}${note.text ? ` — ${note.text}` : ""}`;
  return (
    <li className="text-sm">
      <span>{what}</span>
      {note.idea && note.idea_id && (
        <>
          {" · "}
          <Link href={`/content/ideas/${note.idea_id}`} className="text-purple hover:underline">
            {note.idea.hook || note.idea.title}
          </Link>
        </>
      )}
      <span className="text-sub"> · {day(note.created_at)}</span>
    </li>
  );
}

/** Runs a Server Action with a form of fields and keeps the busy flag and the error line for its caller. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: (fd: FormData) => Promise<{ error: string | null }>, fields: Record<string, string>, onDone?: () => void) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    setBusy(true);
    setError(null);
    try {
      const r = await action(fd);
      if (r.error) setError(r.error);
      else onDone?.();
    } catch {
      setError("Something went wrong. Nothing changed; try again.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

function ProposedRule({ rule }: { rule: RuleRow & { notes: NoteRow[] } }) {
  const { busy, error, run, setError } = useAction();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(rule.rule);
  return (
    <li className="border border-edge rounded-lg p-3 mb-3">
      {editing ? (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Rule text"
          maxLength={200}
          className="w-full min-h-11 border border-edge rounded px-3 text-sm bg-card"
        />
      ) : (
        <p className="font-medium">{rule.rule}</p>
      )}
      <p className="text-xs text-sub mt-1">{plural(rule.evidence_count, "note", "notes")} behind it</p>
      {rule.notes.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {rule.notes.map((n) => (
            <NoteLine key={n.id} note={n} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {editing ? (
          <>
            <button type="button" disabled={busy} className={btn} onClick={() => run(approveRuleAction, { id: rule.id, rule: text })}>
              Save and approve
            </button>
            <button type="button" className={btn} onClick={() => { setEditing(false); setText(rule.rule); setError(null); }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} className={btn} onClick={() => run(approveRuleAction, { id: rule.id })}>
              Approve
            </button>
            <button type="button" className={btn} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" disabled={busy} className={btn} onClick={() => run(rejectRuleAction, { id: rule.id })}>
              Reject
            </button>
          </>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}

function SwitchRule({ rule, on, notes }: { rule: RuleRow; on: boolean; notes?: NoteRow[] }) {
  const { busy, error, run } = useAction();
  return (
    <li className="border border-edge rounded-lg p-3 mb-3">
      <p className="font-medium">{rule.rule}</p>
      <p className="text-xs text-sub mt-1">
        {rule.origin === "manual" ? "Yours" : `${plural(rule.evidence_count, "note", "notes")} behind it`}
        {rule.last_evidence_at ? ` · last ${day(rule.last_evidence_at)}` : ""}
      </p>
      {notes && notes.length > 0 && (
        <ul className="mt-2 grid gap-1">
          {notes.map((n) => (
            <NoteLine key={n.id} note={n} />
          ))}
        </ul>
      )}
      <button type="button" disabled={busy} className={`${btn} mt-3`} onClick={() => run(setRuleOnAction, { id: rule.id, on: String(!on) })}>
        {on ? "Turn off" : "Turn on"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </li>
  );
}

function AddRule() {
  const { busy, error, run } = useAction();
  const [text, setText] = useState("");
  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Add a rule"
          placeholder="Add a rule of your own"
          maxLength={200}
          className="flex-1 min-h-11 border border-edge rounded px-3 text-sm bg-card"
        />
        <button type="button" disabled={busy || text.trim() === ""} className={btn} onClick={() => run(addRuleAction, { rule: text }, () => setText(""))}>
          Add rule
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function TasteRules({ page }: { page: TastePage }) {
  const propose = useAction();
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <p className="text-sm text-sub">
          {plural(page.waiting, "note", "notes")} waiting · {plural(page.proposalsLeft, "proposal", "proposals")} left today
        </p>
        <button
          type="button"
          disabled={propose.busy || page.waiting === 0}
          className={btn}
          onClick={() => propose.run(() => proposeRulesAction(), {})}
        >
          Propose rules
        </button>
        {propose.error && <p role="alert" className="text-sm text-red-600">{propose.error}</p>}
      </div>

      <h2 className="font-semibold mb-2">Proposed rules</h2>
      {page.proposed.length === 0 ? (
        <p className="text-sm text-sub mb-4">No proposed rules. They appear after 5 notes.</p>
      ) : (
        <ul className="mb-4">
          {page.proposed.map((r) => (
            <ProposedRule key={r.id} rule={r} />
          ))}
        </ul>
      )}

      <h2 className="font-semibold mb-2">Active rules</h2>
      {page.active.length === 0 ? (
        <p className="text-sm text-sub">No active rules yet.</p>
      ) : (
        <ul>
          {page.active.map((r) => (
            <SwitchRule key={r.id} rule={r} on notes={r.notes} />
          ))}
        </ul>
      )}
      <AddRule />

      {page.off.length > 0 && (
        <>
          <h2 className="font-semibold mt-6 mb-2">Turned off</h2>
          <ul>
            {page.off.map((r) => (
              <SwitchRule key={r.id} rule={r} on={false} />
            ))}
          </ul>
        </>
      )}

      <h2 className="font-semibold mt-6 mb-2">Notes</h2>
      {page.notes.length === 0 ? (
        <p className="text-sm text-sub">No notes yet. Sharpen or pass an idea to add one.</p>
      ) : (
        <ul className="grid gap-2">
          {page.notes.map((n) => (
            <NoteLine key={n.id} note={n} />
          ))}
        </ul>
      )}
    </div>
  );
}
