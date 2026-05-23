interface Props {
  value: string;
  onChange: (s: string) => void;
}

export default function MonthInput({ value, onChange }: Props) {
  return (
    <input
      type="month"
      className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
