import type { MetadataRoute } from "next";

// One rule set for every crawler, AI search bots included (GPTBot,
// PerplexityBot, ClaudeBot, Google-Extended all obey `*`): public pages are
// open, the authenticated app and auth flows are not.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/amplicons",
          "/loc",
          "/projections",
          "/settings",
          "/compare",
          "/auth/",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
