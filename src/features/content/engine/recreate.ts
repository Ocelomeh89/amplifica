// Slice 3: Recreate. The constants come first because migration 0015's test pins
// its check lists to them.

export const RECREATE_MODES = ["same-recipe", "adjacent"] as const;
export const RECREATE_STATUSES = ["pending", "ready", "failed", "picked", "discarded"] as const;

export type RecreateMode = (typeof RECREATE_MODES)[number];
export type RecreateStatus = (typeof RECREATE_STATUSES)[number];
