// Optionality meter math. Progress = today's monthly income (STI interest +
// LTI coupons) as a share of the income projected for the optionality month
// (2026-11-14; was total cash flow).

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

export function optionalityProgress(current: number, atOptionality: number): number {
  if (!(atOptionality > 0)) return current > 0 ? 1 : 0;
  return clamp01(current / atOptionality);
}

// Hue 0 (red) → 60 (amber) → 120 (green).
export function meterColor(progress: number): string {
  return `hsl(${Math.round(clamp01(progress) * 120)} 70% 45%)`;
}
