"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/shared/supabase/auth";
import { canUseInvestments } from "@/shared/investments-access";
import { str } from "@/shared/forms";
import { currentYearMonth, type YearMonth } from "@/shared/finance/dates";
import { isWorse, runFundCheck, termsAt, type FundStatus } from "@/shared/finance/fund-check";
import { fmtMonth } from "@/shared/format";
import { parseOptionForm, versionRow, monthStart, parseMoveForm, parseCheckinForm } from "./parse";
import { loadFundCheckInput } from "./load";

// requireUser(), then the investments gate. Others get an error: the UI never offers them these actions.
async function requireInvestmentsUser() {
  const ctx = await requireUser();
  if (!canUseInvestments(ctx.user.id)) throw new Error("Not available.");
  return ctx;
}

function refresh() {
  revalidatePath("/investment-options");
  revalidatePath("/dashboard");
  revalidatePath("/amplicons");
}

export async function createInvestmentOption(fd: FormData): Promise<void> {
  const { supabase, user } = await requireInvestmentsUser();
  const f = parseOptionForm(fd);
  const { data, error } = await supabase
    .from("investment_options")
    .insert({ user_id: user.id, name: f.name })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the option.");
  const { error: vErr } = await supabase
    .from("investment_option_versions")
    .insert(versionRow(data.id, user.id, f, currentYearMonth()));
  if (vErr) {
    // Never leave an option without terms behind.
    await supabase.from("investment_options").delete().eq("id", data.id).eq("user_id", user.id);
    throw new Error(vErr.message);
  }
  refresh();
}

// What the fund check says if this edit is saved. Writes nothing.
export async function previewOptionEdit(
  fd: FormData
): Promise<{ worse: boolean; status: FundStatus; runOutMonth: YearMonth | null }> {
  const { supabase } = await requireInvestmentsUser();
  const id = str(fd, "id");
  const f = parseOptionForm(fd);
  const today = currentYearMonth();
  const input = await loadFundCheckInput(supabase, today);
  const options = input.options.map((o) =>
    o.id !== id
      ? o
      : {
          ...o,
          versions: [
            ...o.versions.filter((v) => v.effectiveMonth !== today),
            { effectiveMonth: today, optionType: f.option_type, ratePct: f.rate_pct, termMonths: f.term_months, liquid: f.liquid },
          ],
        }
  );
  const before = runFundCheck(input);
  const after = runFundCheck({ ...input, options });
  return { worse: isWorse(before, after), status: after.status, runOutMonth: after.runOutMonth };
}

// Forward-only: the edit is a version from this month on. A same-month edit
// replaces that month's version. The fund status never blocks it (the form
// asks for a second click instead).
export async function editInvestmentOption(fd: FormData): Promise<void> {
  const { supabase, user } = await requireInvestmentsUser();
  const id = str(fd, "id");
  if (!id) throw new Error("Missing option id");
  const f = parseOptionForm(fd);
  const today = currentYearMonth();

  if (!f.liquid) {
    const { data: outs } = await supabase
      .from("fund_moves")
      .select("move_month")
      .eq("from_option_id", id)
      .gte("move_month", monthStart(today))
      .order("move_month")
      .limit(1);
    if (outs && outs.length > 0) {
      throw new Error(`This option has money moved out of it from ${fmtMonth(outs[0].move_month.slice(0, 7))}. Delete that move first.`);
    }
  }

  const { error } = await supabase
    .from("investment_options")
    .update({ name: f.name })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  const { error: vErr } = await supabase
    .from("investment_option_versions")
    .upsert(versionRow(id, user.id, f, today), { onConflict: "option_id,effective_month" });
  if (vErr) throw new Error(vErr.message);
  refresh();
}

export async function deleteInvestmentOption(fd: FormData): Promise<{ error: string | null }> {
  const { supabase, user } = await requireInvestmentsUser();
  const id = str(fd, "id");
  if (!id) return { error: null };
  const { error } = await supabase.from("investment_options").delete().eq("id", id).eq("user_id", user.id);
  if (error?.code === "23503") return { error: "In use by a split, move or check-in. Remove those first." };
  if (error) throw new Error(error.message);
  refresh();
  return { error: null };
}

export async function createFundMove(fd: FormData): Promise<void> {
  const { supabase, user } = await requireInvestmentsUser();
  const f = parseMoveForm(fd);
  if (f.from_option_id) {
    const input = await loadFundCheckInput(supabase, currentYearMonth());
    const src = input.options.find((o) => o.id === f.from_option_id);
    if (!src) throw new Error("Unknown option.");
    if (!termsAt(src, f.move_month.slice(0, 7)).liquid) throw new Error("You can't sell an illiquid option.");
  }
  const { error } = await supabase.from("fund_moves").insert({ user_id: user.id, ...f });
  if (error) throw new Error(error.message);
  refresh();
}

// "Deleting" a move strands it: the money still left the source that month, but
// it now sits in Default growth. Can't be undone (the UI says so first).
export async function strandFundMove(fd: FormData): Promise<void> {
  const { supabase, user } = await requireInvestmentsUser();
  const id = str(fd, "id");
  if (!id) return;
  const { error } = await supabase
    .from("fund_moves")
    .update({ stranded_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("stranded_at", null);
  if (error) throw new Error(error.message);
  refresh();
}

export async function createCheckin(fd: FormData): Promise<void> {
  const { supabase, user } = await requireInvestmentsUser();
  const f = parseCheckinForm(fd, currentYearMonth());
  const { error } = await supabase.from("holding_checkins").insert({ user_id: user.id, ...f });
  if (error) throw new Error(error.message);
  refresh();
}

// "Deleting" a check-in strands it: the holding is still set to the checked-in
// value that month, then that whole value moves to Default growth. Can't be undone.
export async function strandCheckin(fd: FormData): Promise<void> {
  const { supabase, user } = await requireInvestmentsUser();
  const id = str(fd, "id");
  if (!id) return;
  const { error } = await supabase
    .from("holding_checkins")
    .update({ stranded_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("stranded_at", null);
  if (error) throw new Error(error.message);
  refresh();
}
