// Writing an Amplicon's split. Kept out of the "use server" actions file so it
// is not itself a callable Server Action (it takes a userId argument).

import type { requireUser } from "@/shared/supabase/auth";
import type { AllocationField } from "./parse";

type Client = Awaited<ReturnType<typeof requireUser>>["supabase"];

// Postgres "undefined table" and PostgREST "table not in schema cache":
// migration 0019 hasn't been applied yet.
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

// Replace an Amplicon's split. An empty split means Default growth. Before
// migration 0019 an empty split is a no-op, so Amplicons keep saving.
export async function writeAllocations(
  supabase: Client,
  userId: string,
  ampliconId: string,
  allocs: AllocationField[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from("amplicon_allocations")
    .delete()
    .eq("amplicon_id", ampliconId)
    .eq("user_id", userId);
  if (delErr) {
    if (isMissingTable(delErr) && allocs.length === 0) return;
    throw new Error(delErr.message);
  }
  if (allocs.length === 0) return;
  const { error } = await supabase
    .from("amplicon_allocations")
    .insert(allocs.map((a) => ({ user_id: userId, amplicon_id: ampliconId, ...a })));
  if (error) throw new Error(error.message);
}
