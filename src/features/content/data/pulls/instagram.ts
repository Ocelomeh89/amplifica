import type { Format, MetricSnapshot } from "@/features/content/engine/types";
import type { Pull, PulledComment, PulledPost } from "./types";

// Instagram Graph API through Composio's REST API, using the existing
// `instagram_schism-beano` connected account. Tool slugs and shapes were
// recorded with `composio execute <slug> --get-schema` on 2026-09-21.

export type ComposioEnv = { apiKey?: string; connectionId?: string };

export type IgMedia = {
  id: string;
  caption?: string | null;
  media_type: string;
  media_product_type?: string;
  permalink: string;
  timestamp: string;
  like_count?: number | null;
  comments_count?: number | null;
};
type MediaPage = { data: IgMedia[]; paging?: { cursors?: { after?: string } } };
export type InsightRow = { name: string; values?: { value: number }[] };
type IgComment = { id: string; text?: string; timestamp: string; username?: string; from?: { id?: string; username?: string } };

const BASE = "https://backend.composio.dev/api/v3.1/tools/execute";

export async function composioExecute<T>(
  slug: string,
  args: Record<string, unknown>,
  env: Required<ComposioEnv>,
  fetchImpl: typeof fetch = fetch
): Promise<T> {
  const res = await fetchImpl(`${BASE}/${slug}`, {
    method: "POST",
    headers: { "x-api-key": env.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ connected_account_id: env.connectionId, arguments: args }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`composio ${slug}: HTTP ${res.status}`);
  const body = (await res.json()) as { successful: boolean; data: T; error: string | null };
  if (!body.successful) throw new Error(`composio ${slug}: ${body.error ?? "failed"}`);
  return body.data;
}

export function igFormat(m: IgMedia): Format | "" {
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_product_type === "STORY") return "story";
  return "";
}

const UNIVERSAL = ["views", "reach", "saved", "likes", "comments", "shares"];
export function insightMetricsFor(productType: string | undefined): string[] {
  return productType === "REELS" ? [...UNIVERSAL, "ig_reels_avg_watch_time"] : UNIVERSAL;
}

export function mapInsights(rows: InsightRow[]): MetricSnapshot {
  const get = (name: string): number | null => {
    const v = rows.find((r) => r.name === name)?.values?.[0]?.value;
    return typeof v === "number" ? v : null;
  };
  const out: MetricSnapshot = {
    views: get("views"),
    reach: get("reach"),
    likes: get("likes"),
    comments: get("comments"),
    saves: get("saved"),
    shares: get("shares"),
  };
  const watchMs = get("ig_reels_avg_watch_time");
  if (watchMs != null) out.avg_watch_time_s = watchMs / 1000;
  return out;
}

/** The shortcode from a permalink, the same id `externalIdFromUrl` derives from a pasted URL. */
function shortcode(permalink: string): string {
  const parts = new URL(permalink).pathname.split("/").filter(Boolean);
  const i = parts.findIndex((p) => p === "reel" || p === "p" || p === "reels");
  return i >= 0 && parts[i + 1] ? parts[i + 1] : parts[parts.length - 1] ?? "";
}

export function mapIgMedia(m: IgMedia, insights: InsightRow[] | null, comments: IgComment[]): PulledPost {
  const metrics: MetricSnapshot = insights
    ? mapInsights(insights)
    : { likes: m.like_count ?? null, comments: m.comments_count ?? null };
  return {
    platform: "instagram",
    external_id: shortcode(m.permalink),
    url: m.permalink,
    format: igFormat(m),
    posted_at: new Date(m.timestamp).toISOString(),
    caption: m.caption ?? "",
    metrics,
    comments: comments.map(
      (c): PulledComment => ({
        external_id: c.id,
        author: c.from?.username ?? c.username ?? "",
        text: c.text ?? "",
        occurred_at: new Date(c.timestamp).toISOString(),
      })
    ),
  };
}

const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";
const MAX_MEDIA = 100;
const CONCURRENCY = 4;

export async function pullInstagram(env: ComposioEnv, fetchImpl: typeof fetch = fetch): Promise<Pull> {
  if (!env.apiKey || !env.connectionId) {
    console.warn("instagram: COMPOSIO_API_KEY / COMPOSIO_IG_CONNECTION_ID not set; skipping pull");
    return { posts: [], errors: ["instagram: COMPOSIO_API_KEY / COMPOSIO_IG_CONNECTION_ID not set"] };
  }
  const full = env as Required<ComposioEnv>;
  const errors: string[] = [];
  const media: IgMedia[] = [];
  try {
    let after: string | undefined;
    while (media.length < MAX_MEDIA) {
      const page = await composioExecute<MediaPage>(
        "INSTAGRAM_GET_IG_USER_MEDIA",
        { ig_user_id: "me", limit: 50, fields: MEDIA_FIELDS, ...(after ? { after } : {}) },
        full,
        fetchImpl
      );
      media.push(...page.data);
      after = page.paging?.cursors?.after;
      if (!after || page.data.length === 0) break;
    }
  } catch (e) {
    return { posts: [], errors: [`instagram: media list failed: ${(e as Error).message}`] };
  }

  const posts: PulledPost[] = [];
  for (let i = 0; i < media.length; i += CONCURRENCY) {
    const batch = media.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (m) => {
        let insights: InsightRow[] | null = null;
        let comments: IgComment[] = [];
        try {
          const r = await composioExecute<{ data: InsightRow[] }>(
            "INSTAGRAM_GET_IG_MEDIA_INSIGHTS",
            { ig_media_id: m.id, metric: insightMetricsFor(m.media_product_type) },
            full,
            fetchImpl
          );
          insights = r.data;
        } catch (e) {
          console.error(`instagram: insights for ${m.id} failed`, e);
          errors.push(`instagram: insights ${m.id}: ${(e as Error).message}`);
        }
        try {
          const r = await composioExecute<{ data: IgComment[] }>(
            "INSTAGRAM_GET_IG_MEDIA_COMMENTS",
            { ig_media_id: m.id, limit: 50, fields: "id,text,username,timestamp,from" },
            full,
            fetchImpl
          );
          comments = r.data;
        } catch (e) {
          console.error(`instagram: comments for ${m.id} failed`, e);
          errors.push(`instagram: comments ${m.id}: ${(e as Error).message}`);
        }
        return mapIgMedia(m, insights, comments);
      })
    );
    posts.push(...settled);
  }
  return { posts, errors };
}
