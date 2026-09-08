export default function NumberInput({
  name,
  defaultValue,
  step,
  min,
  required,
}: {
  name: string;
  defaultValue?: number;
  step?: number;
  min?: number;
  required?: boolean;
}) {
  return (
    <input
      name={name}
      type="number"
      step={step ?? "any"}
      min={min}
      defaultValue={defaultValue}
      required={required}
      className="w-full border border-edge rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}
