import { chicagoIsoDate } from "@/features/content/engine/best-times";
import {
  DISCOVERY_HOPS,
  DISCOVERY_MIN_RUN_USD,
  OWN_INSTAGRAM_USERNAME,
  SAMPLE_MAX_CANDIDATES,
  SIZE_MAX_PROFILES,
  budgetLeft,
  followerCountIsFresh,
  followersLine,
  isLapsed,
  newCandidates,
  nextRunKind,
  slotsFree,
  sizeOutcome,
  type CandidateOutcome,
  type DiscoveryRunKind,
  type SampleReel,
} from "@/features/content/engine/discovery";
import { PROFILE_ACTOR, SEARCH_ACTOR, SEARCH_PHRASES, mapProfileItems, mapSampleItems, mapSearchItems, profilesInput, reelsInput, searchInput } from "@/features/content/engine/discovery-items";
import { RUN_STALE_HOURS } from "@/features/content/engine/competitors";
import { weekStartOf } from "@/features/content/engine/review";
import { APIFY_ACTOR, type ApifyClient } from "./pulls/apify";
import type { CreatorRow } from "./competitors";

import {
  ACTIVE_WINDOW_DAYS,
  DECLINE_REASONS_IN_PROMPT,
  JUDGE_MAX_ATTEMPTS,
  isActive,
  popularCount,
  rankFits,
} from "@/features/content/engine/discovery";
import { JUDGE_TOOL, judgeOutcome, judgeSchema, judgeSystemPrompt, judgeToolSchema, quotesAreReal, renderJudgeTurn } from "@/features/content/engine/discovery-judge";
import type { ToolCaller } from "./claude";

// Slice C: the creator-discovery flow. The candidate row is the state machine: every
// candidate carries an outcome and each call moves whatever is ready one step.

export type CandidateRow = {
  id: string;
  username: string;
  outcome: CandidateOutcome;
  reason: string;
  found_via: string;
  followers: number | null;
  own_followers: number | null;
  bio: string;
  sample: SampleReel[];
  reader: "" | "daniel" | "stephen" | "neither";
  confidence: number | null;
  evidence: string[];
  popular_count: number;
  attempts: number;
  looked_at: string;
};

export type DiscoveryRunRow = {
  id: string;
  week_start: string;
  kind: DiscoveryRunKind;
  /** A gather run holds its search phrase in `usernames[0]`. */
  apify_run_id: string;
  usernames: string[];
  status: "pending" | "ready" | "failed";
  error: string;
  cap_usd: number;
  cost_usd: number | null;
  own_followers: number | null;
  items: number | null;
  started_at: string;
  finished_at: string | null;
};

export interface DiscoveryDb {
  /** Every status. */
  creators(): Promise<(CreatorRow & { suggested_at: string | null })[]>;
  candidates(outcomes: CandidateOutcome[]): Promise<CandidateRow[]>;
  candidatesByUsername(usernames: string[]): Promise<CandidateRow[]>;
  /** Insert, or overwrite an existing row for the username. */
  upsertCandidates(rows: (Partial<CandidateRow> & { username: string; outcome: CandidateOutcome })[], at: string): Promise<void>;
  /** Writes only while the row still has `expect` as its outcome. False when it moved. */
  setCandidate(id: string, expect: CandidateOutcome, patch: Partial<CandidateRow>, at: string): Promise<boolean>;
  runsForWeek(weekStart: string): Promise<DiscoveryRunRow[]>;
  pendingRuns(): Promise<DiscoveryRunRow[]>;
  insertRun(row: Omit<DiscoveryRunRow, "id" | "finished_at" | "cost_usd" | "own_followers" | "error">): Promise<string>;
  updateRun(id: string, patch: Partial<DiscoveryRunRow>): Promise<void>;
  /** Inserts the creator as `suggested`. False when the username already exists. */
  suggest(username: string, at: string): Promise<boolean>;
  /** Deletes the creator row while it is still `suggested`; sets the candidate to `lapsed`. */
  lapse(creatorId: string, username: string, at: string): Promise<void>;
  /** Suggested to watching or declined. False when the row is no longer `suggested`. */
  decide(creatorId: string, to: "watching" | "declined", reason: string, at: string): Promise<boolean>;
  declines(limit: number): Promise<{ username: string; bio: string; reason: string }[]>;
  logCall(trigger: "cron" | "routine" | "button", note: string, at: string): Promise<void>;
  callsSince(trigger: "button", since: string): Promise<number>;
}

export type OwnCount = { followers: number; day: string } | null;

// ---- Runs: lapse, collect, start ----


