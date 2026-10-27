import type { Figure } from "@/features/content/engine/post-figures";

// One row of figures. Direction is words ("2.7× above median"), never colour alone.
export default function PostFigures({ figures }: { figures: Figure[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {figures.map((f) => (
        <div key={f.label}>
          <dt className="text-xs text-sub">{f.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{f.value}</dd>
          {f.direction && <dd className="text-sm">{f.direction}</dd>}
          {f.versus && <dd className="text-xs text-sub">{f.versus}</dd>}
        </div>
      ))}
    </dl>
  );
}
