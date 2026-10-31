import Link from "next/link";
import type { BriefView } from "@/features/content/data/today";
import { VERDICT_LABEL, testInWords } from "./BriefCard";

const times = (n: unknown) => (typeof n === "number" ? `${n.toFixed(2)}×` : "no figure");

export default function VerdictsList({ items }: { items: BriefView[] }) {
  if (items.length === 0) return <p className="text-sm text-sub">No verdicts this week. A brief is judged a week after you post it.</p>;
  return (
    <ul className="divide-y divide-edge">
      {items.map((b) => {
        const m = b.judge_metrics as { multiplier?: number; n_saves?: number | null; n_watch?: number | null; reason?: string };
        return (
          <li key={b.id} className="py-2 text-sm">
            <span className="font-semibold">{b.verdict ? VERDICT_LABEL[b.verdict] : "Unjudged"}</span> · {testInWords(b)}
            <span className="block text-sub">
              {b.verdict ? `Views ${times(m.multiplier)} · Saves ${times(m.n_saves)} · Watch time ${times(m.n_watch)}` : m.reason}
              {b.post_id && (
                <>
                  {" · "}
                  <Link href={`/content/performance/${b.post_id}`} className="text-purple hover:underline">
                    See the post
                  </Link>
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
