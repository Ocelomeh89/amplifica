// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { ARCHETYPE_KEYS, ARCHETYPES, DEBT_LETTER_URL } from "../content";
import { buildResultPdf, formatPdfDate, toWinAnsi, wrapText } from "./buildResultPdf";

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

  it.each([
    ["recovering-debt-aholic", DEBT_LETTER_URL],
    ["serial-dabbler", "https://amplificawealth.com/calculator"],
    ["cash-flow-builder", "https://community.amplificawealth.com/join-now"],
  ] as const)("adds one clickable link to the destination for %s", async (archetype, url) => {
    const doc = await PDFDocument.load(await buildResultPdf({ ...base, archetype }));
    const annots = doc.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
    const annot = doc.context.lookup(annots!.get(0), PDFDict);
    const action = annot.lookup(PDFName.of("A"), PDFDict);
    expect(action.lookup(PDFName.of("URI"), PDFString).decodeText()).toBe(url);
  });
});

describe("toWinAnsi", () => {
  it("keeps Latin-1 letters, replaces everything else, and flattens whitespace", () => {
    expect(toWinAnsi("José")).toBe("José");
    expect(toWinAnsi("李")).toBe("?");
    expect(toWinAnsi("a\n b\t c")).toBe("a b c");
  });

  it("turns iOS smart punctuation into plain characters instead of question marks", () => {
    expect(toWinAnsi("O\u2019Brien")).toBe("O'Brien");
    expect(toWinAnsi("\u201Chi\u201D \u2018x\u2019 a\u2013b a\u2014b\u2026")).toBe("\"hi\" 'x' a-b a-b...");
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

describe("formatPdfDate", () => {
  it("prints the date in Eastern time, so a late-evening submit keeps its local day", () => {
    // 01:30 UTC on Oct 7 is 9:30 pm EDT on Oct 6.
    expect(formatPdfDate("2026-10-07T01:30:00Z")).toBe("October 6, 2026");
    expect(formatPdfDate("2026-10-06T12:00:00Z")).toBe("October 6, 2026");
  });

  it("follows the switch to standard time in winter", () => {
    // 04:30 UTC on Jan 15 is 11:30 pm EST on Jan 14.
    expect(formatPdfDate("2026-01-15T04:30:00Z")).toBe("January 14, 2026");
  });
});
