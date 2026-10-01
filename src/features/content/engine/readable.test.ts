import { describe, expect, it } from "vitest";
import { extractReadable } from "./readable";

const paragraphs = Array.from(
  { length: 6 },
  (_, i) => `<p>Paragraph ${i + 1} of the argument. ${"The four percent rule assumes a retirement that ends. ".repeat(3)}</p>`
).join("\n");

const PAGE = `<!doctype html><html><head><title>Why the 4% rule fails | Some Blog</title>
<style>body{color:red}</style></head><body>
<nav><a href="/">Home</a> <a href="/about">About</a></nav>
<article><h1>Why the 4% rule fails</h1>${paragraphs}</article>
<script>var trackingBeacon = "SECRET_SCRIPT_TEXT";</script>
</body></html>`;

describe("extractReadable", () => {
  it("returns the article text and a title, without script contents", () => {
    const r = extractReadable(PAGE, "https://example.com/post");
    expect(r.title).toContain("4% rule");
    expect(r.text).toContain("Paragraph 3 of the argument");
    expect(r.text).not.toContain("SECRET_SCRIPT_TEXT");
    expect(r.text).not.toContain("color:red");
  });
  it("falls back to the body text when Readability finds no article", () => {
    const r = extractReadable("<html><body><p>Just a little page with a few words on it.</p></body></html>", "https://example.com/");
    expect(r.text).toContain("a few words");
  });
  it("returns empty text for an empty document instead of throwing", () => {
    expect(extractReadable("", "https://example.com/").text).toBe("");
  });
});
