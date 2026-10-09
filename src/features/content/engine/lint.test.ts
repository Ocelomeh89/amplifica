import { describe, expect, it } from "vitest";
import { lintDraft, section } from "./lint";

const ids = (hits: { rule: string }[]) => hits.map((h) => h.rule);

const goodNewsletter = `## Subject options
What 8% really buys

## Body
The 4% rule assumes you never earn again. I run my own numbers every Sunday.

## Close
Open https://amplificawealth.com/calculator, set the rate to 8%, and read the cash flow line.`;

describe("lintDraft: clean drafts", () => {
  it("a good newsletter has no hits", () => {
    expect(lintDraft("newsletter", goodNewsletter)).toEqual([]);
  });
  it("a short reel script has no hits", () => {
    expect(lintDraft("reel", "## Hook\nI took a W-2 job.\n\n## Script\nI took a W-2 job. Here is why.")).toEqual([]);
  });
});

describe("lintDraft: block rules", () => {
  it.each([
    ["guarantee", "This is guaranteed to work."],
    ["guarantee", "We guarantee it."],
    ["low-risk", "A low risk way in."],
    ["risk-free", "It is risk-free."],
    ["return-promise", "You will earn 8% a year."],
    ["return-promise", "The account will return 8% every year."],
    ["episode-numbering", "Part 2 of 5 in the series."],
    ["episode-numbering", "Episode 3 is live."],
  ])("blocks %s", (rule, text) => {
    const hits = lintDraft("x", `## Post\n${text}`);
    expect(hits.find((h) => h.rule === rule)?.level).toBe("block");
  });

  it("blocks make/get with a money or percent figure as return-promise", () => {
    expect(lintDraft("x", "## Post\nYou will make $500 a month.").find((h) => h.rule === "return-promise")?.level).toBe("block");
    expect(lintDraft("x", "## Post\nYou will get 8% back.").find((h) => h.rule === "return-promise")?.level).toBe("block");
  });
  it("does not block ordinary make/get phrasing", () => {
    expect(ids(lintDraft("x", "## Post\nYou'll get a number back and you will make a decision."))).not.toContain("return-promise");
  });

  it("blocks a reel script over 150 words, and not at exactly 150", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(ids(lintDraft("reel", `## Script\n${words(151)}`))).toContain("reel-length");
    expect(ids(lintDraft("reel", `## Script\n${words(150)}`))).not.toContain("reel-length");
  });
  it("counts only the Script section for a reel, not the caption", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(ids(lintDraft("reel", `## Script\n${words(100)}\n\n## Caption\n${words(100)}`))).not.toContain("reel-length");
  });

  it("blocks a story over 5 slides, and not at 5", () => {
    const slides = (n: number) => `## Slides\n${Array.from({ length: n }, (_, i) => `- slide ${i + 1}`).join("\n")}`;
    expect(ids(lintDraft("story", slides(6)))).toContain("story-length");
    expect(ids(lintDraft("story", slides(5)))).not.toContain("story-length");
  });

  it("blocks a newsletter with no calculator instruction or no URL", () => {
    expect(ids(lintDraft("newsletter", "## Body\nJust some words."))).toContain("newsletter-cta");
    expect(ids(lintDraft("newsletter", "## Close\nTry the calculator."))).toContain("newsletter-cta");
    expect(ids(lintDraft("newsletter", goodNewsletter))).not.toContain("newsletter-cta");
  });
  it("does not require a calculator in other formats", () => {
    expect(ids(lintDraft("reel", "## Script\nHi."))).not.toContain("newsletter-cta");
  });
});

describe("lintDraft: warn rules", () => {
  it.each([
    ["leverage", "We leverage the loan."],
    ["banned-vocab", "A robust plan."],
    ["negative-parallelism", "This isn't a budget. This is a system."],
    ["negative-parallelism", "You don't need more income. You need a plan."],
    ["negative-parallelism", "It works. Not luck. Math."],
    ["em-dash", "The loan — and the rate — matter."],
    ["colon-reveal", "Here's the thing: rates matter."],
    ["engagement-bait", "Let that sink in."],
  ])("warns %s", (rule, text) => {
    const hit = lintDraft("x", `## Post\n${text}`).find((h) => h.rule === rule);
    expect(hit?.level).toBe("warn");
    expect(hit?.excerpt.length).toBeGreaterThan(0);
  });

  it("does not warn on leverage or banned words inside a quotation", () => {
    expect(ids(lintDraft("x", '## Post\nHe said "we leverage a robust system" on the call.'))).toEqual([]);
    expect(ids(lintDraft("x", "## Post\nHe said “leverage” twice."))).toEqual([]);
  });
  it("still catches them outside the quotation", () => {
    expect(ids(lintDraft("x", '## Post\n"fine" but we leverage it.'))).toContain("leverage");
  });
  it("reports each distinct banned word once", () => {
    const hits = lintDraft("x", "## Post\nRobust. Robust. Seamless but holistic.").filter((h) => h.rule === "banned-vocab");
    expect(hits.map((h) => h.excerpt.toLowerCase()).sort()).toEqual(["holistic", "robust"]);
  });
});

describe("lintDraft: ordering and excerpts", () => {
  it("puts block hits before warn hits", () => {
    const hits = lintDraft("x", "## Post\nA robust, guaranteed plan.");
    expect(hits.map((h) => h.level)).toEqual(["block", "warn"]);
  });
  it("excerpt is trimmed to the neighbourhood of the match", () => {
    const long = `${"filler ".repeat(40)}guaranteed${" filler".repeat(40)}`;
    const hit = lintDraft("x", `## Post\n${long}`).find((h) => h.rule === "guarantee");
    expect(hit!.excerpt).toContain("guaranteed");
    expect(hit!.excerpt.length).toBeLessThan(120);
  });
});

describe("section", () => {
  it("returns the text under a heading up to the next heading, case-insensitively", () => {
    expect(section("## Hook\nA\n\n## script\nB\nC\n\n## Caption\nD", "Script")).toBe("B\nC\n");
  });
  it("returns null when the heading is absent", () => {
    expect(section("no headings", "Script")).toBeNull();
  });
});
