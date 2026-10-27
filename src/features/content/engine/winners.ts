import type { Multiplier, PostScore } from "./baseline";
import { TAG_LABELS, type PostTags } from "./tags";

// "What it shares with your winners": counts of tag values among the top posts
// against the rest, computed on read. Small samples are normal here, so every
// threshold is conservative and the result always carries a caveat.

export type WinnerPost = PostTags & { id: string; media_type: string; posted_at: string };

export type WinnerInsights =
  | { state: "untagged" }
  | { state: "thin"; have: number; need: number }
  | { state: "ok"; winners: number; rest: number; shared: string[]; message: string | null; lacks: string | null; caveat: string };

export const WINNERS_MAX = 10;
export const MIN_ELIGIBLE = 15;
export const MIN_WINNERS = 5;
export const MIN_MATCHED_DAY = 7;
export const LACKS_MIN_REST = 15;
export const SMALL_SAMPLE = "Small sample. Read these as hints, not rules.";

/** A multiplier that has settled enough to rank: settled, or matched at day 7 or later. */
export function isEligible(m: Multiplier): boolean {
  if (m.n_views === null) return false;
  if (m.mode === "settled") return true;
  return m.mode === "matched" && m.day !== null && m.day >= MIN_MATCHED_DAY;
}

type Trait = { key: string; line: string; lack: string; has: (p: PostTags) => boolean };

const FIELD_LABEL = { onscreen_text: "On-screen text", cta_type: "CTA", post_style: "Post style" } as const;
const COVER = [
  { key: "cover_face", phrase: "a face on the cover", pronoun: "one" },
  { key: "cover_text", phrase: "text on the cover", pronoun: "it" },
  { key: "cover_number", phrase: "a number on the cover", pronoun: "one" },
] as const;

/** The traits this post could share with winners, in a stable order. */
function traitsOf(p: PostTags): Trait[] {
  const out: Trait[] = [];
  if (p.hook_type) {
    const v = p.hook_type;
    out.push({ key: `hook_type:${v}`, line: `${TAG_LABELS[v] ?? v} hooks`, lack: `${(TAG_LABELS[v] ?? v).toLowerCase()} hooks`, has: (q) => q.hook_type === v });
  }
  for (const f of ["onscreen_text", "cta_type", "post_style"] as const) {
    const v = p[f];
    if (!v || v === "none") continue;
    out.push({ key: `${f}:${v}`, line: `${FIELD_LABEL[f]}: ${TAG_LABELS[v] ?? v}`, lack: `${FIELD_LABEL[f]} ${(TAG_LABELS[v] ?? v).toLowerCase()}`, has: (q) => q[f] === v });
  }
  for (const c of COVER) {
    if (p[c.key] === true) out.push({ key: c.key, line: `Cover: ${c.phrase}`, lack: c.phrase, has: (q) => q[c.key] === true });
  }
  return out;
}

/** Candidate lacks: every trait winners might carry that this post does not. */
function lackCandidates(winners: PostTags[], post: PostTags): { key: string; phrase: string; pronoun: string; has: (p: PostTags) => boolean }[] {
  const seen = new Map<string, { key: string; phrase: string; pronoun: string; has: (p: PostTags) => boolean }>();
  for (const c of COVER) {
    if (post[c.key] === false) seen.set(c.key, { key: c.key, phrase: c.phrase, pronoun: c.pronoun, has: (q) => q[c.key] === true });
  }
  for (const w of winners) {
    for (const t of traitsOf(w)) {
      if (t.key.startsWith("cover_") || seen.has(t.key)) continue;
      if (traitsOf(post).some((x) => x.key === t.key)) continue;
      seen.set(t.key, { key: t.key, phrase: t.lack, pronoun: "it", has: t.has });
    }
  }
  return [...seen.values()];
}

export function winnerInsights(
  post: WinnerPost,
  posts: WinnerPost[],
  scores: Map<string, PostScore>,
  windowStart: Date
): WinnerInsights {
  if (post.tagged_at === null) return { state: "untagged" };

  const since = windowStart.getTime();
  const ranked = posts
    .filter((p) => p.id !== post.id && p.media_type === post.media_type && p.tagged_at !== null && new Date(p.posted_at).getTime() >= since)
    .map((p) => ({ p, m: scores.get(p.id)?.multiplier }))
    .filter((x): x is { p: WinnerPost; m: Multiplier } => x.m !== undefined && isEligible(x.m))
    .sort((a, b) => (b.m.n_views as number) - (a.m.n_views as number) || (a.p.id < b.p.id ? -1 : 1));

  if (ranked.length < MIN_ELIGIBLE) return { state: "thin", have: ranked.length, need: MIN_ELIGIBLE };

  const count = Math.min(WINNERS_MAX, Math.floor(ranked.length / 3));
  const winners = ranked.slice(0, count).map((x) => x.p);
  const rest = ranked.slice(count).map((x) => x.p);

  const tally = (has: (p: PostTags) => boolean) => ({
    w: winners.filter(has).length,
    r: rest.filter(has).length,
  });

  const shared = traitsOf(post).map((t) => {
    const { w, r } = tally(t.has);
    return `${t.line}: ${w} of your top ${winners.length}, ${r} of the other ${rest.length}.`;
  });

  let message: string | null = null;
  if (post.message && post.message !== "none") {
    const carrying = ranked.filter((x) => x.p.message === post.message);
    const above = carrying.filter((x) => (x.m.n_views as number) > 1).length;
    const k = carrying.length;
    message = `Message: ${TAG_LABELS[post.message] ?? post.message}. ${k} post${k === 1 ? "" : "s"} carr${k === 1 ? "ies" : "y"} it, ${above} above median.`;
  }

  let lacks: string | null = null;
  if (rest.length >= LACKS_MIN_REST) {
    const best = lackCandidates(winners, post)
      .map((c) => ({ c, w: tally(c.has).w }))
      .filter((x) => x.w * 2 >= winners.length)
      .sort((a, b) => b.w - a.w || (a.c.phrase < b.c.phrase ? -1 : 1))[0];
    if (best) lacks = `Not in this post: ${best.c.phrase}. ${best.w} of your top ${winners.length} have ${best.c.pronoun}.`;
  }

  return { state: "ok", winners: winners.length, rest: rest.length, shared, message, lacks, caveat: SMALL_SAMPLE };
}
