import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import type { CandidateOutcome } from "@/features/content/engine/discovery";
import { DROPPED_OUTCOMES } from "@/features/content/engine/discovery";
import { buildDiscoveryPage, type CandidateRow, type DiscoveryDb, type DiscoveryPage, type DiscoveryRunRow } from "./discovery";
import { chicagoDayStart } from "../recreate/recreate";

type Client = SupabaseClient<Database>;

const CREATOR_COLUMNS = "id, username, status, last_pulled_at, last_pull_status, suggested_at";
const CANDIDATE_COLUMNS = "id, username, outcome, reason, found_via, followers, own_followers, bio, sample, reader, confidence, evidence, popular_count, attempts, looked_at";
const RUN_COLUMNS = "id, week_start, kind, apify_run_id, usernames, status, error, cap_usd, cost_usd, own_followers, items, started_at, finished_at";

const CANDIDATE_DEFAULTS = {
  reason: "",
  found_via: "",
  followers: null,
  own_followers: null,
  bio: "",
  sample: [] as Json,
  reader: "" as const,
  confidence: null,
  evidence: [] as string[],
  popular_count: 0,
  attempts: 0,
};

/**
 * Every query filters by the owner. The cron and the endpoint run with the admin client, which
 * bypasses RLS, so this filter is what keeps them to Miguel's rows. `decide`, `lapse` and
 * `setCandidate` are conditional writes: they report false when the row moved first.
 */
