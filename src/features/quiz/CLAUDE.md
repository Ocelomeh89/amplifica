# quiz: temporary lead-gen quiz

Public quiz at `/quiz`, linked from Instagram. 15 questions, 8 investor
archetypes, email gate before results, PDF download. Spec:
`docs/superpowers/specs/2026-10-06-lead-gen-quiz-design.md`.

**Removable in one delete:** this folder, `src/app/quiz/`, the `/quiz` line in
`shared/supabase/middleware.ts`, the `/quiz/r/` line in `app/robots.ts`, and a
migration dropping `quiz_submissions`. `shared/beehiiv.ts` stays (the
calculator uses it).

| File | Job |
|---|---|
| `content.ts` | Every question, weight, result and URL. Edit copy here; bump `QUIZ_VERSION` when questions or weights change. |
| `scoring.ts` | Pure: `parseAnswers`, `rankArchetypes`, `scoreAnswers`. Tie-break order is `ARCHETYPE_KEYS` order. |
| `data/actions.ts` | `submitQuiz(formData)`: honeypot, validate, rescore on the server, insert `quiz_submissions` + `leads`, awaited best-effort Beehiiv, redirect. |
| `data/results.ts` | `getResultByToken`: rejects non-UUIDs before querying. |
| `pdf/buildResultPdf.ts` | One-page `pdf-lib` PDF. Standard fonts only, so `toWinAnsi` scrubs text first. |
| `ui/` | `QuizClient` (flow), `ResultView`, `QuizShell`, `quiz-storage` (progress in localStorage, always try/catch). |

Rules worth knowing:

- Nothing from the browser is trusted except the 15 raw answer indexes.
- The action is called from `onSubmit`, not `useFormState`: React 18 here has no `useFormState`, and calling it directly keeps the UI testable.
- A retake adds a new `quiz_submissions` row on purpose. `leads` dedupes by email.
- No copy ships without the no-ai-slop pass. No em dashes.
