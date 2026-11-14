// Trial Reel tests (slice B): the constants shared by the migration, the picker and the verdict.
// Pure. Migration 0022 mirrors these lists; its test asserts they match.

export const TEST_KINDS = ["opening", "card", "topic"] as const;
export const TEST_VARIABLES = ["hook_type", "onscreen_text", "topic"] as const;
export const TEST_STATUSES = ["proposing", "open", "judged", "skipped", "not_run", "failed"] as const;
export const TEST_VERDICTS = ["a", "b", "none"] as const;
export const TEST_TRIGGERS = ["routine", "button"] as const;

export type TestKind = (typeof TEST_KINDS)[number];
export type TestVariable = (typeof TEST_VARIABLES)[number];
export type TestStatus = (typeof TEST_STATUSES)[number];
export type TestVerdict = (typeof TEST_VERDICTS)[number];
export type TestTrigger = (typeof TEST_TRIGGERS)[number];
export type VersionLabel = "a" | "b";