const HOUR = 3_600_000;
const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");
export const OWN_UNKNOWN_NOTE = "Discovery did not run: your follower count could not be read.";
export const WAITING_NOTE = "Three suggestions are waiting, so nothing was searched.";

/** Lapses every suggestion Miguel left unanswered for over 4 weeks: the creator row goes, the candidate says why. */
export async function lapseStale(db: DiscoveryDb, now: Date): Promise<number> {
  let lapsed = 0;
  for (const c of await db.creators()) {
    if (c.status !== "suggested" || !c.suggested_at || !isLapsed(c.suggested_at, now)) continue;
    await db.lapse(c.id, c.username, now.toISOString());
    lapsed += 1;
  }
  return lapsed;
}

/** The stored count when fresh, else the newest `own_followers` a run read this week, else unknown. */
function ownFollowers(own: OwnCount, runs: DiscoveryRunRow[], now: Date): number | null {
  if (own && followerCountIsFresh(own.day, chicagoIsoDate(now))) return own.followers;
  const read = runs.filter((r) => r.own_followers !== null).sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  return read?.own_followers ?? null;
}

/** Sizes every `gathered` candidate whose follower count is known. `attempted`: a size run already tried to read the rest. */
async function sizeGathered(db: DiscoveryDb, own: number, now: Date, attempted: boolean): Promise<void> {
  const at = now.toISOString();
  for (const c of await db.candidates(["gathered"])) {
    if (c.followers === null && !attempted) continue;
    const outcome = sizeOutcome(c.followers, own);
    if (outcome === "sized") await db.setCandidate(c.id, "gathered", { outcome, own_followers: own }, at);
    else if (outcome === "out_of_band") await db.setCandidate(c.id, "gathered", { outcome, own_followers: own, reason: `${followersLine(c.followers as number, own).replace(", ", " is ")}; the band is 2x to 20x` }, at);
    else await db.setCandidate(c.id, "gathered", { outcome, own_followers: own, reason: "No follower count (private or gone)" }, at);
  }
}

type CollectOut = { collected: number; failed: number; errors: string[]; note: string | null };

/** Reads every pending discovery run once. A run that cannot be read stays pending and is reported in `errors`. */
export async function collectDiscoveryRuns(db: DiscoveryDb, apify: ApifyClient, a: { now: Date; own: OwnCount }): Promise<CollectOut> {
  const out: CollectOut = { collected: 0, failed: 0, errors: [], note: null };
  const runs = await db.pendingRuns();
  if (runs.length === 0) return out;
  const at = a.now.toISOString();
  const failRun = async (r: DiscoveryRunRow, error: string) => {
    await db.updateRun(r.id, { status: "failed", error, finished_at: at });
    out.failed += 1;
  };
  let sizeRead = false;
  for (const r of runs) {
    try {
      const state = await apify.getRun(r.apify_run_id);
      if (state.status === "pending") {
        if (a.now.getTime() - new Date(r.started_at).getTime() > RUN_STALE_HOURS * HOUR) await failRun(r, "timed out");
        continue;
      }
      if (state.status === "failed") {
        await failRun(r, state.error || "failed");
        continue;
      }
      if (!state.datasetId) {
        await failRun(r, "the run returned no dataset");
        continue;
      }
      const items = await apify.datasetItems(state.datasetId);
      let ownRead: number | null = null;
      if (r.kind === "gather") await collectGather(db, items, r.usernames[0] ?? "", a.now);
      else if (r.kind === "size") {
        ownRead = await collectSize(db, items, r.usernames, a.now);
        sizeRead = true;
      } else await collectSample(db, items, r.usernames, a.now);
      await db.updateRun(r.id, { status: "ready", finished_at: at, items: items.length, cost_usd: state.costUsd, ...(ownRead !== null ? { own_followers: ownRead } : {}) });
      out.collected += 1;
    } catch (e) {
      // Left pending: the next call tries again, and the 48-hour rule ends it.
      console.error("content discovery run", r.apify_run_id, message(e));
      out.errors.push(`run ${r.apify_run_id}: ${message(e)}`);
    }
  }
  const week = await db.runsForWeek(weekStartOf(a.now));
  const own = ownFollowers(a.own, week, a.now);
  const attempted = sizeRead || week.some((r) => r.kind === "size" && r.status !== "pending");
  if (own === null) {
    if (attempted && (await db.candidates(["gathered"])).length > 0) out.note = OWN_UNKNOWN_NOTE;
  } else {
    await sizeGathered(db, own, a.now, attempted);
  }
  return out;
}

