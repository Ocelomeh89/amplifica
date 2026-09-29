import type { Pull, PulledPost } from "./types";

// beehiiv API v2, the same key the calculator uses. Not shared with
// features/calculator: features may not import each other.

export type BeehiivPost = {
  id: string;
  title: string;
  slug: string;
  web_url: string;
  /** Seconds since the Unix epoch. */
  publish_date: number;
  status: string;
  stats?: {
    email?: { recipients?: number; delivered?: number; opens?: number; unique_opens?: number; open_rate?: number; clicks?: number; unique_clicks?: number; click_rate?: number; unsubscribes?: number };
    web?: { views?: number; clicks?: number };
  };
};
type PostsPage = { data: BeehiivPost[]; page: number; total_pages: number };

export type BeehiivEnv = { apiKey?: string; publicationId?: string };

const n = (v: number | undefined): number | null => (typeof v === "number" ? v : null);
const pct = (v: number | undefined): number | null => (typeof v === "number" ? Math.round(v * 100) / 10000 : null);

export function mapBeehiivPost(p: BeehiivPost): PulledPost {
  const email = p.stats?.email;
  return {
    platform: "beehiiv",
    external_id: p.slug,
    url: p.web_url,
    format: "newsletter",
    posted_at: new Date(p.publish_date * 1000).toISOString(),
    caption: p.title,
    metrics: {
      views: n(p.stats?.web?.views),
      opens: n(email?.unique_opens),
      open_rate: pct(email?.open_rate),
      clicks: n(email?.unique_clicks),
      click_rate: pct(email?.click_rate),
      unsubscribes: n(email?.unsubscribes),
    },
    comments: [],
  };
}

const MAX_PAGES = 5;

export async function pullBeehiiv(env: BeehiivEnv, fetchImpl: typeof fetch = fetch): Promise<Pull> {
  if (!env.apiKey || !env.publicationId) {
    console.warn("beehiiv: BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set; skipping pull");
    return { posts: [], errors: ["beehiiv: BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set"] };
  }
  const posts: PulledPost[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({ "expand[]": "stats", status: "confirmed", limit: "100", page: String(page) });
      const res = await fetchImpl(`https://api.beehiiv.com/v2/publications/${env.publicationId}/posts?${params}`, {
        headers: { Authorization: `Bearer ${env.apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { posts, errors: [`beehiiv: posts page ${page} failed with ${res.status}`] };
      const body = (await res.json()) as PostsPage;
      posts.push(...body.data.map(mapBeehiivPost));
      if (page >= body.total_pages) break;
    }
    return { posts, errors: [] };
  } catch (e) {
    return { posts, errors: [`beehiiv: ${(e as Error).message}`] };
  }
}
