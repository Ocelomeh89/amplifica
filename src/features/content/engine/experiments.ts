// Today: daily briefs as one-variable tests. Pure logic for the evidence counts,
// control recipe, picker, reason and verdict lives here; nothing in this file
// touches the database.

/** Every choice a brief can test: the six tags (cover is one) plus topic. */
export const VARIABLES = ["hook_type", "onscreen_text", "cta_type", "post_style", "cover", "message", "topic"] as const;
/** The form choices a brief holds still at the control recipe. Message and topic come from the idea. */
export const HELD_STILL = ["hook_type", "onscreen_text", "cta_type", "post_style", "cover"] as const;
export const EXPERIMENT_KINDS = ["proposed", "moment"] as const;
export const EXPERIMENT_STATUSES = ["open", "posted", "judged", "unjudged", "skipped", "discarded"] as const;
export const VERDICTS = ["won", "lost", "flat"] as const;
export const RUN_KINDS = ["cron", "swap", "moment"] as const;
export const RUN_STATUSES = ["pending", "ready", "failed"] as const;

export type Variable = (typeof VARIABLES)[number];
export type HeldStill = (typeof HELD_STILL)[number];
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];
export type Verdict = (typeof VERDICTS)[number];
export type RunKind = (typeof RUN_KINDS)[number];
