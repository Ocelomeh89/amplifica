// Slice C: creator suggestions. Pure rules for finding creators 2x to 20x Miguel's size
// whose audience looks like Daniel or Stephen. Nothing here touches the database.

export const CANDIDATE_OUTCOMES = [
  "gathered",
  "sized",
  "sampled",
  "fit",
  "suggested",
  "out_of_band",
  "unreadable",
  "quiet",
  "neither",
  "low_confidence",
  "matched_decline",
  "no_room",
  "lapsed",
] as const;
export type CandidateOutcome = (typeof CANDIDATE_OUTCOMES)[number];

/** Looked at and set aside; remembered for CANDIDATE_MEMORY_DAYS. */
export const DROPPED_OUTCOMES: readonly CandidateOutcome[] = [
  "out_of_band",
  "unreadable",
  "quiet",
  "neither",
  "low_confidence",
  "matched_decline",
  "no_room",
  "lapsed",
];
/** Still moving through the pipeline. */
export const IN_PIPELINE: readonly CandidateOutcome[] = ["gathered", "sized", "sampled", "fit"];

export const DISCOVERY_RUN_KINDS = ["gather", "size", "sample"] as const;
export type DiscoveryRunKind = (typeof DISCOVERY_RUN_KINDS)[number];
export const DISCOVERY_TRIGGERS = ["cron", "routine", "button"] as const;
