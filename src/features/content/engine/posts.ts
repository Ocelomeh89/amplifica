import type { Platform } from "./types";

/** Which platform a pasted post URL belongs to, or null when it is none of ours. */
export function platformFromUrl(url: string): Platform | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (host === "instagram.com") return "instagram";
  if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") return "youtube";
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host.endsWith("beehiiv.com") || host === "newsletter.amplificawealth.com") return "beehiiv";
  return null;
}

/**
 * The stable id a metric cron will also see for the same post, so a post
 * logged by hand and one discovered by the cron land on one row.
 */
export function externalIdFromUrl(url: string, platform: Platform): string {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  switch (platform) {
    case "instagram": {
      const i = parts.findIndex((p) => p === "reel" || p === "p" || p === "reels");
      return i >= 0 && parts[i + 1] ? parts[i + 1] : parts[parts.length - 1] ?? "";
    }
    case "youtube": {
      const v = u.searchParams.get("v");
      if (v) return v;
      if (u.hostname.replace(/^www\./, "") === "youtu.be") return parts[0] ?? "";
      const i = parts.findIndex((p) => p === "shorts" || p === "live" || p === "embed");
      return i >= 0 && parts[i + 1] ? parts[i + 1] : parts[parts.length - 1] ?? "";
    }
    case "x": {
      const i = parts.indexOf("status");
      return i >= 0 && parts[i + 1] ? parts[i + 1] : parts[parts.length - 1] ?? "";
    }
    case "beehiiv":
      return parts[parts.length - 1] ?? "";
  }
}
