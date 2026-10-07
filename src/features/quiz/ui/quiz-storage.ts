import { OPTIONS_PER_QUESTION, QUIZ_LENGTH, QUIZ_VERSION } from "../content";

// Progress survives a reload (Instagram's in-app browser reloads often). Every
// access is wrapped: storage can be blocked, full, or hold junk, and the quiz
// must still work without it. The key carries the quiz version so edited
// questions never resume from stale answers.
const KEY = `amp_quiz_v${QUIZ_VERSION}`;

export type StoredAnswers = (number | null)[];

export function loadAnswers(): StoredAnswers | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== QUIZ_LENGTH) return null;
    const valid = parsed.every(
      (v) => v === null || (Number.isInteger(v) && v >= 0 && v < OPTIONS_PER_QUESTION)
    );
    if (!valid || parsed.every((v) => v === null)) return null;
    return parsed as StoredAnswers;
  } catch {
    return null;
  }
}

export function saveAnswers(answers: StoredAnswers): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(answers));
  } catch {
    // Storage unavailable: the quiz keeps working from memory.
  }
}

export function clearAnswers(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
