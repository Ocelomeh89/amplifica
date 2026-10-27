import Link from "next/link";

export type RecreationItem = { ideaId: string; hook: string; status: string; multiplier: number | null };

const x = (v: number) => `${v.toFixed(2)}×`;

// Ideas made from this post. A result shows only once the idea was marked posted
// from the Queue and its post has a views number.
export default function RecreationsList({ items, sourceMultiplier }: { items: RecreationItem[]; sourceMultiplier: number | null }) {
  return (
    <div className="text-sm">
      {items.length === 0 ? (
        <p className="text-sub">Nothing recreated from this post yet.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((i) => (
            <li key={i.ideaId}>
              <Link href={`/content/ideas/${i.ideaId}`} className="text-purple hover:underline">
                {i.hook}
              </Link>{" "}
              <span className="text-sub">
                {i.status}
                {i.multiplier !== null && ` · ${x(i.multiplier)}${sourceMultiplier !== null ? ` vs ${x(sourceMultiplier)} for this post` : ""}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-sub">Results show for ideas marked as posted from the Queue.</p>
    </div>
  );
}
