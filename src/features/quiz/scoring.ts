import {
  ARCHETYPE_KEYS,
  OPTIONS_PER_QUESTION,
  QUESTIONS,
  QUIZ_LENGTH,
  type ArchetypeKey,
} from "./content";

export interface QuizScore {
  scores: Record<ArchetypeKey, number>;
  archetype: ArchetypeKey;
  runnerUp: ArchetypeKey;
}

const LAST = OPTIONS_PER_QUESTION - 1;
const ANSWERS_RE = new RegExp(`^[0-${LAST}](,[0-${LAST}]){${QUIZ_LENGTH - 1}}$`);

/** Parses the "0,3,2,..." form field. Null unless it is exactly 15 digits, each 0 to 4. */
export function parseAnswers(raw: string): number[] | null {
  if (!ANSWERS_RE.test(raw)) return null;
  return raw.split(",").map(Number);
}

/** Archetypes by score, highest first. Ties keep ARCHETYPE_KEYS order. */
export function rankArchetypes(scores: Record<ArchetypeKey, number>): ArchetypeKey[] {
  return [...ARCHETYPE_KEYS].sort(
    (a, b) => scores[b] - scores[a] || ARCHETYPE_KEYS.indexOf(a) - ARCHETYPE_KEYS.indexOf(b)
  );
}

export function scoreAnswers(answers: readonly number[]): QuizScore {
  if (answers.length !== QUIZ_LENGTH) {
    throw new Error(`expected ${QUIZ_LENGTH} answers, got ${answers.length}`);
  }
  const scores = Object.fromEntries(ARCHETYPE_KEYS.map((k) => [k, 0])) as Record<
    ArchetypeKey,
    number
  >;
  answers.forEach((choice, q) => {
    const option = QUESTIONS[q].options[choice];
    if (!option) throw new Error(`answer ${choice} is out of range for question ${q + 1}`);
    for (const [key, points] of Object.entries(option.weights) as [ArchetypeKey, number][]) {
      scores[key] += points;
    }
  });
  const [archetype, runnerUp] = rankArchetypes(scores);
  return { scores, archetype, runnerUp };
}
