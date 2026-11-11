import Link from "next/link";
import type { FundCheckResult } from "@/shared/finance/fund-check";
import { fundCheckLines } from "./fund-check-copy";

const TONE = { red: "text-red-600 font-semibold", amber: "text-amber-700 font-semibold", quiet: "text-sub" } as const;

// Beside the projection: can the real fund cover every Amplicon payment?
// Warning-only; it changes no projection number.
export default function FundCheckCard({ result }: { result: FundCheckResult }) {
  const lines = fundCheckLines(result);
  if (lines.length === 0) return null;
  return (
    <div className="mb-4 rounded-lg border border-edge bg-card p-3 text-xs space-y-1">
      <p className="text-[10px] text-sub uppercase tracking-wide font-semibold">
        Fund check ·{" "}
        <Link href="/investment-options" className="normal-case tracking-normal text-purple hover:underline">
          Investment options
        </Link>
      </p>
      {lines.map((l) => (
        <p key={l.text} className={TONE[l.tone]}>
          {l.text}
        </p>
      ))}
    </div>
  );
}
