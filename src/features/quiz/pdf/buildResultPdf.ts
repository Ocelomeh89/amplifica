import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { ARCHETYPES, DISCLAIMER, MIGUEL_NOTE, type ArchetypeKey } from "../content";

export interface PdfInput {
  name: string;
  archetype: ArchetypeKey;
  runnerUp: ArchetypeKey;
  createdAt: string;
  /** Origin used to make relative destinations absolute, e.g. https://amplificawealth.com */
  siteUrl: string;
}

const PAGE = { width: 612, height: 792 }; // US Letter
const MARGIN = 54;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const PURPLE = rgb(0.424, 0.294, 0.827); // #6C4BD3
const PLUM = rgb(0.133, 0.075, 0.22); // #221338
const GRAY = rgb(0.4, 0.4, 0.45);
const TINT = rgb(0.97, 0.96, 0.99);

type Measurer = Pick<PDFFont, "widthOfTextAtSize">;

/**
 * The standard PDF fonts only encode WinAnsi. Anything else (emoji, CJK,
 * newlines, tabs) would make pdf-lib throw, so flatten whitespace and
 * replace what cannot be drawn.
 */
export function toWinAnsi(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E -ÿ]/g, "?")
    .trim();
}

function splitLongWord(word: string, font: Measurer, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const parts: string[] = [];
  let part = "";
  for (const ch of word) {
    if (part && font.widthOfTextAtSize(part + ch, size) > maxWidth) {
      parts.push(part);
      part = ch;
    } else {
      part += ch;
    }
  }
  if (part) parts.push(part);
  return parts;
}

export function wrapText(text: string, font: Measurer, size: number, maxWidth: number): string[] {
  const words = text
    .split(" ")
    .filter(Boolean)
    .flatMap((w) => splitLongWord(w, font, size, maxWidth));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function absolute(href: string, siteUrl: string): string {
  return href.startsWith("http") ? href : `${siteUrl.replace(/\/$/, "")}${href}`;
}

export async function buildResultPdf(input: PdfInput): Promise<Uint8Array> {
  const archetype = ARCHETYPES[input.archetype];
  const runnerUp = ARCHETYPES[input.runnerUp];

  const doc = await PDFDocument.create();
  doc.setTitle(`Amplifica investor profile: ${archetype.name}`);
  doc.setAuthor("Amplifica Wealth");
  const page = doc.addPage([PAGE.width, PAGE.height]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  let y = PAGE.height - MARGIN;

  /** Draws wrapped text top-down from the cursor and moves the cursor below it. */
  function write(
    text: string,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb>,
    lineHeight = Math.round(size * 1.45)
  ) {
    for (const line of wrapText(toWinAnsi(text), font, size, CONTENT_WIDTH)) {
      y -= lineHeight;
      page.drawText(line, { x: MARGIN, y, size, font, color });
    }
  }

  const date = new Date(input.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  write("Amplifica Wealth", bold, 14, PURPLE);
  y -= 8;
  write("Your investor profile", bold, 24, PLUM, 30);
  write(`${input.name} | ${date}`, regular, 11, GRAY);
  y -= 14;
  write(archetype.name, bold, 26, PURPLE, 32);
  y -= 6;
  write(archetype.diagnosis, regular, 12, PLUM, 17);
  y -= 16;

  // "Your next single" box. Height is computed from the wrapped lines first.
  const pad = 12;
  const boxLines = wrapText(toWinAnsi(archetype.nextSingle), regular, 12, CONTENT_WIDTH - pad * 2);
  const boxHeight = pad * 2 + 11 + boxLines.length * 17;
  page.drawRectangle({
    x: MARGIN,
    y: y - boxHeight,
    width: CONTENT_WIDTH,
    height: boxHeight,
    borderColor: PURPLE,
    borderWidth: 1,
    color: TINT,
  });
  let by = y - pad - 11;
  page.drawText("Your next single", { x: MARGIN + pad, y: by, size: 11, font: bold, color: PURPLE });
  for (const line of boxLines) {
    by -= 17;
    page.drawText(line, { x: MARGIN + pad, y: by, size: 12, font: regular, color: PLUM });
  }
  y -= boxHeight + 18;

  write(`You also have some of: ${runnerUp.name}.`, regular, 12, PLUM, 17);
  y -= 10;
  write(
    `Your next step: ${absolute(archetype.primary.href, input.siteUrl)}`,
    bold,
    12,
    PURPLE,
    17
  );
  y -= 14;
  write(MIGUEL_NOTE, italic, 11, GRAY, 16);

  // Disclaimer pinned to the bottom margin.
  const footer = wrapText(toWinAnsi(DISCLAIMER), regular, 9, CONTENT_WIDTH);
  let fy = MARGIN + (footer.length - 1) * 12;
  for (const line of footer) {
    page.drawText(line, { x: MARGIN, y: fy, size: 9, font: regular, color: GRAY });
    fy -= 12;
  }

  return doc.save();
}
