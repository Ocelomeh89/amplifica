import type { MetadataRoute } from "next";

// Public, indexable pages only. `/` currently redirects to /login, so the
// calculator is the sole entry until a public landing page ships.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return [
    {
      url: `${base}/calculator`,
      lastModified: new Date("2026-07-22"),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
