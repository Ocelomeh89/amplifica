import type { TestView } from "@/features/content/data/test-lab/test-lab";
import Card from "@/shared/ui/Card";

const when = (t: TestView) => t.judged_at ?? t.closed_at ?? t.created_at;

/** Finished tests, newest first: the question, how it ended, and the conclusion when there is one. */
export default function PastTestsList({ tests }: { tests: TestView[] }) {
  if (tests.length === 0) return null;
  const sorted = [...tests].sort((a, b) => when(b).localeCompare(when(a)));
  return (
    <Card title="Past tests">
      <ul className="space-y-3">
        {sorted.map((t) => (
          <li key={t.id} className="text-sm">
            <p className="font-medium">{t.question}</p>
            {t.status === "judged" ? (
              <>
                <p>{t.verdict_line}</p>
                {t.conclusion && <p className="text-sub">{t.conclusion}</p>}
              </>
            ) : t.status === "skipped" ? (
              <p className="text-sub">Skipped{t.skip_reason ? `: ${t.skip_reason}` : ""}</p>
            ) : (
              <p className="text-sub">Not run{t.error ? `: ${t.error}` : ""}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
