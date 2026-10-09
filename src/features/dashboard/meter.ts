// Optionality meter math. Progress = today's monthly cash flow as a share of
// the cash flow projected for the optionality month (the spec's option A).

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

export function optionalityProgress(current: number, atOptionality: number): number {
  if (!(atOptionality > 0)) return current > 0 ? 1 : 0;
  return clamp01(current / atOptionality);
}

// Hue 0 (red) → 60 (amber) → 120 (green).
export function meterColor(progress: number): string {
  return `hsl(${Math.round(clamp01(progress) * 120)} 70% 45%)`;
}
