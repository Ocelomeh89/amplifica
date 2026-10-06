import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";

/**
 * The readable text of a fetched page. Scripts are never run (jsdom's default)
 * and its console is swallowed so a broken stylesheet does not spam the logs.
 */
export function extractReadable(html: string, url: string): { title: string; text: string } {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  try {
    const doc = dom.window.document;
    const article = new Readability(doc).parse();
    const raw = article?.textContent ?? doc.body?.textContent ?? "";
    const text = raw.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
    const title = (article?.title || doc.title || "").trim();
    return { title, text };
  } finally {
    dom.window.close();
  }
}
