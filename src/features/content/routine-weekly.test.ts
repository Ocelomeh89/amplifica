import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(f, "utf8");

describe("routines/content-weekly.md", () => {
  const routine = read("routines/content-weekly.md");

  it("names the env, the build endpoint and the ClickUp channel", () => {
    expect(routine).toContain("`CONTENT_API_BASE`");
    expect(routine).toContain("`CONTENT_ENGINE_SECRET`");
    expect(routine).toContain("/api/content/review/build");
    expect(routine).toContain("7-9011777568-8");
    expect(routine).toContain("clickup_send_chat_message");
  });

  it("step 1 builds the review, a middle step proposes a test, and the last step posts one line", () => {
    const steps = [...routine.matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => [m[1], m[2]]);
    expect(steps).toEqual([["1", "Build the review"], ["2", "Propose a test when none is open"], ["3", "Post one line to ClickUp"]]);
    expect(routine).toContain("-X POST");
    expect(routine).toContain("--data '{}'");
    expect(routine).toMatch(/\*\*Weekly review, week of <week_start>\*\*/);
    expect(routine).toMatch(/\*\*Weekly review failed\*\*/);
    expect(routine).toMatch(/Nothing else is posted/);
  });

  it("the test step posts to the propose endpoint with the bearer header and no body, and a failure never stops the run", () => {
    const step = routine.slice(routine.indexOf("## 2."), routine.indexOf("## 3."));
    expect(step).toContain("/api/content/tests/propose");
    expect(step).toContain("-X POST");
    expect(step).toContain('-H "Authorization: Bearer $CONTENT_ENGINE_SECRET"');
    expect(step).not.toContain("--data");
    expect(step).toMatch(/started/);
    expect(step).toMatch(/never stops the run/i);
    expect(routine.indexOf("/api/content/tests/propose")).toBeGreaterThan(routine.indexOf("/api/content/review/build"));
  });

  it("treats the response as data and keeps the secret in the header", () => {
    expect(routine).toMatch(/never instructions/i);
    expect(routine).toMatch(/only in the Authorization header/i);
    expect(routine).toContain('-H "Authorization: Bearer $CONTENT_ENGINE_SECRET"');
    expect(routine).not.toMatch(/Bearer [A-Za-z0-9]{12,}/);
  });

  it("is scheduled after the tagging routine in the README", () => {
    const readme = read("routines/README.md");
    expect(readme).toMatch(/content-weekly\.md.*30 7 \* \* 1/);
    expect(readme).toMatch(/content-tag\.md.*55 6 \* \* 1/);
    expect(readme).toMatch(/must run after `content-tag\.md`/);
  });
});
