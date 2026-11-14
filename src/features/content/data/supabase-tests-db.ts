import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";
import { WINDOW_DAYS, scorePosts } from "@/features/content/engine/baseline";
import { chicagoIsoDate } from "@/features/content/engine/best-times";
import { controlRecipe, evidenceCounts, outcomeOf, type EvidencePost } from "@/features/content/engine/experiments";
import { evidenceWithoutSkipped, focusCounts, isSkipped, type ExtraOutcome, type FocusPost } from "@/features/content/engine/focus";
import { RECENT_HOOK_DAYS } from "@/features/content/engine/recreate";
import type { PastTest, PickerInput, Question } from "@/features/content/engine/test-lab-picker";
import { median24h, outcomesOf, type TestStatus, type TestVariable, type TestVerdict } from "@/features/content/engine/test-lab-verdict";
import { activeFocus } from "./focus";
import { loadPostsForMath } from "./performance";
import { supabaseFocusDb } from "./supabase-focus-db";
import { PROPOSALS_PER_DAY } from "@/features/content/engine/test-lab-verdict";
import type { Dropped, OpenPatch, TestRow, TestsDb, TestsPage, TestView, VersionInsert, VersionRow, WriterContext } from "./test-lab";
import { chicagoDayStart } from "./recreate";
import { loadTopics } from "./topics";

type Client = SupabaseClient<Database>;

const DAY = 86_400_000;
const PAST_DAYS = 120;
const SKIP_REASONS_KEPT = 5;
const HOOKS_EACH = 40;

const fail = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`tests ${what}: ${error.message}`);
};

/**
 * What the judged tests add to the evidence counts: a win and a loss, or a flat for each value. Shared with the
 * review's `loadExtraOutcomes`. Every query filters by the owner.
 */
export async function loadJudgedOutcomes(client: Client, userId: string, windowStart: Date): Promise<ExtraOutcome[]> {
  const { data, error } = await client
    .from("content_tests")
    .select("variable, value_a, value_b, verdict, judged_at")
    .eq("user_id", userId)
    .eq("status", "judged")
    .gte("judged_at", windowStart.toISOString());
  fail("outcomes", error);
  return (data ?? []).flatMap((t) =>
    t.variable && t.value_a && t.value_b && t.verdict && t.judged_at
      ? outcomesOf({ variable: t.variable, value_a: t.value_a, value_b: t.value_b, verdict: t.verdict, judged_at: t.judged_at })
      : []
  );
}

/**
 * Every query filters by the owner. The cron and the background jobs run with the admin client, which
 * bypasses RLS, so this filter is what keeps them to Miguel's rows.
 */
