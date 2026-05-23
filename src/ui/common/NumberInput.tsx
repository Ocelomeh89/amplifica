interface Props {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  placeholder?: string;
}

export default function NumberInput({ value, onChange, step = 1, min, placeholder }: Props) {
  return (
    <input
      type="number"
      className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      value={Number.isFinite(value) ? value : ""}
      step={step}
      min={min}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
    />
  );
}
