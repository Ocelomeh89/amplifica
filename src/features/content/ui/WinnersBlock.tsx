import type { WinnerInsights } from "@/features/content/engine/winners";

// What this post shares with Miguel's best posts, in plain sentences. The numbers
// are raw counts; the closing line says they are hints, because the sample is small.
export default function WinnersBlock({ insights }: { insights: WinnerInsights }) {
  if (insights.state === "untagged") {
    return <p className="text-sm text-sub">Not tagged yet. Tag this post to see what it shares with your winners.</p>;
  }
  if (insights.state === "thin") {
    return (
      <p className="text-sm text-sub">
        Needs {insights.need} tagged posts like this one. You have {insights.have}.
      </p>
    );
  }
  return (
    <div className="text-sm">
      <ul className="grid gap-1">
        {insights.shared.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {insights.message && <li>{insights.message}</li>}
        {insights.lacks && <li>{insights.lacks}</li>}
      </ul>
      <p className="mt-3 text-xs text-sub">{insights.caveat}</p>
    </div>
  );
}
