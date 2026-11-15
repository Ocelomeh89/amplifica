import type { CandidateOutcome } from "@/features/content/engine/discovery";
import type { CreatorRow } from "./competitors";
import type { CandidateRow, DiscoveryDb, DiscoveryRunRow } from "./discovery";

// In-memory DiscoveryDb for the flow tests. Mirrors the adapter's conditional writes.

type FakeCreator = CreatorRow & { suggested_at: string | null; decline_reason?: string; decided_at?: string | null };
type FakeCall = { trigger: "cron" | "routine" | "button"; note: string; at: string };

export function candidate(over: Partial<CandidateRow> & Pick<CandidateRow, "username" | "outcome">): CandidateRow {
  return {
    id: `cand-${over.username}`,
    reason: "",
    found_via: "search: financial freedom",
    followers: null,
    own_followers: null,
    bio: "",
    sample: [],
    reader: "",
    confidence: null,
    evidence: [],
    popular_count: 0,
    attempts: 0,
    looked_at: "2026-11-16T12:00:00.000Z",
    ...over,
  };
}

export function creatorRow(over: Partial<FakeCreator> & Pick<FakeCreator, "username">): FakeCreator {
  return { id: `cr-${over.username}`, status: "watching", last_pulled_at: null, last_pull_status: null, suggested_at: null, ...over };
}

export function fakeDiscoveryDb(seed: { creators?: FakeCreator[]; candidates?: CandidateRow[]; runs?: DiscoveryRunRow[]; calls?: FakeCall[] } = {}) {
  const state = {
    creators: [...(seed.creators ?? [])],
    candidates: [...(seed.candidates ?? [])],
    runs: [...(seed.runs ?? [])],
    calls: [...(seed.calls ?? [])],
    declineCalls: [] as number[],
  };
  let n = 0;
  const id = (p: string) => `${p}${++n}`;
  const db: DiscoveryDb = {
    async creators() {
      return state.creators;
    },
    async candidates(outcomes) {
      return state.candidates.filter((c) => outcomes.includes(c.outcome));
    },
    async candidatesByUsername(usernames) {
      return state.candidates.filter((c) => usernames.includes(c.username));
    },
    async upsertCandidates(rows, at) {
      for (const r of rows) {
        const fresh = candidate({ looked_at: at, ...r });
        const i = state.candidates.findIndex((c) => c.username === r.username);
        if (i >= 0) state.candidates[i] = { ...fresh, id: state.candidates[i].id };
        else state.candidates.push({ ...fresh, id: id("cand") });
      }
    },
    async setCandidate(cid, expect: CandidateOutcome, patch, at) {
      const c = state.candidates.find((x) => x.id === cid);
      if (!c || c.outcome !== expect) return false;
      Object.assign(c, patch, { looked_at: at });
      return true;
    },
    async runsForWeek(weekStart) {
      return state.runs.filter((r) => r.week_start === weekStart);
    },
    async pendingRuns() {
      return state.runs.filter((r) => r.status === "pending");
    },
    async insertRun(row) {
      const rid = id("dr");
      state.runs.push({ ...row, id: rid, error: "", cost_usd: null, own_followers: null, finished_at: null });
      return rid;
    },
    async updateRun(rid, patch) {
      Object.assign(state.runs.find((r) => r.id === rid)!, patch);
    },
    async suggest(username, at) {
      if (state.creators.some((c) => c.username === username)) return false;
      state.creators.push(creatorRow({ username, id: id("cr"), status: "suggested", suggested_at: at }));
      return true;
    },
    async lapse(creatorId, username, at) {
      const i = state.creators.findIndex((c) => c.id === creatorId && c.status === "suggested");
      if (i >= 0) state.creators.splice(i, 1);
      const c = state.candidates.find((x) => x.username === username);
      if (c) Object.assign(c, { outcome: "lapsed", reason: "Not answered in 4 weeks", looked_at: at });
    },
    async decide(creatorId, to, reason, at) {
      const c = state.creators.find((x) => x.id === creatorId);
      if (!c || c.status !== "suggested") return false;
      Object.assign(c, { status: to, decline_reason: reason, decided_at: at });
      return true;
    },
    async declines(limit) {
      state.declineCalls.push(limit);
      return state.creators
        .filter((c) => c.status === "declined")
        .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))
        .slice(0, limit)
        .map((c) => ({ username: c.username, bio: state.candidates.find((x) => x.username === c.username)?.bio ?? "", reason: c.decline_reason ?? "" }));
    },
    async logCall(trigger, note, at) {
      state.calls.push({ trigger, note, at });
    },
    async callsSince(trigger, since) {
      return state.calls.filter((c) => c.trigger === trigger && c.at >= since).length;
    },
  };
  return { db, state };
}
