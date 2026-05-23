export function fmtCurrency(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${sign}$${(v / 1_000).toFixed(0)}k`;
  if (v >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}k`;
  return `${sign}$${v.toFixed(0)}`;
}

export function fmtMonth(month: string): string {
  // "2026-05" → "May '26"
  const [y, m] = month.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[Number(m) - 1]} '${y.slice(2)}`;
}
