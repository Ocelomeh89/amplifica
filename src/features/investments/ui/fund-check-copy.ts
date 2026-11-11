import type { FundCheckResult } from "@/shared/finance/fund-check";
import { fmtMonth, fmtUSD0 } from "@/shared/format";

export interface FundCheckLine {
  tone: "red" | "amber" | "quiet";
  text: string;
}

// The fund check's words for the dashboard. No Amplicons, no lines.
export function fundCheckLines(r: FundCheckResult): FundCheckLine[] {
  if (r.months.length === 0) return [];
  const lines: FundCheckLine[] = [];
  if (r.status === "short-now") lines.push({ tone: "red", text: "Can't cover this month." });
  else if (r.status === "runs-out" && r.runOutMonth)
    lines.push({ tone: "amber", text: `Runs out of liquid money in ${fmtMonth(r.runOutMonth)}.` });
  else
    lines.push({
      tone: "quiet",
      text: `Liquid fund today ${fmtUSD0(r.liquidToday)}; at the end of the schedules (${fmtMonth(r.endMonth as string)}) ${fmtUSD0(r.liquidAtEnd)}.`,
    });
  if (r.unallocatedCount > 0) {
    const n = r.unallocatedCount;
    lines.push({ tone: "quiet", text: `${n} Amplicon${n === 1 ? "" : "s"} assumed in Default growth (10%).` });
  }
  return lines;
}
