// Saving an Amplicon's split. Kept out of the "use server" actions file so it
// is not itself a callable Server Action. Splits are versioned and never
// deleted: every change is a new version, written atomically by the
// save_amplicon_split database function (spec revision 2026-11-10b).

import type { requireUser } from "@/shared/supabase/auth";
import type { Json } from "@/shared/supabase/database.types";
import { groupSplits, sameSplit, type SplitRow, type SplitVersion } from "@/shared/splits";

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];

// Undefined table (Postgres / PostgREST) or function: migration 0019 isn't applied yet.
function isMissing(error: { code?: string } | null): boolean {
  return ["42P01", "PGRST205", "PGRST202", "42883"].includes(error?.code ?? "");
}

/** Every saved version of one Amplicon's split, oldest first. */
export async function readSplitHistory(
  supabase: Client,
  ampliconId: string
): Promise<{ versions: SplitVersion[]; missing: boolean }> {
  const { data: splits, error } = await supabase
    .from("amplicon_splits")
    .select("id, seq, amplicon_id, created_at")
    .eq("amplicon_id", ampliconId)
    .order("seq");
  if (error) {
    if (isMissing(error)) return { versions: [], missing: true };
    throw new Error(error.message);
  }
  const ids = (splits ?? []).map((s) => s.id);
  if (ids.length === 0) return { versions: [], missing: false };
  const { data: rows, error: rowsErr } = await supabase
    .from("amplicon_allocations")
    .select("split_id, investment_option_id, pct")
    .in("split_id", ids);
  if (rowsErr) throw new Error(rowsErr.message);
  return { versions: groupSplits(splits ?? [], rows ?? []).get(ampliconId) ?? [], missing: false };
}

/** Save `allocs` as the Amplicon's new split version, unless it already is the current one. */
export async function saveSplit(supabase: Client, ampliconId: string, allocs: SplitRow[]): Promise<void> {
  const { versions, missing } = await readSplitHistory(supabase, ampliconId);
  if (missing) {
    if (allocs.length === 0) return;
    throw new Error("Splitting an Amplicon needs migration 0019 applied first.");
  }
  const current = versions.length > 0 ? versions[versions.length - 1].allocations : [];
  if (sameSplit(current, allocs)) return;
  const { error } = await supabase.rpc("save_amplicon_split", { p_amplicon_id: ampliconId, p_allocations: allocs as unknown as Json });
  if (error) throw new Error(error.message);
}
