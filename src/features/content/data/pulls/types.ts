import type { Format, MetricSnapshot, Platform } from "@/features/content/engine/types";

export type PulledComment = { external_id: string; author: string; text: string; occurred_at: string };

/** One post as every platform pull reports it. `format` is "" for posts we do not queue (feed posts, carousels). */
export type PulledPost = {
  platform: Platform;
  external_id: string;
  url: string;
  format: Format | "";
  posted_at: string;
  caption: string;
  metrics: MetricSnapshot;
  comments: PulledComment[];
};

/** Per-post failures do not fail the pull: they are listed and the rest is returned. */
export type Pull = { posts: PulledPost[]; errors: string[] };
