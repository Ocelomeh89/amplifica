import type { MetadataRoute } from "next";
import { listNewsletterPosts } from "@/lib/beehiiv";

// Public, indexable pages only.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: new Date("2026-07-24"),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${base}/calculator`,
      lastModified: new Date("2026-07-22"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${base}/newsletter`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  // Newsletter posts. Best-effort: a beehiiv outage must not break the sitemap.
  let postEntries: MetadataRoute.Sitemap = [];
  try {
    postEntries = (await listNewsletterPosts()).map((post) => ({
      url: `${base}/newsletter/${post.slug}`,
      lastModified: post.publishedAt ?? undefined,
      changeFrequency: "monthly",
      priority: 0.7,
    }));
  } catch {
    postEntries = [];
  }

  return [...staticEntries, ...postEntries];
}
