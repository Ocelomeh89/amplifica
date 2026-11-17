"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readResultAction, saveNumbersAction, skipTestAction } from "@/features/content/data/test-lab/test-lab-actions";
import type { TestView, VersionRow } from "@/features/content/data/test-lab/test-lab";
import { topicLabel } from "@/features/content/engine/brand";
import { valueLabel } from "@/features/content/engine/experiments";
import { POSTING_NOTE } from "@/features/content/engine/test-lab-card";
import { PROMOTE_LINE } from "@/features/content/engine/test-lab-verdict";
import Card from "@/shared/ui/Card";

// The open test: the question, the two versions, what to record, and where the numbers go. After the verdict the same
// card shows each version's first-day numbers, the winner and the conclusion.

const btn = "min-h-11 px-4 rounded-lg border border-edge bg-card text-sm hover:bg-edge/60 disabled:opacity-50 disabled:cursor-not-allowed";
const input = "min-h-11 w-full rounded-lg border border-edge bg-card px-3 text-sm";

const DIFFERENCE: Record<string, string> = {
  opening: "Only the hook type differs: the opening line. The body and the card are the same.",
  card: "Only the on-screen card differs. Everything spoken is the same.",
  topic: "Only the topic differs. The hook type and the form are the same.",
};

const count = (n: number | null, noun: string) => (n === null ? null : `${n.toLocaleString("en-US")} ${noun}`);

type Notes = { record_once?: string; record_twice?: string; cuts?: string };

function NumbersForm({ testId, v }: { testId: string; v: VersionRow }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("testId", testId);
    fd.set("label", v.label);
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await saveNumbersAction(fd);
      if (r.error) setError(r.error);
      else {
        setMessage(r.message ?? "Saved.");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Nothing changed; try again.");
    } finally {
      setBusy(false);
    }
  }
  const id = (name: string) => `${name}-${v.label}`;
  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <p className="text-xs text-sub">Read these a day after posting.</p>
      <div className="grid grid-cols-3 gap-2">
        {(["views", "saves", "shares"] as const).map((name) => (
          <div key={name}>
            <label htmlFor={id(name)} className="block text-xs text-sub mb-1">{name === "views" ? "Views" : name === "saves" ? "Saves" : "Shares"}</label>
            <input id={id(name)} name={name} type="number" inputMode="numeric" min={0} step={1} defaultValue={v[`typed_${name}`] ?? ""} className={input} />
          </div>
        ))}
      </div>
      <div>
        <label htmlFor={id("link")} className="block text-xs text-sub mb-1">Link (optional)</label>
        <input id={id("link")} name="link" type="url" defaultValue={v.link} className={input} />
      </div>
      <button type="submit" disabled={busy} className={btn}>{busy ? "Saving…" : `Save numbers for ${v.label.toUpperCase()}`}</button>
      {message && <p role="status" className="text-sm text-sub">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function Version({ test, v, labelOf }: { test: TestView; v: VersionRow; labelOf: (value: string) => string }) {
  const judged = test.status === "judged";
  const won = judged && test.verdict === v.label;
  const outline = Array.isArray(v.outline) ? (v.outline as string[]) : [];
  const figures = [count(v.views_24h, "views"), count(v.saves_24h, "saves"), count(v.shares_24h, "shares")].filter(Boolean);
  return (
    <div className="border border-edge rounded-lg p-3">
      <h3 className="font-semibold text-sm">{`Version ${v.label.toUpperCase()}: ${labelOf(v.value)}`}</h3>
      {won && <p className="text-sm font-medium text-purple">Winner</p>}
      <p className="mt-2 text-sm">{v.hook}</p>
      <p className="mt-1 text-xs text-sub">{v.card_text === "" ? "No card" : "Card:"}</p>
      {v.card_text !== "" && <p className="text-sm">{v.card_text}</p>}
      <ol className="mt-2 list-decimal pl-5 text-sm space-y-1">
        {outline.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      {judged && figures.length > 0 && (
        <ul className="mt-3 text-sm space-y-0.5">
          {figures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {judged && v.promote && <p className="mt-2 text-sm font-medium">{PROMOTE_LINE}</p>}
      {test.status === "open" && <NumbersForm testId={test.id} v={v} />}
    </div>
  );
}

function ReadResult({ test }: { test: TestView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("testId", test.id);
    setBusy(true);
    setError(null);
    try {
      const r = await readResultAction(fd);
      if (r.error) setError(r.error);
      else router.refresh();
    } catch {
      setError("Something went wrong. Nothing changed; try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-4">
      <p className="text-sm font-medium">Both numbers are in. Check them before you read the result: it cannot be undone.</p>
      <ul className="text-sm mt-1">
        {test.versions.map((v) => (
          <li key={v.id}>{`${v.label.toUpperCase()}: ${(v.typed_views ?? 0).toLocaleString("en-US")} views`}</li>
        ))}
      </ul>
      <button type="submit" disabled={busy} className={`${btn} mt-2`}>{busy ? "Reading…" : "Read the result"}</button>
      {error && <p role="alert" className="text-sm text-red-600 mt-1">{error}</p>}
    </form>
  );
}

function SkipForm({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", id);
    setBusy(true);
    setError(null);
    try {
      const r = await skipTestAction(fd);
      if (r.error) setError(r.error);
      else router.refresh();
    } catch {
      setError("Something went wrong. Nothing changed; try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2">
      <div className="grow min-w-48">
        <label htmlFor={`skip-${id}`} className="block text-xs text-sub mb-1">Why skip it?</label>
        <input id={`skip-${id}`} name="reason" maxLength={200} className={input} />
      </div>
      <button type="submit" disabled={busy} className={btn}>Skip this test</button>
      {error && <p role="alert" className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}

export default function TestCard({ test, labels }: { test: TestView; labels: Record<string, string> }) {
  const labelOf = (value: string) => (test.variable === "topic" ? (labels[value] ?? topicLabel(value)) : valueLabel(value));
  const notes = (test.notes ?? {}) as Notes;
  const judged = test.status === "judged";
  return (
    <Card title={judged ? "Latest result" : "Open test"}>
      <h2 className="text-lg font-semibold">{test.question}</h2>
      <p className="text-sm text-sub mt-1">{test.reason}</p>
      {test.why && <p className="text-sm mt-2">{test.why}</p>}
      <p className="text-sm mt-2">{DIFFERENCE[test.kind ?? ""] ?? ""}</p>

      <div className="grid gap-3 md:grid-cols-2 mt-3">
        {test.versions.map((v) => (
          <Version key={v.id} test={test} v={v} labelOf={labelOf} />
        ))}
      </div>

      {judged && (
        <div className="mt-4">
          <p className="text-sm font-medium">{test.verdict_line}</p>
          {test.conclusion && <p className="text-sm mt-1">{test.conclusion}</p>}
        </div>
      )}

      {!judged && (
        <div className="mt-4 text-sm space-y-1">
          {notes.record_once && <p>{notes.record_once}</p>}
          {notes.record_twice && <p>{notes.record_twice}</p>}
          {notes.cuts && <p>{notes.cuts}</p>}
          <p className="text-sub">{POSTING_NOTE}</p>
        </div>
      )}

      {test.status === "open" && test.versions.length === 2 && test.versions.every((v) => v.typed_views !== null) && <ReadResult test={test} />}
      {test.status === "open" && <SkipForm id={test.id} />}
    </Card>
  );
}
