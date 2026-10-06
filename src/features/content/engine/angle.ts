// How a found source is mined: neutrally, against the grain, or building on it.
// The block is appended to the user turn only; engine/prompts/ideas.ts (shared
// with the daily routine) is not touched.

export const ANGLES = ["open", "counterpoint", "twist"] as const;
export type Angle = (typeof ANGLES)[number];

export function parseAngle(value: string): Angle {
  return (ANGLES as readonly string[]).includes(value) ? (value as Angle) : "open";
}

export function angleBlock(angle: Angle, competitor = ""): string {
  if (angle === "open") return "";
  const name = competitor.trim();
  const who = name ? `This piece is by ${name}, another creator.` : "This piece is by another creator.";
  if (angle === "counterpoint") {
    return [
      "ANGLE: COUNTERPOINT.",
      who,
      "Find the strongest claim in it that Miguel's evidence disagrees with and argue the other side.",
      "Argue with the claim, never the person. Do not attack sound basics (HYSAs, reserves, basic ETF investing) to manufacture contrast; the content positioning above still wins.",
      "Set quote_ref to the source URL. Make the first outline beat read \"They said: <their claim> / We say: <our position>\".",
    ].join("\n");
  }
  return [
    "ANGLE: TWIST.",
    who,
    "Keep what they got right and say so plainly, then add the angle only Miguel can: his real numbers (with the qualifiers above), the line-of-credit mechanics, or the CYCLE framing.",
    "Set quote_ref to the source URL. Make the first outline beat read \"They said: <their claim> / We add: <our twist>\".",
  ].join("\n");
}

/** The chip an idea wears in the Inbox when its source was pasted in. */
export function foundBadge(kind: string, meta: unknown): string | null {
  if (kind !== "url" && kind !== "upload") return null;
  const angle = typeof meta === "object" && meta !== null ? (meta as { angle?: unknown }).angle : undefined;
  return angle === "counterpoint" || angle === "twist" ? `found · ${angle}` : "found";
}
