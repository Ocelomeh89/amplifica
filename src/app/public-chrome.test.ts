import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { render } from "@testing-library/react";
import PublicHeader from "@/shared/ui/public/PublicHeader";
import PublicFooter from "@/shared/ui/public/PublicFooter";
import { INSTAGRAM_URL, NEWSLETTER_URL, YOUTUBE_URL } from "@/shared/links";

const PAGES = [
  "src/app/page.tsx",
  "src/app/calculator/page.tsx",
  "src/features/quiz/ui/QuizShell.tsx",
];

describe("public pages share one header and footer", () => {
  it.each(PAGES)("%s uses PublicHeader and PublicFooter", (path) => {
    const src = readFileSync(path, "utf8");
    expect(src).toContain("<PublicHeader />");
    expect(src).toContain("<PublicFooter />");
    expect(src).not.toContain("function AmplitudeMark");
  });

  it.each(["PublicHeader", "PublicFooter"])(
    "%s links to no private or unlisted route",
    (name) => {
      const src = readFileSync(`src/shared/ui/public/${name}.tsx`, "utf8");
      for (const route of ["/content", "/compare", "/amortization", "/quiz"]) {
        expect(src).not.toContain(route);
      }
    },
  );

  it.each([
    ["PublicHeader", PublicHeader],
    ["PublicFooter", PublicFooter],
  ] as const)("%s has the three social links opening in a new tab", (_n, Component) => {
    const { getAllByRole, getByLabelText, unmount } = render(createElement(Component));
    const links = getAllByRole("link");
    for (const [href, label] of [
      [INSTAGRAM_URL, /instagram/i],
      [YOUTUBE_URL, /youtube/i],
      [NEWSLETTER_URL, /beehiiv/i],
    ] as const) {
      const el = getByLabelText(label);
      expect(links).toContain(el);
      expect(el.getAttribute("href")).toBe(href);
      expect(el.getAttribute("target")).toBe("_blank");
      expect(el.getAttribute("rel")).toBe("noopener noreferrer");
    }
    unmount();
  });
});
