// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { ARCHETYPE_KEYS, ARCHETYPES } from "../content";
import { buildResultPdf, toWinAnsi, wrapText } from "./buildResultPdf";

const base = {
  name: "Sam Rivera",
  runnerUp: "acquirer" as const,
  createdAt: "2026-10-06T12:00:00Z",
  siteUrl: "https://amplificawealth.com",
};

describe("buildResultPdf", () => {
  it.each(ARCHETYPE_KEYS.map((k) => [k]))("builds a one-page PDF for %s", async (key) => {
    const bytes = await buildResultPdf({ ...base, archetype: key });
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain(ARCHETYPES[key].name);
  });

  it("survives names the standard fonts cannot encode", async () => {
    const names = [
      "José Ñandú",
      "Sam \u{1F389}\u{1F680}",
      "李小龍",
      "Line\nBreak\tTab",
      "x".repeat(100),
      "a".repeat(50) + " " + "b".repeat(49),
    ];
    for (const name of names) {
      const bytes = await buildResultPdf({ ...base, name, archetype: "serial-dabbler" });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBe(1);
    }
  });

  it("writes the destination link in full for the debt-aholic", async () => {
    const bytes = await buildResultPdf({ ...base, archetype: "recovering-debt-aholic" });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

describe("toWinAnsi", () => {
  it("keeps Latin-1 letters, replaces everything else, and flattens whitespace", () => {
    expect(toWinAnsi("José")).toBe("José");
    expect(toWinAnsi("李")).toBe("?");
    expect(toWinAnsi("a\n b\t c")).toBe("a b c");
  });
});

describe("wrapText", () => {
  const font = { widthOfTextAtSize: (t: string, size: number) => t.length * size };

  it("wraps at the width on word boundaries", () => {
    expect(wrapText("aaa bbb ccc", font, 1, 7)).toEqual(["aaa bbb", "ccc"]);
  });

  it("breaks a single word that is wider than the line", () => {
    const lines = wrapText("x".repeat(25), font, 1, 10);
    expect(lines).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });

  it("returns no lines for empty text", () => {
    expect(wrapText("", font, 1, 10)).toEqual([]);
  });
});
