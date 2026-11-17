// Everything the fund check needs, read with the caller's RLS-scoped client.
// A table that is missing (migration 0019 not yet applied) reads as empty, so
// the dashboard keeps working before the migration lands.

import type { createClient } from "@/shared/supabase/server";
import { isoToYearMonth, type YearMonth } from "@/shared/finance/dates";
import { groupSplits } from "@/shared/splits";
import {
  DEFAULT_GROWTH_ID,
  type FundAmplicon,
  type FundCheckInput,
  type FundOption,
} from "@/shared/finance/fund-check";

type Client = ReturnType<typeof createClient>;

export interface FundData extends FundCheckInput {
  /** References per option id: splits + moves + check-ins. Delete is blocked above 0. */
  optionUsage: Record<string, number>;
  /** Latest check-in month per option id (incl. DEFAULT_GROWTH_ID). */
  lastCheckin: Record<string, YearMonth>;
}

const idOf = (id: string | null) => id ?? DEFAULT_GROWTH_ID;

export async function loadFundCheckInput(supabase: Client, today: YearMonth): Promise<FundData> {
  const [opts, versions, splits, allocs, moves, checkins, amps] = await Promise.all([
    supabase.from("investment_options").select("id, name").order("name"),
    supabase.from("investment_option_versions").select("*"),
    supabase.from("amplicon_splits").select("id, seq, amplicon_id, created_at"),
    supabase.from("amplicon_allocations").select("split_id, investment_option_id, pct"),
    supabase.from("fund_moves").select("*").order("move_month"),
    supabase.from("holding_checkins").select("*").order("checkin_month").order("created_at"),
    supabase.from("amplicons").select("id, face_value, interest_pct, term_months, start_date, income_type"),
  ]);

  const options: FundOption[] = (opts.data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    versions: (versions.data ?? [])
      .filter((v) => v.option_id === o.id)
      .map((v) => ({
        effectiveMonth: isoToYearMonth(v.effective_month),
        optionType: v.option_type,
        ratePct: Number(v.rate_pct),
        termMonths: v.term_months == null ? null : Number(v.term_months),
        liquid: v.liquid,
      })),
  }));

  const usage: Record<string, number> = {};
  const bump = (id: string | null) => {
    if (id) usage[id] = (usage[id] ?? 0) + 1;
  };

  // Usage counts every split version, not only current ones: an option in any
  // version stays restorable, so it can't be deleted.
  for (const a of allocs.data ?? []) bump(a.investment_option_id);
  const history = groupSplits(splits.data ?? [], allocs.data ?? []);
  const currentSplit = (ampliconId: string): FundAmplicon["allocations"] => {
    const v = history.get(ampliconId);
    const cur = v && v.length > 0 ? v[v.length - 1].allocations : [];
    return cur.map((r) => ({ optionId: r.investment_option_id, pct: r.pct }));
  };

  const amplicons: FundAmplicon[] = (amps.data ?? []).map((a) => ({
    id: a.id,
    faceValue: Number(a.face_value),
    interestPct: Number(a.interest_pct),
    termMonths: Number(a.term_months),
    startMonth: isoToYearMonth(a.start_date),
    incomeType: a.income_type ?? "STI",
    allocations: currentSplit(a.id),
  }));

  const lastCheckin: Record<string, YearMonth> = {};
  for (const c of checkins.data ?? []) {
    bump(c.investment_option_id);
    if (c.stranded_at == null) lastCheckin[idOf(c.investment_option_id)] = isoToYearMonth(c.checkin_month);
  }
  for (const m of moves.data ?? []) {
    bump(m.from_option_id);
    bump(m.to_option_id);
  }

  return {
    amplicons,
    options,
    moves: (moves.data ?? []).map((m) => ({
      id: m.id,
      fromId: idOf(m.from_option_id),
      toId: idOf(m.to_option_id),
      amount: Number(m.amount),
      month: isoToYearMonth(m.move_month),
      stranded: m.stranded_at != null,
    })),
    checkins: (checkins.data ?? []).map((c) => ({
      id: c.id,
      stranded: c.stranded_at != null,
      optionId: idOf(c.investment_option_id),
      value: Number(c.value),
      month: isoToYearMonth(c.checkin_month),
    })),
    today,
    optionUsage: usage,
    lastCheckin,
  };
}
