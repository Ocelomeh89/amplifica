import "server-only";

// Best-effort Beehiiv subscribe for calculator leads. Never throws: the lead
// is already durable in Postgres by the time this runs, so a Beehiiv outage
// must not block the unlock. Await it in the action — fire-and-forget work
// can be killed after the response on Vercel serverless.
export async function subscribeToNewsletter(email: string): Promise<boolean> {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  if (!apiKey || !publicationId) {
    console.warn("beehiiv: BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set; skipping subscribe");
    return false;
  }

  try {
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${publicationId}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          utm_source: "calculator",
          utm_medium: "organic",
        }),
        signal: AbortSignal.timeout(5000),
      }
    );
    // 2xx covers new and already-existing subscribers (Beehiiv returns the
    // existing subscription rather than an error).
    if (!res.ok) {
      console.error(`beehiiv: subscribe failed with ${res.status} for ${email}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("beehiiv: subscribe request failed", e);
    return false;
  }
}

// Read-only beehiiv v2 API client. Powers the first-party /newsletter section
// so posts live on the main domain (amplificawealth.com/newsletter) instead of
// the beehiiv subdomain, consolidating SEO authority on the root domain.
//
// We render `content.free.rss` (a clean, self-contained article fragment with
// scoped .beehiiv styles), NOT `content.free.web` (a full standalone HTML
// document that can't be embedded in our layout).

const API_BASE = "https://api.beehiiv.com/v2";
const REVALIDATE_SECONDS = 3600;

function config() {
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
  const apiKey = process.env.BEEHIIV_API_KEY;
  if (!publicationId || !apiKey) {
    throw new Error("BEEHIIV_PUBLICATION_ID and BEEHIIV_API_KEY must be set");
  }
  return { publicationId, apiKey };
}

type BeehiivPost = {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  status: string;
  publish_date: number | null;
  thumbnail_url: string | null;
  web_url: string | null;
  meta_default_title: string | null;
  meta_default_description: string | null;
  hidden_from_feed: boolean;
  content?: { free?: { rss?: string } };
};

export type NewsletterListItem = {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
};

export type NewsletterPost = NewsletterListItem & {
  metaTitle: string;
  metaDescription: string | null;
  bodyHtml: string | null;
  beehiivUrl: string | null;
};

async function beehiivFetch(path: string): Promise<{ data?: unknown }> {
  const { apiKey } = config();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!res.ok) {
    throw new Error(`beehiiv ${path} -> ${res.status}`);
  }
  return res.json();
}

function toListItem(p: BeehiivPost): NewsletterListItem {
  return {
    id: p.id,
    title: p.title,
    subtitle: p.subtitle ?? null,
    slug: p.slug,
    publishedAt: p.publish_date ? new Date(p.publish_date * 1000) : null,
    thumbnailUrl: p.thumbnail_url ?? null,
  };
}

async function fetchConfirmedPosts(): Promise<BeehiivPost[]> {
  const { publicationId } = config();
  const data = await beehiivFetch(
    `/publications/${publicationId}/posts?status=confirmed&order_by=publish_date&direction=desc&limit=100`
  );
  const posts = (data?.data ?? []) as BeehiivPost[];
  return posts.filter((p) => p.status === "confirmed" && !p.hidden_from_feed && Boolean(p.slug));
}

export async function listNewsletterPosts(): Promise<NewsletterListItem[]> {
  return (await fetchConfirmedPosts()).map(toListItem);
}

export async function listNewsletterSlugs(): Promise<string[]> {
  return (await fetchConfirmedPosts()).map((p) => p.slug);
}

export async function getNewsletterPost(slug: string): Promise<NewsletterPost | null> {
  const { publicationId } = config();
  // The API has no get-by-slug, so resolve the post id from the feed first.
  const match = (await fetchConfirmedPosts()).find((p) => p.slug === slug);
  if (!match) return null;

  const data = await beehiivFetch(
    `/publications/${publicationId}/posts/${match.id}?expand[]=free_rss_content`
  );
  const p = (data?.data ?? match) as BeehiivPost;
  return {
    ...toListItem(p),
    metaTitle: p.meta_default_title ?? p.title,
    metaDescription: p.meta_default_description ?? p.subtitle ?? null,
    bodyHtml: p.content?.free?.rss ?? null,
    beehiivUrl: p.web_url ?? null,
  };
}
