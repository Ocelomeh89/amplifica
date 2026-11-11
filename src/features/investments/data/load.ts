// Everything the fund check needs, read with the caller's RLS-scoped client.
// A table that is missing (migration 0019 not yet applied) reads as empty, so
// the dashboard keeps working before the migration lands.

import type { createClient } from "@/shared/supabase/server";
import { isoToYearMonth, type YearMonth } from "@/shared/finance/dates";
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
  const [opts, versions, allocs, moves, checkins, amps] = await Promise.all([
    supabase.from("investment_options").select("id, name").order("name"),
    supabase.from("investment_option_versions").select("*"),
    supabase.from("amplicon_allocations").select("amplicon_id, investment_option_id, pct"),
    supabase.from("fund_moves").select("*").order("move_month"),
    supabase.from("holding_checkins").select("*").order("checkin_month"),
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

  const allocations = new Map<string, FundAmplicon["allocations"]>();
  for (const a of allocs.data ?? []) {
    bump(a.investment_option_id);
    const list = allocations.get(a.amplicon_id) ?? [];
    list.push({ optionId: a.investment_option_id, pct: Number(a.pct) });
    allocations.set(a.amplicon_id, list);
  }

  const amplicons: FundAmplicon[] = (amps.data ?? []).map((a) => ({
    id: a.id,
    faceValue: Number(a.face_value),
    interestPct: Number(a.interest_pct),
    termMonths: Number(a.term_months),
    startMonth: isoToYearMonth(a.start_date),
    incomeType: a.income_type ?? "STI",
    allocations: allocations.get(a.id) ?? [],
  }));

  const lastCheckin: Record<string, YearMonth> = {};
  for (const c of checkins.data ?? []) {
    bump(c.investment_option_id);
    lastCheckin[idOf(c.investment_option_id)] = isoToYearMonth(c.checkin_month);
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
    })),
    checkins: (checkins.data ?? []).map((c) => ({
      optionId: idOf(c.investment_option_id),
      value: Number(c.value),
      month: isoToYearMonth(c.checkin_month),
    })),
    today,
    optionUsage: usage,
    lastCheckin,
  };
}
