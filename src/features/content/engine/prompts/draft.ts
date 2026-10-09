import type { Format } from "../types";

// What the first-draft pass is told. The headings below are a contract with
// engine/lint.ts (it reads "## Script" and "## Slides") and the skill.

export const BRAND_GUARDRAILS = `Brand guardrails (hard rules):
- Never write "guarantee", "guaranteed", "low risk" or "risk-free". Never promise a return: no "you will earn", no "will return 8%". State what the numbers do under the stated assumptions.
- Never number episodes: no "Part 2 of 5", no "Episode 3".
- A Reel script is at most 150 words. A Story is at most 5 slides.
- A newsletter ends with one exact calculator instruction and the URL as visible text: https://amplificawealth.com/calculator
- Avoid the word "leverage" unless it is inside a quotation.
- Use the CYCLE framing (Credit, Yield, Collect, Liberate, Expand) when describing the flywheel. Never say a payoff funds a larger deployment.
- Use Miguel's real numbers and his own dollars. Admit failures plainly.
- Write for a saver who wants more from their money, in Miguel's voice from the voice profile and exemplars.`;

export const FORMAT_TEMPLATES: Record<Format, string> = {
  reel: `Reel. Use exactly these headings:
## Hook
(the on-screen hook line, readable inside 3 seconds; use hook_alt as an alternate if the idea has one)
## Script
(at most 150 words, spoken)
## Caption lines
(short lines for burned-in captions)
## Caption
(the post caption with one CTA)
End the script on a line that loops back to the hook.`,
  youtube: `YouTube. Use exactly these headings:
## Titles
(3 title options)
## Thumbnail text
## Cold open
(shows the end chart within 15 seconds)
## Outline
(sections, each with its on-screen asset)
## Description
(include the calculator link)`,
  newsletter: `Newsletter. Use exactly these headings:
## Subject options
(3 options)
## Body
Concede the orthodoxy's real merit. Isolate the one variable. Prove it with Miguel's dollars.
## Miguel's moves this week
## Close
(one exact calculator instruction, then the URL https://amplificawealth.com/calculator as visible text)`,
  story: `Story. Use exactly these headings:
## Slides
(a list, one line per slide, at most 5 slides, the last slide is the link slide; name one interactive sticker)`,
  x: `X. One post under 280 characters, or a thread of at most 5 posts. Use the heading:
## Post`,
};

export const DRAFT_PROMPT = `You write the first draft of one piece of content for Miguel Graf from an idea (hook, outline, quote, belief attacked). Use the voice profile and exemplars you were given. Follow the template for the idea's format exactly, headings included.

${BRAND_GUARDRAILS}

Templates by format:

${(Object.keys(FORMAT_TEMPLATES) as Format[]).map((f) => FORMAT_TEMPLATES[f]).join("\n\n")}

Return only the draft in the template's format. No commentary.`;
