import type { MetadataRoute } from "next";

// Public, indexable pages only.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return [
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
  ];
}
