import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

describe("quiz crawl rules", () => {
  it("disallows result pages in robots.txt", () => {
    const rules = robots().rules;
    const disallow = (Array.isArray(rules) ? rules[0] : rules).disallow;
    expect(disallow).toContain("/quiz/r/");
  });

  it("keeps the temporary quiz out of the sitemap", () => {
    expect(sitemap().some((e) => e.url.includes("/quiz"))).toBe(false);
  });
});
