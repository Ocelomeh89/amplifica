// Slice 6: competitor posts. Pure logic for the weekly pull's mapping, the per-creator
// median, popularity, freshness and the copy check; nothing here touches the database.

export const CREATOR_STATUSES = ["watching", "removed"] as const;
export const COMPETITOR_RUN_STATUSES = ["pending", "ready", "failed"] as const;
export type CreatorStatus = (typeof CREATOR_STATUSES)[number];
export type CompetitorRunStatus = (typeof COMPETITOR_RUN_STATUSES)[number];
