# Moving Money Virtually — Course Design

**Series:** Investor Education Series
**Position:** Direct sequel to *Deploying Your First Amplicon* (C.Y.C.L.E. deployment module)
**Format:** 16:9 PowerPoint, ~19 slides, house deck system (`amplifica-deck-style`)
**Date:** 2026-08-27

---

## 1. The idea in one paragraph

The prior course taught students to service an Amplicon by physically selling shares
every month and wiring the proceeds to a line of credit. This course shows that when
the cost of credit is *below* the amortization rate you service it on, most of that
movement is unnecessary. The schedule can live as a ledger entry instead of a sell
order — the shares stay invested, the dividend applies itself against the margin
balance inside a single account, and the difference compounds in the student's favor.

## 2. Learning objective

A student finishing this course can say:

> "My loan charges 5%. My schedule assumes 8%. That 3% gap was prepaying principal I
> didn't know I was prepaying — and if I stop selling shares to fund it, the shares keep
> earning 13% against debt that costs 5%. Money did not need to move."

## 3. The worked example

All figures illustrative. SATA's 13% is its current stated distribution rate, presented
as historical — never as a projection.

| Element | Value |
|---|---|
| Existing brokerage portfolio (collateral) | $40,000 |
| Amplicon drawn on margin | $10,000 |
| SATA position purchased | $10,000 |
| SATA distribution rate | 13% / yr = **$108.33 / mo** |
| Servicing schedule | 8% amortized over 36 mo = **$313.36 / mo** |
| Actual margin cost | 5% / yr = **$41.67 / mo** |
| Account equity at open | 80% (Reg T initial 50%: pass) |
| Drawdown required to trigger a 30% maintenance call | **71%** |

### Two rate gaps, two different jobs

- **13% − 8% = 5 points.** The distribution runs above the schedule. This is the
  safety buffer.
- **8% − 5% = 3 points.** The payment is sized for a loan more expensive than the one
  actually held. This silently prepays principal.

### Path A — sell to cover (what the prior course taught)

The $108.33 distribution does not cover the $313.36 payment, so shares are sold to make
up the difference. The position shrinks, so the distribution shrinks, so more shares
must be sold. Reverse compounding.

| Month | Position | Distribution | Shares sold | Debt |
|---|---|---|---|---|
| 1 | $9,795 | $108.33 | $205.03 | $9,728 |
| 12 | $7,388 | $82.53 | $230.83 | $6,664 |
| 24 | $4,415 | $50.67 | $262.69 | $3,157 |
| 35 | $1,545 | $17.61 | — | $0 |

Debt clears **month 35**, not 36 — the 8%-sized payment against a 5% loan retires it
early, costing **$752.82** in interest instead of the **$1,281.09** an 8% loan would charge.
Total liquidated: **$8,455 of a $10,000 position.**

### Path B — ledger only

Nothing is sold. The distribution posts to the same account the margin balance sits in
and reduces it automatically: $108.33 in, $41.67 of interest out, **$66.67/mo** of
automatic deleveraging. No login, no trade, no transfer.

### The divergence

| Month | Path A equity | Path B equity | Gap |
|---|---|---|---|
| 1 | $67 | $67 | $0 |
| 12 | $724 | $819 | $95 |
| 24 | $1,258 | $1,679 | $421 |
| **35** | **$1,545** | **$2,506** | **$961** |

**Headline: $961 at month 35 — 9.6% of the Amplicon, created by not moving money.**
Every share not sold kept earning 13% against debt costing 5%, and no gain was realized.

**Honesty constraint:** the gap is quoted only through month 35. After that the Path A
student has a clear line and $1,545 to redeploy; the model does not simulate that
redeployment, so any later comparison would overstate Path B.

## 4. What it costs (the counterweight)

Path B is not free, and the course must say so plainly:

- **You stay leveraged far longer.** 35 months becomes **117 months** to clear the debt.
- **Paydown stops when the margin rate reaches the distribution rate (13%).** Today's 5%
  leaves 8 points of headroom: at 7% net paydown is $50.00/mo, at 9% it is $33.33/mo,
  at 11% it is $16.67/mo, at 13% it is zero.
- **A distribution cut is absorbed down to 5%** — a 62% cut — before paydown stops.
- **A 71% drawdown of the whole book triggers a maintenance call.**

## 5. Slide plan (~19 slides)

**Setup**
1. Title (dark) — *Moving Money Virtually* / "How a ledger entry beats a wire transfer."
2. Disclosure (standard text + the named-security line, since SATA is specific)
3. In this module — four numbered cards, one per act
4. Prerequisite: the collateral requirement — $40k book, $10k drawn, 80% equity, Reg T

**Act 1 — You already know this**
5. The Amplicon restated on SATA; CYCLE recap
6. The rate stack: 13% / 8% / 5% as three big stats
7. Sell to cover: $313.36 needed, $108.33 supplied, $205.03 sold
8. Reverse compounding — the month table + chart; $8,455 liquidated

**Act 2 — The question**
9. Dark statement interstitial: "Your schedule assumes 8%. Your loan charges 5%. Who is
   the extra 3% for?"
10. The answer: it prepaid principal. Month 35 not 36; $752.82 not $1,281.09; $528.27 avoided.

**Act 3 — Stop selling**
11. The move: same schedule, now a ledger entry. What changes, what doesn't.
12. The ledger itself — what you record vs. what the account does on its own
13. The divergence table + widening-gap chart, landing on $961
14. Why it works: 13% kept vs 5% paid, and no realized gain

**Act 4 — What it costs**
15. You stay levered: 35 months vs 117 months
16. The breakpoints: margin rate → 13%, distribution cut → 5%, 71% drawdown call
17. Adaptation: if your credit is an external HELOC/LoC — only $41.67 moves, shares
    still never sell

**Close**
18. Action checklist
19. Thank you (dark)

## 6. Compliance guardrails

- Every rate labeled *illustrative*; SATA's 13% framed as its current stated
  distribution rate, historical, never projected.
- Disclosure slide carries the named-security line: this references a specific security
  as a personal example only, not a recommendation.
- Sources line on every data slide.
- No "tax-free" language. The deferred-gain benefit is stated as *no gain is realized*,
  with "consult a CPA."
- Vocabulary: Amplicon, Amplification, STI/LTI. Never "snowball" or "passive income."
- Speaker notes on all 19 slides.

## 7. Build notes

- Charts rebuilt natively in the brand palette (purple/amethyst; muted coral `C4564E`
  for the liquidated/loss series). Data comes from the verified model, not estimates.
- Recompress the .pptx after pptxgenjs writes it.
- QA render via LibreOffice → PDF → JPEG, checking for overflow, overlap, and
  table/source-line collisions.
