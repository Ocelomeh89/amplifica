import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ARCHETYPE_KEYS, QUIZ_LENGTH } from "@/features/quiz/content";

// Applied by hand in the Supabase SQL editor, like 0008 and 0009. Assert the parts that matter.
describe("0010_quiz_submissions.sql", () => {
  const sql = readFileSync("supabase/migrations/0010_quiz_submissions.sql", "utf8");

  it("enables RLS and defines no policies, so the anon key is hard-denied", () => {
    expect(sql).toMatch(/alter table public\.quiz_submissions enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it("gives each submission a unique, unguessable token", () => {
    expect(sql).toMatch(/token uuid not null unique default gen_random_uuid\(\)/i);
  });

  it("constrains archetype and runner_up to the 8 keys in content.ts", () => {
    for (const key of ARCHETYPE_KEYS) {
      const occurrences = sql.split(`'${key}'`).length - 1;
      expect(occurrences, key).toBe(2);
    }
  });

  it("requires exactly the quiz length of answers", () => {
    expect(sql).toContain(`jsonb_array_length(answers) = ${QUIZ_LENGTH}`);
  });

  it("does not make email unique, so a retake keeps both rows", () => {
    expect(sql).not.toMatch(/unique index[^;]*email/i);
    expect(sql).toMatch(/create index quiz_submissions_email_idx/i);
  });
});
