const WHAT = { moment: "Your moment brief didn't work", swap: "The swap didn't work" } as const;

// A swap or moment job failed after the response: say so, since the page would otherwise
// just show the empty form again.
export default function RunErrors({ runs }: { runs: { kind: "moment" | "swap"; error: string }[] }) {
  if (runs.length === 0) return null;
  return (
    <div className="mb-4 space-y-1">
      {runs.map((r, i) => (
        <p key={i} role="alert" className="text-sm text-red-600">
          {WHAT[r.kind]}. {r.error || "Something went wrong."} Try again.
        </p>
      ))}
    </div>
  );
}
