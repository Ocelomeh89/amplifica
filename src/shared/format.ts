export function fmtCurrency(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const v = Math.abs(n);
  if (v >= 1_000_000) return `${sign}$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 10_000) return `${sign}$${(v / 1_000).toFixed(0)}k`;
  if (v >= 1_000) return `${sign}$${(v / 1_000).toFixed(1)}k`;
  return `${sign}$${v.toFixed(0)}`;
}

// Plain dollars with thousands separators, no k/M abbreviation (e.g. "$5,000").
export function fmtUSD0(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

export function fmtMUSD(usd: number): string {
  if (!isFinite(usd)) return "—";
  return `$${(usd / 1_000_000).toFixed(2)}M`;
}

export function fmtKUSD(usd: number): string {
  if (!isFinite(usd)) return "—";
  return `$${(usd / 1_000).toFixed(1)}k`;
}

export function fmtPct(decimal: number, fractionDigits = 1): string {
  return `${(decimal * 100).toFixed(fractionDigits)}%`;
}

export function fmtMonth(month: string): string {
  const [y, m] = month.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[Number(m) - 1]} '${y.slice(2)}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}, ${d.getFullYear()}`;
}

const CHICAGO_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// Narrow no-break space, emitted by newer ICU (72+) before AM/PM.
export const NNBSP = String.fromCharCode(0x202f);

// Replace narrow no-break spaces (U+202F) with plain spaces (U+0020).
// Newer ICU (72+) emits U+202F before AM/PM; this normalizes to plain space.
export function plainSpaces(s: string): string {
  return s.split(NNBSP).join(" ");
}

// "Sep 30, 3:42 PM" in Chicago time, the content engine's timezone. Newer ICU
// puts a narrow no-break space before AM/PM; normalize it to a plain space.
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return plainSpaces(CHICAGO_DATE_TIME.format(d));
}
