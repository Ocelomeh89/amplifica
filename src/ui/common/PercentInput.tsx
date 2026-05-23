interface Props {
  value: number; // decimal (0.08)
  onChange: (n: number) => void;
}

export default function PercentInput({ value, onChange }: Props) {
  return (
    <div className="flex items-center">
      <input
        type="number"
        step={0.1}
        min={0}
        className="w-full border border-zinc-300 rounded-l px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={(value * 100).toFixed(2)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
      />
      <span className="px-2 py-1.5 bg-zinc-100 border border-l-0 border-zinc-300 rounded-r text-sm text-sub">%</span>
    </div>
  );
}
