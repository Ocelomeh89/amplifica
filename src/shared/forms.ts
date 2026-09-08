/**
 * Reading a Server Action's FormData.
 *
 * One definition of how a form field becomes a string, a number, or a rate,
 * instead of the same coercion spelled out fifty-two times across eight action
 * files.
 *
 * These preserve the semantics of the code they replace, quirks included, and
 * the quirks are worth knowing:
 *
 *   absent field      → the fallback
 *   empty field ("")  → 0, NOT the fallback, because Number("") is 0
 *   non-numeric       → NaN, which reaches the database as a null
 *
 * So `num(fd, "term_months", 36)` yields 36 only when the field is missing
 * altogether; a user who clears the box gets 0. That is how every one of these
 * call sites already behaved, and changing it is a behavior change rather than
 * a refactor — deliberately left for its own commit. Being in one place now,
 * it is a two-line fix when that call is made.
 */

/** A text field, defaulting to the empty string. Callers add `.trim()`. */
export function str(fd: FormData, key: string, fallback = ""): string {
  return String(fd.get(key) ?? fallback);
}

/** A numeric field. `fallback` applies only when the field is absent. */
export function num(fd: FormData, key: string, fallback = 0): number {
  return Number(fd.get(key) ?? fallback);
}

/** A field typed as a percentage (7.25 → 0.0725). `fallback` is pre-division. */
export function pct(fd: FormData, key: string, fallback = 0): number {
  return num(fd, key, fallback) / 100;
}

/** A checkbox, which submits "on" when ticked and nothing at all when not. */
export function checkbox(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}
