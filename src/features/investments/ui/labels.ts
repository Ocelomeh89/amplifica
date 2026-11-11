import type { OptionType } from "@/shared/finance/fund-check";

export const TYPE_LABEL: Record<OptionType, string> = {
  amortized: "Amortized",
  interest_only: "Interest-only",
  appreciation: "Appreciation",
};

export const TYPE_HINT: Record<OptionType, string> = {
  amortized: "Pays principal and interest back over its term, like a note.",
  interest_only: "Pays its rate as income; the principal comes back at the end of the term (never, if infinite). E.g. a rental.",
  appreciation: "No income; the value compounds and gets sold to cover payments. E.g. an index fund.",
};

export function fmtTerm(termMonths: number | null): string {
  return termMonths == null ? "Infinite" : `${termMonths} mo`;
}

export const inputCls = "w-full border border-edge rounded px-2 py-1.5 text-sm";
export const primaryBtn = "bg-purple hover:bg-purple/90 transition-colors text-white text-sm px-4 py-1.5 rounded";
export const ghostBtn = "text-sm px-4 py-1.5 rounded text-sub hover:bg-edge";
