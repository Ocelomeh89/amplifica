import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/supabase/database.types";
import { PROPOSALS_DAILY_CAP, type NoteSource, type RuleStatus } from "@/features/content/engine/taste";
import { chicagoDayStart } from "./recreate";
import type { NoteRow, RuleRow, TasteDb, TastePage } from "./taste";

type Client = SupabaseClient<Database>;

const NOTE_COLUMNS = "id, idea_id, chips, text, source, proposal_id, created_at";
const RULE_COLUMNS = "id, rule, status, origin, evidence_count, last_evidence_at, note_ids, created_at";
const NOTES_ON_PAGE = 200;

/**
 * Every query filters by the owner. The background proposal runs with the admin client,
 * which bypasses RLS, so this filter is what keeps it to Miguel's rows.
 */
export function supabaseTasteDb(client: Client, userId: string): TasteDb & { page(now: Date): Promise<TastePage> } {
  const notes = () => client.from("content_taste_notes");
  const rules = () => client.from("content_taste_rules");
  const proposals = () => client.from("content_taste_proposals");
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`taste ${what}: ${error.message}`);
  };

  /** Notes with the title and hook of the idea each one was about. */
  const withIdeas = async (rows: Record<string, unknown>[]): Promise<NoteRow[]> => {
    const ideaIds = [...new Set(rows.map((r) => r.idea_id).filter((x): x is string => typeof x === "string"))];
    const byId = new Map<string, { title: string; hook: string }>();
    if (ideaIds.length > 0) {
      const { data, error } = await client.from("content_ideas").select("id, title, hook").eq("user_id", userId).in("id", ideaIds);
      fail("note ideas", error);
      for (const i of data ?? []) byId.set((i as { id: string }).id, { title: (i as { title: string }).title, hook: (i as { hook: string }).hook });
    }
    return rows.map((r) => ({
      id: r.id as string,
      idea_id: (r.idea_id ?? null) as string | null,
      chips: (r.chips ?? []) as string[],
      text: (r.text ?? "") as string,
      source: r.source as NoteSource,
      proposal_id: (r.proposal_id ?? null) as string | null,
      created_at: r.created_at as string,
      idea: typeof r.idea_id === "string" ? (byId.get(r.idea_id) ?? null) : null,
    }));
  };

  const db: TasteDb & { page(now: Date): Promise<TastePage> } = {
    async insertNote(n) {
      const { data, error } = await notes().insert({ user_id: userId, idea_id: n.ideaId, chips: n.chips, text: n.text, source: n.source }).select("id");
      fail("note", error);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("taste note: no row written");
      return id;
    },

    async unusedNotes() {
      const { data, error } = await notes().select(NOTE_COLUMNS).eq("user_id", userId).is("proposal_id", null).order("created_at", { ascending: true });
      fail("unused notes", error);
      return withIdeas((data ?? []) as unknown as Record<string, unknown>[]);
    },

    async rules() {
      const { data, error } = await rules().select(RULE_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false });
      fail("rules", error);
      return (data ?? []) as unknown as RuleRow[];
    },

    async proposalsSince(since) {
      const { count, error } = await proposals().select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
      fail("proposal count", error);
      return count ?? 0;
    },

    async livePending(before) {
      const { data, error } = await proposals().select("id").eq("user_id", userId).eq("status", "pending").gte("created_at", before).limit(1);
      fail("live proposal", error);
      return ((data ?? [])[0] as { id: string } | undefined) ?? null;
    },

    async insertProposal(kind) {
      const { data, error } = await proposals().insert({ user_id: userId, kind }).select("id");
      fail("proposal", error);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("taste proposal: no row written");
      return id;
    },

    async finishProposal(id, patch) {
      const { error } = await proposals().update(patch).eq("id", id).eq("user_id", userId);
      fail("finish proposal", error);
    },

    async applyProposal(id, merged, noteIds, at) {
      const { error } = await client.rpc("content_apply_taste_proposal", {
        p_user: userId,
        p_proposal: id,
        p_inserts: merged.inserts,
        p_evidence: merged.evidence,
        p_notes: noteIds,
        p_at: at,
      });
      fail("apply proposal", error);
    },

    async setRule(id, patch) {
      const body: { status?: RuleStatus; active?: boolean; rule?: string } = { ...patch };
      if (patch.status !== undefined) body.active = patch.status === "active";
      const { data, error } = await rules().update(body).eq("id", id).eq("user_id", userId).select("id");
      fail("set rule", error);
      return (data ?? []).length > 0;
    },

    async insertManualRule(rule) {
      const { data, error } = await rules().insert({ user_id: userId, rule, origin: "manual", status: "active", active: true, evidence_count: 0 }).select("id");
      fail("manual rule", error);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("taste manual rule: no row written");
      return id;
    },

    async page(now) {
      const [{ data, error }, allRules, used] = await Promise.all([
        notes().select(NOTE_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(NOTES_ON_PAGE),
        db.rules(),
        db.proposalsSince(chicagoDayStart(now).toISOString()),
      ]);
      fail("notes", error);
      const all = await withIdeas((data ?? []) as unknown as Record<string, unknown>[]);
      const byId = new Map(all.map((n) => [n.id, n]));
      const withNotes = (r: RuleRow) => ({ ...r, notes: r.note_ids.map((id) => byId.get(id)).filter((n): n is NoteRow => n !== undefined) });
      return {
        proposed: allRules.filter((r) => r.status === "proposed").map(withNotes),
        active: allRules.filter((r) => r.status === "active").map(withNotes),
        off: allRules.filter((r) => r.status === "off"),
        notes: all,
        waiting: all.filter((n) => n.proposal_id === null).length,
        proposalsLeft: Math.max(0, PROPOSALS_DAILY_CAP - used),
      };
    },
  };
  return db;
}
