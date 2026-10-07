// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "11111111-2222-4333-8444-555555555555";

const h = vi.hoisted(() => ({
  quizInserts: [] as Record<string, unknown>[],
  leadInserts: [] as Record<string, unknown>[],
  updates: [] as string[],
  quizError: false,
  leadsCode: null as string | null,
  subscribe: vi.fn(async (_input: unknown) => true),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: () => ({ get: () => "test-agent" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/shared/beehiiv", () => ({ subscribeToNewsletter: h.subscribe }));
vi.mock("@/shared/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (table === "quiz_submissions") {
            h.quizInserts.push(row);
            return {
              select: () => ({
                single: async () =>
                  h.quizError
                    ? { data: null, error: { message: "boom" } }
                    : { data: { token: TOKEN }, error: null },
              }),
            };
          }
          h.leadInserts.push(row);
          return Promise.resolve({ error: h.leadsCode ? { code: h.leadsCode } : null });
        },
        update() {
          const chain = {
            eq: () => chain,
            then(resolve: (v: { error: null }) => void) {
              h.updates.push(table);
              resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  }),
}));

import { QUIZ_VERSION } from "../content";
import { scoreAnswers } from "../scoring";
import { submitQuiz } from "./actions";

const ZEROS = "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0";

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  const base: Record<string, string> = {
    name: "Sam Rivera",
    email: "Sam@Example.com",
    answers: ZEROS,
    website: "",
    utm_source: "ig",
    utm_medium: "story",
    utm_campaign: "oct",
    ...over,
  };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  h.quizInserts.length = 0;
  h.leadInserts.length = 0;
  h.updates.length = 0;
  h.quizError = false;
  h.leadsCode = null;
  h.subscribe.mockReset();
  h.subscribe.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitQuiz", () => {
  it("scores on the server, stores the submission, mirrors it to leads, subscribes, and redirects", async () => {
    await expect(submitQuiz(form())).rejects.toThrow(`REDIRECT /quiz/r/${TOKEN}`);

    const expected = scoreAnswers(new Array(15).fill(0));
    expect(h.quizInserts).toHaveLength(1);
    expect(h.quizInserts[0]).toMatchObject({
      name: "Sam Rivera",
      email: "sam@example.com",
      answers: new Array(15).fill(0),
      scores: expected.scores,
      archetype: expected.archetype,
      runner_up: expected.runnerUp,
      quiz_version: QUIZ_VERSION,
      utm_source: "ig",
      utm_medium: "story",
      utm_campaign: "oct",
      user_agent: "test-agent",
    });
    expect(h.leadInserts[0]).toMatchObject({ email: "sam@example.com", source: "quiz" });
    expect(h.subscribe).toHaveBeenCalledWith({
      email: "sam@example.com",
      source: "quiz",
      firstName: "Sam",
    });
    expect(h.updates).toEqual(expect.arrayContaining(["quiz_submissions", "leads"]));
  });

  it("ignores a score the browser might send", async () => {
    const fd = form();
    fd.set("archetype", "acquirer");
    fd.set("scores", "{}");
    await expect(submitQuiz(fd)).rejects.toThrow("REDIRECT");
    expect(h.quizInserts[0].archetype).toBe(scoreAnswers(new Array(15).fill(0)).archetype);
  });

  it("drops a honeypot fill silently: redirects to /quiz and stores nothing", async () => {
    await expect(submitQuiz(form({ website: "http://spam.example" }))).rejects.toThrow("REDIRECT /quiz");
    expect(h.quizInserts).toHaveLength(0);
    expect(h.leadInserts).toHaveLength(0);
    expect(h.subscribe).not.toHaveBeenCalled();
  });

  it.each([
    ["a bad email", { email: "not-an-email" }, "Please enter a valid email address."],
    ["a blank name", { name: "   " }, "Please enter your name."],
    ["a 101-character name", { name: "x".repeat(101) }, "Please enter your name."],
  ])("rejects %s without storing anything", async (_label, over, message) => {
    const result = await submitQuiz(form(over));
    expect(result).toEqual({ error: message });
    expect(h.quizInserts).toHaveLength(0);
    expect(h.subscribe).not.toHaveBeenCalled();
  });

  it.each([
    ["too few answers", "0,1,2"],
    ["too many answers", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["an out-of-range answer", "0,0,0,0,0,0,0,0,0,0,0,0,0,0,5"],
    ["a non-numeric answer", "x,0,0,0,0,0,0,0,0,0,0,0,0,0,0"],
    ["a missing answers field", ""],
  ])("rejects %s without storing anything", async (_label, answers) => {
    const result = await submitQuiz(form({ answers }));
    expect(result.error).toMatch(/answers/i);
    expect(h.quizInserts).toHaveLength(0);
    expect(h.leadInserts).toHaveLength(0);
  });

  it("returns an error and does not subscribe when the submission insert fails", async () => {
    h.quizError = true;
    const result = await submitQuiz(form());
    expect(result).toEqual({ error: "Something went wrong. Please try again." });
    expect(h.subscribe).not.toHaveBeenCalled();
    expect(h.leadInserts).toHaveLength(0);
  });

  it("still shows the result when leads reports a duplicate email (a retake)", async () => {
    h.leadsCode = "23505";
    await expect(submitQuiz(form())).rejects.toThrow(`REDIRECT /quiz/r/${TOKEN}`);
  });

  it("keeps both submissions when the same email retakes the quiz", async () => {
    await expect(submitQuiz(form())).rejects.toThrow("REDIRECT");
    await expect(submitQuiz(form({ answers: "1,1,1,1,1,1,1,1,1,1,1,1,1,1,1" }))).rejects.toThrow("REDIRECT");
    expect(h.quizInserts).toHaveLength(2);
  });

  it("still shows the result when Beehiiv is unset or down, and leaves beehiiv_synced false", async () => {
    h.subscribe.mockResolvedValue(false);
    await expect(submitQuiz(form())).rejects.toThrow(`REDIRECT /quiz/r/${TOKEN}`);
    expect(h.updates).toEqual([]);
  });

  it("sends only the first word of the name to Beehiiv", async () => {
    await expect(submitQuiz(form({ name: "  Ana  Maria de la Cruz " }))).rejects.toThrow("REDIRECT");
    expect(h.subscribe).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Ana" }));
  });

  it("caps UTM values at 200 characters and stores empty ones as null", async () => {
    await expect(submitQuiz(form({ utm_source: "y".repeat(300), utm_medium: "" }))).rejects.toThrow("REDIRECT");
    expect((h.quizInserts[0].utm_source as string).length).toBe(200);
    expect(h.quizInserts[0].utm_medium).toBeNull();
  });
});