async function collectGather(db: DiscoveryDb, items: unknown[], phrase: string, now: Date): Promise<void> {
  const rows = mapSearchItems(items, phrase);
  const creators = new Set((await db.creators()).map((c) => c.username));
  const memory = new Map((await db.candidatesByUsername(rows.map((r) => r.username))).map((c) => [c.username, { outcome: c.outcome, looked_at: c.looked_at }]));
  const fresh = new Map(newCandidates(rows.map((r) => ({ username: r.username, found_via: r.found_via })), { creators, memory }, now).map((c) => [c.username, c]));
  const at = now.toISOString();
  const upserts = rows
    .filter((r) => fresh.has(r.username))
    .map((r) =>
      r.isPrivate
        ? { username: r.username, outcome: "unreadable" as const, reason: "Private account", found_via: r.found_via, followers: r.followers }
        : { username: r.username, outcome: "gathered" as const, found_via: r.found_via, followers: r.followers },
    );
  // The same account can come back from two phrases; the first wins.
  const seen = new Set<string>();
  const unique = upserts.filter((u) => (seen.has(u.username) ? false : (seen.add(u.username), true)));
  if (unique.length > 0) await db.upsertCandidates(unique, at);
}

/** Writes followers and bio to the profiled candidates; returns Miguel's own count when the run read it. */
async function collectSize(db: DiscoveryDb, items: unknown[], usernames: string[], now: Date): Promise<number | null> {
  const at = now.toISOString();
  const profiles = new Map(mapProfileItems(items).map((p) => [p.username, p]));
  const mine = profiles.get(OWN_INSTAGRAM_USERNAME)?.followers ?? null;
  for (const c of await db.candidatesByUsername(usernames.filter((u) => u !== OWN_INSTAGRAM_USERNAME))) {
    const p = profiles.get(c.username);
    if (!p) continue;
    if (p.isPrivate) await db.setCandidate(c.id, "gathered", { outcome: "unreadable", reason: "Private account", followers: p.followers, bio: p.bio }, at);
    else await db.setCandidate(c.id, "gathered", { followers: p.followers, bio: p.bio }, at);
  }
  return mine;
}

async function collectSample(db: DiscoveryDb, items: unknown[], usernames: string[], now: Date): Promise<void> {
  const at = now.toISOString();
  const samples = mapSampleItems(items, usernames);
  for (const c of await db.candidatesByUsername(usernames)) {
    const sample = samples.get(c.username) ?? [];
    if (sample.length === 0) await db.setCandidate(c.id, "sized", { outcome: "quiet", reason: "No Reels found", sample: [] }, at);
    else await db.setCandidate(c.id, "sized", { outcome: "sampled", sample }, at);
  }
}

/**
 * Starts the one next run, if any. Nothing starts while a discovery run is pending, while three
 * suggestions wait, or when this week's dollar is spent. A gather starts on Monday or when forced;
 * a size or sample run follows on any day.
 */
export async function startNextRun(db: DiscoveryDb, apify: ApifyClient, a: { now: Date; force: boolean; own: OwnCount }): Promise<{ started: DiscoveryRunKind | null; note: string | null }> {
  try {
    if ((await db.pendingRuns()).length > 0) return { started: null, note: null };
    const waiting = (await db.creators()).filter((c) => c.status === "suggested").length;
    if (slotsFree(waiting) === 0) return { started: null, note: WAITING_NOTE };
    const weekStart = weekStartOf(a.now);
    const week = await db.runsForWeek(weekStart);
    const left = budgetLeft(week);
    if (left < DISCOVERY_MIN_RUN_USD) return { started: null, note: "This week's search budget is used." };

    const own = ownFollowers(a.own, week, a.now);
    const gathered = await db.candidates(["gathered"]);
    const sizedRows = await db.candidates(["sized"]);
    const isMonday = chicagoIsoDate(a.now) === weekStart;
    const kind = nextRunKind({ gathered: gathered.length, sized: sizedRows.length, ranThisWeek: week.map((r) => r.kind), hops: DISCOVERY_HOPS, canGather: a.force || isMonday });
    if (!kind) return { started: null, note: null };
    const base = { week_start: weekStart, status: "pending" as const, items: null, started_at: a.now.toISOString() };

    if (kind === "gather") {
      const n = Math.min(SEARCH_PHRASES.length, Math.floor(left / DISCOVERY_MIN_RUN_USD));
      const cap = Math.floor((left / n) * 100) / 100;
      for (const phrase of SEARCH_PHRASES.slice(0, n)) {
        const { runId } = await apify.startActor({ actorId: SEARCH_ACTOR, body: searchInput(phrase), maxTotalChargeUsd: cap });
        await db.insertRun({ ...base, kind, apify_run_id: runId, usernames: [phrase], cap_usd: cap });
      }
      return { started: kind, note: null };
    }
    if (kind === "size") {
      const names = gathered.filter((c) => c.followers === null).map((c) => c.username).slice(0, SIZE_MAX_PROFILES - 1);
      const usernames = own === null ? [OWN_INSTAGRAM_USERNAME, ...names] : names;
      if (usernames.length === 0) return { started: null, note: null };
      const { runId } = await apify.startActor({ actorId: PROFILE_ACTOR, body: profilesInput(usernames), maxTotalChargeUsd: left });
      await db.insertRun({ ...base, kind, apify_run_id: runId, usernames, cap_usd: left });
      return { started: kind, note: null };
    }
    const usernames = [...sizedRows].sort((x, y) => (x.followers ?? 0) - (y.followers ?? 0)).slice(0, SAMPLE_MAX_CANDIDATES).map((c) => c.username);
    const { runId } = await apify.startActor({ actorId: APIFY_ACTOR, body: reelsInput(usernames), maxTotalChargeUsd: left });
    await db.insertRun({ ...base, kind, apify_run_id: runId, usernames, cap_usd: left });
    return { started: kind, note: null };
  } catch (e) {
    console.error("content discovery start", message(e));
    return { started: null, note: `Could not start a search: ${message(e)}` };
  }
}