export function supabaseTestsDb(client: Client, userId: string): TestsDb {
  const tests = () => client.from("content_tests");
  const versions = () => client.from("content_test_versions");

  /** The ideas a proposing or open test holds. They stay `inbox` and untouched; this list is the hold. */
  const heldIdeaIds = async (): Promise<Set<string>> => {
    const { data: live, error } = await tests().select("id").eq("user_id", userId).in("status", ["proposing", "open"]);
    fail("held tests", error);
    const ids = (live ?? []).map((t) => (t as { id: string }).id);
    if (ids.length === 0) return new Set();
    const { data, error: e2 } = await versions().select("idea_id").eq("user_id", userId).in("test_id", ids);
    fail("held ideas", e2);
    return new Set((data ?? []).map((v) => (v as { idea_id: string | null }).idea_id).filter((x): x is string => !!x));
  };

  /** Tests with their versions, in one extra read. */
  const withVersions = async (rows: TestRow[]): Promise<TestView[]> => {
    if (rows.length === 0) return [];
    const { data, error } = await versions().select("*").eq("user_id", userId).in("test_id", rows.map((r) => r.id)).order("label");
    fail("versions", error);
    const all = (data ?? []) as VersionRow[];
    return rows.map((r) => ({ ...r, versions: all.filter((v) => v.test_id === r.id) }));
  };

  const db: TestsDb = {
    async expireStale(beforeIso) {
      const { error } = await tests()
        .update({ status: "failed", error: "Timed out", closed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("status", "proposing")
        .lt("created_at", beforeIso);
      fail("expire", error);
    },

    async live() {
      const { data, error } = await tests().select("*").eq("user_id", userId).in("status", ["proposing", "open"]).limit(1);
      fail("live", error);
      return ((data ?? [])[0] as TestRow | undefined) ?? null;
    },

    async countSince(sinceIso) {
      const { count, error } = await tests().select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", sinceIso);
      fail("count", error);
      return count ?? 0;
    },

    async insertProposing(trigger) {
      const { data, error } = await tests().insert({ user_id: userId, trigger }).select("id");
      // The one-live index lets only one proposing or open row in; a second start loses quietly.
      if (error && (error as { code?: string }).code === "23505") return null;
      fail("insert", error);
      return ((data ?? [])[0] as { id: string } | undefined)?.id ?? null;
    },

    async pickerInput(now) {
      const today = chicagoIsoDate(now);
      const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY);
      const focusRows = await supabaseFocusDb(client, userId).rows();
      const focus = activeFocus(focusRows, today);
      const [loaded, extra, topics] = await Promise.all([loadPostsForMath(client, userId), loadJudgedOutcomes(client, userId, windowStart), loadTopics(client, userId)]);
      const { scores } = scorePosts(loaded, now);
      const scoreMap = new Map(scores.map((s) => [s.id, s]));
      const ev = evidenceCounts(loaded as EvidencePost[], scoreMap, windowStart, extra);
      const fc = focusCounts(loaded as FocusPost[], scoreMap, windowStart, extra);
      const control = controlRecipe(evidenceWithoutSkipped(ev, focus));

      const hookWinTopics: Record<string, string[]> = {};
      const addWin = (hook: string, topic: string) => {
        if (hook === "" || topic === "") return;
        const list = hookWinTopics[hook] ?? (hookWinTopics[hook] = []);
        if (!list.includes(topic)) list.push(topic);
      };
      for (const p of loaded) {
        if (p.media_type !== "reel" || p.tagged_at === null || new Date(p.posted_at).getTime() < windowStart.getTime()) continue;
        if (outcomeOf(scoreMap.get(p.id)?.status ?? null) === "won") addWin(p.hook_type, p.topic);
      }

      const past = await loadPast(client, userId, now);
      for (const t of past) {
        if (t.variable === "hook_type" && t.status === "judged" && (t.verdict === "a" || t.verdict === "b")) addWin(t.verdict === "a" ? t.a : t.b, t.held.topic ?? "");
      }

      const endedSkips = focusRows
        .filter((r) => r.kind === "skip" && (r.lifted_at !== null || (r.ends_on !== null && r.ends_on <= today)))
        .map((r) => ({ dimension: r.dimension, value: r.value, ended_on: (r.lifted_at ?? r.ends_on ?? today).slice(0, 10) }));

      // The Inbox Reels a test could carry, best first: not briefed by Today, not held by a live test, not under a skip.
      const [{ data: briefed, error: briefedError }, held, { data: ideaRows, error: ideaError }] = await Promise.all([
        client.from("content_experiments").select("idea_id").eq("user_id", userId),
        heldIdeaIds(),
        client
          .from("content_ideas")
          .select("id, pillar, hook_type, topic")
          .eq("user_id", userId)
          .eq("status", "inbox")
          .eq("format", "reel")
          .neq("topic", "")
          .order("score", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      fail("briefed", briefedError);
      fail("ideas", ideaError);
      const taken = new Set((briefed ?? []).map((c) => (c as { idea_id: string }).idea_id));
      const ideas = (ideaRows ?? [])
        .filter((i) => !taken.has(i.id) && !held.has(i.id) && i.pillar !== "" && !isSkipped(focus, { hook_type: i.hook_type ?? "", topic: i.topic ?? "" }))
        .map((i) => ({ id: i.id, topic: i.topic as string, pillar: i.pillar as string }));

      return {
        counts: { hook_type: fc.hook_type, topic: fc.topic, onscreen_text: ev.onscreen_text },
        control: { hook_type: control.hook_type, onscreen_text: control.onscreen_text },
        focus,
        hookWinTopics,
        endedSkips,
        topics,
        ideas,
        past,
        today,
      } satisfies PickerInput;
    },

    async writerContext(q: Question): Promise<WriterContext> {
      const [{ data: ideaRows, error: ideaError }, { data: skipped, error: skipError }, { data: rules, error: ruleError }, topics] = await Promise.all([
        client.from("content_ideas").select("id, title, hook, topic").eq("user_id", userId).in("id", q.ideaIds),
        tests().select("skip_reason").eq("user_id", userId).eq("status", "skipped").neq("skip_reason", "").order("closed_at", { ascending: false }).limit(SKIP_REASONS_KEPT),
        client.from("content_taste_rules").select("rule").eq("user_id", userId).eq("status", "active").order("evidence_count", { ascending: false }),
        loadTopics(client, userId),
      ]);
      fail("writer ideas", ideaError);
      fail("writer skips", skipError);
      fail("writer rules", ruleError);
      const byId = new Map((ideaRows ?? []).map((i) => [i.id, i]));
      const since = new Date(Date.now() - RECENT_HOOK_DAYS * DAY).toISOString();
      const [{ data: hookRows, error: hookError }, { data: postRows, error: postError }] = await Promise.all([
        client.from("content_ideas").select("hook").eq("user_id", userId).in("status", ["inbox", "queued"]).gte("created_at", since).order("created_at", { ascending: false }).limit(HOOKS_EACH),
        // A test post's hook is a recent hook too, so this read keeps test posts.
        client.from("content_posts").select("hook_spoken, hook_onscreen, hook_used").eq("user_id", userId).gte("posted_at", since).order("posted_at", { ascending: false }).limit(HOOKS_EACH),
      ]);
      fail("writer hooks", hookError);
      fail("writer post hooks", postError);
      const recentHooks = [
        ...new Set([
          ...(hookRows ?? []).map((i) => i.hook).filter(Boolean),
          ...(postRows ?? []).map((p) => p.hook_spoken || p.hook_onscreen || p.hook_used).filter(Boolean),
        ]),
      ];
      return {
        ideas: q.ideaIds.map((id) => ({ title: byId.get(id)?.title ?? "", hook: byId.get(id)?.hook ?? "", topic: byId.get(id)?.topic ?? "" })),
        skipReasons: (skipped ?? []).map((t) => t.skip_reason).filter(Boolean),
        recentHooks,
        rules: (rules ?? []).map((r) => r.rule),
        pillarTopics: topics.filter((t) => t.pillar === q.held.pillar).map((t) => t.slug),
      };
    },

    async openTest(id, row: OpenPatch, rows: VersionInsert[]) {
      // Versions first: they need the proposing row to exist, and a row left proposing without versions goes stale and fails.
      const { error: insertError } = await versions().insert(
        rows.map((v) => ({ user_id: userId, test_id: id, label: v.label, value: v.value, idea_id: v.idea_id, hook: v.hook, card_text: v.card_text, outline: v.outline as unknown as Json, gate: v.gate as unknown as Json }))
      );
      fail("versions insert", insertError);
      const { data, error } = await tests()
        .update({ ...row, held: row.held as unknown as Json, notes: row.notes as unknown as Json, dropped: row.dropped as unknown as Json, status: "open" })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "proposing")
        .select("id");
      fail("open", error);
      if ((data ?? []).length > 0) return true;
      // The row was failed or expired meanwhile: take the versions back.
      await versions().delete().eq("test_id", id).eq("user_id", userId);
      return false;
    },

    async failTest(id, error, dropped: Dropped[]) {
      const { error: e } = await tests()
        .update({ status: "failed", error, dropped: dropped as unknown as Json, closed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "proposing");
      fail("fail", e);
    },

    async get(id) {
      const { data, error } = await tests().select("*").eq("user_id", userId).eq("id", id).limit(1);
      fail("get", error);
      const row = (data ?? [])[0] as TestRow | undefined;
      if (!row) return null;
      const { data: vs, error: e2 } = await versions().select("*").eq("user_id", userId).eq("test_id", id).order("label");
      fail("get versions", e2);
      return { ...row, versions: (vs ?? []) as VersionRow[] } satisfies TestView;
    },

    async page(now): Promise<TestsPage> {
      const { data, error } = await tests().select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(60);
      fail("page", error);
      const rows = (data ?? []) as TestRow[];
      const dayStart = chicagoDayStart(now).toISOString();
      const finished = rows.filter((t) => t.status === "judged" || t.status === "skipped" || t.status === "not_run");
      const when = (t: TestRow) => t.judged_at ?? t.closed_at ?? t.created_at;
      const sorted = [...finished].sort((a, b) => when(b).localeCompare(when(a)));
      const latestRow = sorted.find((t) => t.status === "judged") ?? null;
      const open = rows.find((t) => t.status === "open") ?? null;
      const shown = await withVersions([...(open ? [open] : []), ...(latestRow ? [latestRow] : []), ...sorted.filter((t) => t !== latestRow).slice(0, 50)]);
      const byId = new Map(shown.map((t) => [t.id, t]));
      const newest = rows[0];
      return {
        open: open ? (byId.get(open.id) ?? null) : null,
        proposing: rows.some((t) => t.status === "proposing"),
        lastFailed: newest && newest.status === "failed" && newest.created_at >= dayStart ? { error: newest.error } : null,
        latest: latestRow ? (byId.get(latestRow.id) ?? null) : null,
        past: sorted.filter((t) => t !== latestRow).slice(0, 50).map((t) => byId.get(t.id) as TestView),
        proposalsLeft: Math.max(0, PROPOSALS_PER_DAY - rows.filter((t) => t.created_at >= dayStart).length),
        labels: Object.fromEntries((await loadTopics(client, userId)).map((t) => [t.slug, t.label])),
      };
    },

    async withoutConclusion() {
      const { data, error } = await tests().select("*").eq("user_id", userId).eq("status", "judged").eq("conclusion", "").order("judged_at");
      fail("without conclusion", error);
      return withVersions((data ?? []) as TestRow[]);
    },

    async setConclusion(id, text) {
      const { error } = await tests().update({ conclusion: text }).eq("id", id).eq("user_id", userId).eq("conclusion", "");
      fail("conclusion", error);
    },

    async openTests() {
      const { data, error } = await tests().select("*").eq("user_id", userId).eq("status", "open").order("created_at");
      fail("open", error);
      return withVersions((data ?? []) as TestRow[]);
    },

    async saveTyped(testId, label, n) {
      const { data: open, error } = await tests().select("id").eq("user_id", userId).eq("id", testId).eq("status", "open").limit(1);
      fail("typed check", error);
      if ((open ?? []).length === 0) return false;
      const { data, error: e2 } = await versions()
        .update({ typed_views: n.views, typed_saves: n.saves, typed_shares: n.shares, link: n.link })
        .eq("user_id", userId)
        .eq("test_id", testId)
        .eq("label", label)
        .select("id");
      fail("typed save", e2);
      return (data ?? []).length > 0;
    },

    async median24h(now) {
      // Normal Reels only: the default read leaves test posts out.
      const since = now.getTime() - WINDOW_DAYS * DAY;
      const posts = await loadPostsForMath(client, userId);
      return median24h(posts.filter((p) => p.platform === "instagram" && p.media_type === "reel" && new Date(p.posted_at).getTime() >= since));
    },

    async labels() {
      return Object.fromEntries((await loadTopics(client, userId)).map((t) => [t.slug, t.label]));
    },

    async judge(id, patch) {
      for (const v of patch.versions) {
        const { error } = await versions()
          .update({ views_24h: v.views_24h, saves_24h: v.saves_24h, shares_24h: v.shares_24h, read_at: v.read_at, promote: v.promote })
          .eq("user_id", userId)
          .eq("test_id", id)
          .eq("label", v.label);
        fail("judge version", error);
      }
      const { data, error } = await tests()
        .update({ status: "judged", verdict: patch.verdict, verdict_line: patch.verdict_line, judged_at: patch.judged_at })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "open")
        .select("id");
      fail("judge", error);
      return (data ?? []).length > 0;
    },

    async pendingEffects() {
      const { data, error } = await tests().select("*").eq("user_id", userId).eq("status", "judged").is("effects_at", null).order("judged_at");
      fail("pending effects", error);
      return withVersions((data ?? []) as TestRow[]);
    },

    async useIdea(ideaId, postId) {
      // Outcome C has no post row: the idea is used up by archiving it, and only while it is still in the Inbox or queue
      // (an idea Miguel passed meanwhile is left as it is). Linking a post is the post-picker variant, not built.
      if (postId !== null) throw new Error("Linking an idea to a test post is not built yet.");
      const { error } = await client.from("content_ideas").update({ status: "archived" }).eq("id", ideaId).eq("user_id", userId).in("status", ["inbox", "queued"]);
      fail("use idea", error);
    },

    async markEffects(id, atIso) {
      const { error } = await tests().update({ effects_at: atIso }).eq("id", id).eq("user_id", userId);
      fail("effects", error);
    },

    async close(id, status, reason) {
      const { data, error } = await tests()
        .update({ status, closed_at: new Date().toISOString(), ...(status === "skipped" ? { skip_reason: reason } : { error: reason }) })
        .eq("id", id)
        .eq("user_id", userId)
        .eq("status", "open")
        .select("id");
      fail("close", error);
      return (data ?? []).length > 0;
    },
  };
  return db;
}

/** The last 120 days of tests that reached a question, for the picker's no-repeat and rule 1. */
async function loadPast(client: Client, userId: string, now: Date): Promise<PastTest[]> {
  const since = new Date(now.getTime() - PAST_DAYS * DAY).toISOString();
  const { data, error } = await client
    .from("content_tests")
    .select("variable, value_a, value_b, status, verdict, held, opened_at, judged_at")
    .eq("user_id", userId)
    .gte("created_at", since);
  fail("past", error);
  return (data ?? []).flatMap((t) =>
    t.variable && t.value_a && t.value_b
      ? [
          {
            variable: t.variable as TestVariable,
            a: t.value_a,
            b: t.value_b,
            status: t.status as TestStatus,
            verdict: t.verdict as TestVerdict | null,
            held: (t.held ?? {}) as PastTest["held"],
            opened_at: t.opened_at,
            judged_at: t.judged_at,
          },
        ]
      : []
  );
}
