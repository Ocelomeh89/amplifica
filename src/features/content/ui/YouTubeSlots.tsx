import Link from "next/link";

// Later: fed by Instagram winners (spec Decision 9). Today the slots only show the top
// two of the YouTube queue, with no evidence behind them.
export default function YouTubeSlots({ items }: { items: { id: string; title: string }[] }) {
  return (
    <ul className="divide-y divide-edge">
      {[0, 1].map((i) => {
        const it = items[i];
        return (
          <li key={i} className="py-2 text-sm">
            <span className="font-medium">Video {i + 1}:</span>{" "}
            {it ? (
              <Link href={`/content/ideas/${it.id}`} className="text-purple hover:underline">
                {it.title}
              </Link>
            ) : (
              <span className="text-sub">empty</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