// ---- Judging, suggesting, deciding ----


export const JUDGE_SECONDS = 45;
export const DISCOVERY_RESERVE_SECONDS = 20;
const NO_ROOM_REASON = "Passed, but ranked below this week's suggestions";

export type DiscoveryReport = {
  stage: "idle" | "waiting_on_apify" | "judging" | "done";
  started: DiscoveryRunKind | null;
  judged: number;
  suggested: number;
  dropped: number;
  note: string;
};

/**
 * Judges `sampled` candidates, smallest first, while there is time. A quiet account (under 4 Reels
 * in 30 days) costs no Claude call. An unusable answer or invented quote is one attempt; the second
 * attempt (on a later call) makes the candidate unreadable.
 */
export async function judgeSampled(db: DiscoveryDb, caller: ToolCaller, a: { now: Date; timeLeft: () => number }): Promise<{ judged: number; dropped: number }> {
  const at = a.now.toISOString();
  const rows = (await db.candidates(["sampled"])).sort((x, y) => (x.followers ?? 0) - (y.followers ?? 0));
  let judged = 0;
  let dropped = 0;
  for (const c of rows) {
    if (a.timeLeft() < JUDGE_SECONDS + DISCOVERY_RESERVE_SECONDS) break;
    if (!isActive(c.sample, a.now)) {
      const since = a.now.getTime() - ACTIVE_WINDOW_DAYS * 86_400_000;
      const recent = c.sample.filter((r) => Date.parse(r.posted_at) >= since).length;
      await db.setCandidate(c.id, "sampled", { outcome: "quiet", reason: `${recent} Reels in the last 30 days; it takes 4` }, at);
      judged += 1;
      dropped += 1;
      continue;
    }
    const captions = c.sample.map((r) => r.caption);
    let answer: ReturnType<typeof judgeSchema.safeParse> | null = null;
    try {
      const raw = await caller.call({
        system: judgeSystemPrompt(),
        text: renderJudgeTurn({ username: c.username, bio: c.bio, captions, declines: await db.declines(DECLINE_REASONS_IN_PROMPT) }),
        tool: { name: JUDGE_TOOL, description: "Record whether this creator's audience matches Miguel's readers.", schema: judgeToolSchema() },
        maxTokens: 1000,
      });
      answer = judgeSchema.safeParse(raw);
    } catch (e) {
      console.error("content discovery judge", c.username, message(e));
    }
    if (!answer || !answer.success || !quotesAreReal(answer.data.evidence, captions)) {
      const attempts = c.attempts + 1;
      if (attempts >= JUDGE_MAX_ATTEMPTS) {
        await db.setCandidate(c.id, "sampled", { outcome: "unreadable", reason: "The judge gave no usable answer", attempts }, at);
        judged += 1;
        dropped += 1;
      } else await db.setCandidate(c.id, "sampled", { attempts }, at);
      continue;
    }
    const j = answer.data;
    const outcome = judgeOutcome(j);
    await db.setCandidate(
      c.id,
      "sampled",
      {
        outcome,
        reader: j.reader,
        confidence: j.confidence,
        evidence: j.evidence,
        reason: outcome === "matched_decline" ? `Matches a reason you gave: ${j.matches_decline}` : j.reason,
        popular_count: popularCount(c.sample),
      },
      at,
    );
    judged += 1;
    if (outcome !== "fit") dropped += 1;
  }
  return { judged, dropped };
}

