import type { Pull, PulledComment, PulledPost } from "./types";

// YouTube Data API v3 with an API key. Watch time and retention need the
// OAuth Analytics API and are a roadmap item (spec "Out of scope").

export type YouTubeEnv = { apiKey?: string; channelId?: string; handle: string };

export type YtVideo = {
  id: string;
  snippet: { title: string; description?: string; publishedAt: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};
type Thread = {
  id: string;
  snippet: { totalReplyCount?: number; topLevelComment: { snippet: { textDisplay: string; authorDisplayName: string; publishedAt: string } } };
};

const API = "https://www.googleapis.com/youtube/v3";
export const CHANNEL_HANDLE = "amplificawealth";

export function parseIsoDuration(s: string): number | null {
  if (!s) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  // YouTube reports P0D for live and upcoming broadcasts: a zero-length
  // duration is unknown, not evidence of a Short.
  return total === 0 ? null : total;
}

/** A video is a Reel (Short) only if its length is 60 seconds or less; an unknown length is not evidence of a Short. */
export function ytFormat(seconds: number | null): "reel" | "youtube" {
  return seconds != null && seconds <= 60 ? "reel" : "youtube";
}

const int = (v: string | undefined): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function mapVideo(v: YtVideo, threads: Thread[]): PulledPost {
  return {
    platform: "youtube",
    external_id: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    format: ytFormat(parseIsoDuration(v.contentDetails?.duration ?? "")),
    posted_at: v.snippet.publishedAt,
    caption: v.snippet.title,
    metrics: { views: int(v.statistics?.viewCount), likes: int(v.statistics?.likeCount), comments: int(v.statistics?.commentCount) },
    comments: threads.map(
      (t): PulledComment => ({
        external_id: t.id,
        author: t.snippet.topLevelComment.snippet.authorDisplayName,
        text: t.snippet.topLevelComment.snippet.textDisplay,
        occurred_at: t.snippet.topLevelComment.snippet.publishedAt,
      })
    ),
  };
}

async function get<T>(path: string, params: Record<string, string>, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${API}/${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`youtube ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

const MAX_VIDEOS = 100;

export async function pullYouTube(env: YouTubeEnv, fetchImpl: typeof fetch = fetch): Promise<Pull> {
  if (!env.apiKey) {
    console.warn("youtube: YOUTUBE_API_KEY not set; skipping pull");
    return { posts: [], errors: ["youtube: YOUTUBE_API_KEY not set"] };
  }
  const key = env.apiKey;
  const errors: string[] = [];
  let videos: YtVideo[] = [];
  try {
    const ch = await get<{ items?: { id: string; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
      "channels",
      { part: "contentDetails", key, ...(env.channelId ? { id: env.channelId } : { forHandle: env.handle }) },
      fetchImpl
    );
    const uploads = ch.items?.[0]?.contentDetails.relatedPlaylists.uploads;
    if (!uploads) return { posts: [], errors: ["youtube: channel not found"] };

    const ids: string[] = [];
    let pageToken: string | undefined;
    while (ids.length < MAX_VIDEOS) {
      const page = await get<{ items: { contentDetails: { videoId: string } }[]; nextPageToken?: string }>(
        "playlistItems",
        { part: "contentDetails", playlistId: uploads, maxResults: "50", key, ...(pageToken ? { pageToken } : {}) },
        fetchImpl
      );
      ids.push(...page.items.map((i) => i.contentDetails.videoId));
      pageToken = page.nextPageToken;
      if (!pageToken) break;
    }
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = await get<{ items: YtVideo[] }>(
        "videos",
        { part: "snippet,statistics,contentDetails", id: ids.slice(i, i + 50).join(","), key },
        fetchImpl
      );
      videos.push(...chunk.items);
    }
  } catch (e) {
    return { posts: [], errors: [`youtube: listing failed: ${(e as Error).message}`] };
  }

  const posts: PulledPost[] = [];
  for (const v of videos) {
    let threads: Thread[] = [];
    try {
      const r = await get<{ items?: Thread[] }>(
        "commentThreads",
        { part: "snippet", videoId: v.id, maxResults: "100", textFormat: "plainText", key },
        fetchImpl
      );
      threads = r.items ?? [];
    } catch (e) {
      console.error(`youtube: comments for ${v.id} failed`, e);
      errors.push(`youtube: comments ${v.id}: ${(e as Error).message}`);
    }
    posts.push(mapVideo(v, threads));
  }
  return { posts, errors };
}