export function supabaseDiscoveryDb(client: Client, userId: string): DiscoveryDb & { discoveryPage(now: Date): Promise<DiscoveryPage> } {
  const creators = () => client.from("content_creators");
  const candidates = () => client.from("content_creator_candidates");
  const runs = () => client.from("content_discovery_runs");
  const calls = () => client.from("content_discovery_calls");
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`discovery ${what}: ${error.message}`);
  };
  const asCandidates = (rows: unknown): CandidateRow[] => ((rows ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, sample: (r.sample ?? []) as CandidateRow["sample"], evidence: (r.evidence ?? []) as string[] }) as CandidateRow);

  const db: DiscoveryDb & { discoveryPage(now: Date): Promise<DiscoveryPage> } = {
    async creators() {
      const { data, error } = await creators().select(CREATOR_COLUMNS).eq("user_id", userId).order("username");
      fail("creators", error);
      return (data ?? []) as Awaited<ReturnType<DiscoveryDb["creators"]>>;
    },

    async candidates(outcomes) {
      const { data, error } = await candidates().select(CANDIDATE_COLUMNS).eq("user_id", userId).in("outcome", outcomes).order("looked_at");
      fail("candidates", error);
      return asCandidates(data);
    },

    async candidatesByUsername(usernames) {
      if (usernames.length === 0) return [];
      const { data, error } = await candidates().select(CANDIDATE_COLUMNS).eq("user_id", userId).in("username", usernames);
      fail("candidates by username", error);
      return asCandidates(data);
    },

    async upsertCandidates(rows, at) {
      if (rows.length === 0) return;
      // A full row each time: an account looked at again after 90 days starts clean.
      const payload = rows.map(({ id: _id, sample, ...r }) => ({ ...CANDIDATE_DEFAULTS, looked_at: at, ...r, sample: (sample ?? []) as unknown as Json, user_id: userId }));
      const { error } = await candidates().upsert(payload, { onConflict: "user_id,username" });
      fail("upsert candidates", error);
    },

    async setCandidate(id, expect: CandidateOutcome, patch, at) {
      const { id: _id, username: _username, sample, ...rest } = patch;
      const row = { ...rest, ...(sample !== undefined ? { sample: sample as unknown as Json } : {}), looked_at: at };
      const { data, error } = await candidates().update(row).eq("id", id).eq("user_id", userId).eq("outcome", expect).select("id");
      fail("set candidate", error);
      return (data ?? []).length > 0;
    },

    async runsForWeek(weekStart) {
      const { data, error } = await runs().select(RUN_COLUMNS).eq("user_id", userId).eq("week_start", weekStart).order("started_at");
      fail("runs for week", error);
      return (data ?? []) as DiscoveryRunRow[];
    },

    async pendingRuns() {
      const { data, error } = await runs().select(RUN_COLUMNS).eq("user_id", userId).eq("status", "pending").order("started_at");
      fail("pending runs", error);
      return (data ?? []) as DiscoveryRunRow[];
    },

    async insertRun(row) {
      const { data, error } = await runs().insert({ ...row, user_id: userId }).select("id");
      fail("insert run", error);
      const id = (data?.[0] as { id: string } | undefined)?.id;
      if (!id) throw new Error("discovery insert run: no row written");
      return id;
    },

    async updateRun(id, patch) {
      const { id: _id, week_start: _week, kind: _kind, started_at: _started, ...rest } = patch;
      const { error } = await runs().update(rest).eq("id", id).eq("user_id", userId);
      fail("update run", error);
    },

    async suggest(username, at) {
      const { data, error } = await creators()
        .upsert({ user_id: userId, platform: "instagram", username, status: "suggested", suggested_at: at }, { onConflict: "user_id,platform,username", ignoreDuplicates: true })
        .select("id");
      fail("suggest", error);
      return (data ?? []).length > 0;
    },

    async lapse(creatorId, username, at) {
      const { data, error } = await creators().delete().eq("id", creatorId).eq("user_id", userId).eq("status", "suggested").select("id");
      fail("lapse", error);
      if ((data ?? []).length === 0) return;
      const { error: ce } = await candidates()
        .update({ outcome: "lapsed", reason: "Not answered in 4 weeks", looked_at: at })
        .eq("user_id", userId)
        .eq("username", username)
        .eq("outcome", "suggested");
      fail("lapse candidate", ce);
    },

    async decide(creatorId, to, reason, at) {
      const { data, error } = await creators()
        .update({ status: to, decline_reason: reason, decided_at: at })
        .eq("id", creatorId)
        .eq("user_id", userId)
        .eq("status", "suggested")
        .select("id");
      fail("decide", error);
      return (data ?? []).length > 0;
    },

    async declines(limit) {
      const { data, error } = await creators()
        .select("username, decline_reason")
        .eq("user_id", userId)
        .eq("status", "declined")
        .order("decided_at", { ascending: false })
        .limit(limit);
      fail("declines", error);
      const rows = (data ?? []) as { username: string; decline_reason: string }[];
      if (rows.length === 0) return [];
      const { data: bios, error: be } = await candidates().select("username, bio").eq("user_id", userId).in("username", rows.map((r) => r.username));
      fail("decline bios", be);
      const bio = new Map(((bios ?? []) as { username: string; bio: string }[]).map((b) => [b.username, b.bio]));
      return rows.map((r) => ({ username: r.username, bio: bio.get(r.username) ?? "", reason: r.decline_reason }));
    },

    async logCall(trigger, note, at) {
      const { error } = await calls().insert({ user_id: userId, trigger, note, created_at: at });
      fail("log call", error);
    },

    async callsSince(trigger, since) {
      const { data, error } = await calls().select("id").eq("user_id", userId).eq("trigger", trigger).gte("created_at", since);
      fail("calls since", error);
      return (data ?? []).length;
    },

    async discoveryPage(now) {
      const [creatorRows, candidateRows, buttonCalls, last] = await Promise.all([
        db.creators(),
        db.candidates(["suggested", ...DROPPED_OUTCOMES]),
        db.callsSince("button", chicagoDayStart(now).toISOString()),
        calls().select("note, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
      ]);
      fail("last call", last.error);
      const row = ((last.data ?? [])[0] as { note: string; created_at: string } | undefined) ?? null;
      return buildDiscoveryPage({ creators: creatorRows, candidates: candidateRows, lastCall: row ? { note: row.note, at: row.created_at } : null, buttonCallsToday: buttonCalls });
    },
  };
  return db;
}