/**
 * Turns the week's fits into suggestions, best first, into the free slots. Waits until every sampled
 * candidate is judged and no sample run is pending. Whatever passed but found no slot is `no_room`.
 */
export async function suggestFits(db: DiscoveryDb, now: Date): Promise<{ suggested: number; dropped: number }> {
  const none = { suggested: 0, dropped: 0 };
  if ((await db.candidates(["sampled"])).length > 0) return none;
  if ((await db.pendingRuns()).some((r) => r.kind === "sample")) return none;
  const fits = await db.candidates(["fit"]);
  if (fits.length === 0) return none;
  const at = now.toISOString();
  let suggested = 0;
  let dropped = 0;
  const open = async (c: CandidateRow, reason: string) => {
    await db.setCandidate(c.id, "fit", { outcome: "no_room", reason }, at);
    dropped += 1;
  };
  const taken = new Set((await db.creators()).map((c) => c.username));
  const ranked = rankFits(fits.filter((c) => !taken.has(c.username)).map((c) => ({ ...c, confidence: c.confidence ?? 0 })));
  for (const c of fits.filter((c) => taken.has(c.username))) await open(c, "You added it yourself first");
  for (const c of ranked) {
    const waiting = (await db.creators()).filter((x) => x.status === "suggested").length;
    if (slotsFree(waiting) === 0) {
      await open(c, NO_ROOM_REASON);
      continue;
    }
    if (await db.suggest(c.username, at)) {
      await db.setCandidate(c.id, "fit", { outcome: "suggested" }, at);
      suggested += 1;
    } else await open(c, "You added it yourself first");
  }
  return { suggested, dropped };
}

/** Lapse, collect, start the next run, judge, suggest. `caller` null skips judging and suggesting (the cron). */
export async function advanceDiscovery(
  db: DiscoveryDb,
  apify: ApifyClient,
  caller: ToolCaller | null,
  a: { now: Date; force: boolean; own: OwnCount; trigger: "cron" | "routine" | "button"; timeLeft: () => number },
): Promise<DiscoveryReport> {
  const report: DiscoveryReport = { stage: "idle", started: null, judged: 0, suggested: 0, dropped: 0, note: "" };
  try {
    await lapseStale(db, a.now);
    const collected = await collectDiscoveryRuns(db, apify, { now: a.now, own: a.own });
    const start = await startNextRun(db, apify, { now: a.now, force: a.force, own: a.own });
    report.started = start.started;
    let judgedHere = false;
    if (caller) {
      const j = await judgeSampled(db, caller, a);
      report.judged = j.judged;
      judgedHere = j.judged > 0;
      const s = await suggestFits(db, a.now);
      report.suggested = s.suggested;
      report.dropped = j.dropped + s.dropped;
      if (s.suggested + s.dropped > 0) judgedHere = true;
    }
    const sampledLeft = (await db.candidates(["sampled"])).length;
    if ((await db.pendingRuns()).length > 0) report.stage = "waiting_on_apify";
    else if (sampledLeft > 0) report.stage = "judging";
    else if (judgedHere) report.stage = "done";
    report.note =
      collected.note ??
      (collected.errors.length > 0 ? `Could not read an Apify run: ${collected.errors[0]}` : null) ??
      (report.judged > 0 || report.suggested > 0 ? `Looked at ${report.judged} accounts, suggested ${report.suggested}.` : null) ??
      start.note ??
      (report.started ? `Started the ${report.started} run.` : report.stage === "waiting_on_apify" ? "Waiting on Apify." : "Nothing to do.");
  } catch (e) {
    console.error("content discovery", message(e));
    report.note = `Discovery stopped: ${message(e)}`;
  }
  try {
    await db.logCall(a.trigger, report.note, a.now.toISOString());
  } catch (e) {
    console.error("content discovery log", message(e));
  }
  return report;
}

/** Moves a suggestion to watching. The write is conditional, so a double click or a lapse answers "gone". */
export async function addSuggestion(db: DiscoveryDb, creatorId: string, now: Date): Promise<{ error: string | null }> {
  return (await db.decide(creatorId, "watching", "", now.toISOString())) ? { error: null } : { error: "That suggestion is gone." };
}

export async function declineSuggestion(db: DiscoveryDb, creatorId: string, reason: string, now: Date): Promise<{ error: string | null }> {
  const why = reason.trim().slice(0, 200);
  if (why === "") return { error: "Say why, so later suggestions improve." };
  return (await db.decide(creatorId, "declined", why, now.toISOString())) ? { error: null } : { error: "That suggestion is gone." };
}
