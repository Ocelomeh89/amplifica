# The Savings Account Experiment — course design

**Deliverable:** a 16:9 PowerPoint (`.pptx`) in the Amplifica Wealth *Investor Education
Series* house style, ~19 slides, built with `pptxgenjs` via the `amplifica-deck-style`
skill's helper library.

**Date:** 2026-08-29

---

## 1. Why this course exists

Every Amplifica course so far teaches the flywheel with a real Amplicon — an amortized
income investment at 8% or better. That tangles two separate effects together, and a
skeptical student cannot tell them apart:

- the **schedule** effect (an amortizing asset pays back principal *and* interest, so it
  produces monthly cash a lump of capital does not), and
- the **spread** effect (the asset earns more than the line costs, so the position builds
  wealth).

This course untangles them by running the flywheel on the safest, dullest, most
spread-free asset available: a **4% high-yield savings account**, against lines of credit
from **5% to 25%**. It is a control experiment. The HYSA has no story, no risk premium,
no illiquidity, and — against any real line of credit — no positive spread.

The finding is that the flywheel still manufactures large monthly cash flow at every
single rung, and that it builds no wealth at any of them. Those two facts, stated
together, are the course.

**Positioning:** the HYSA is *not* presented as a strategy to deploy. It is the proof
that the mechanic is real, and the measurement of exactly what the mechanic costs when
the asset contributes nothing. It ends by pointing students at real Amplicons, where the
spread turns positive.

---

## 2. Thesis

> **Cash flow comes from the schedule. Wealth comes from the spread.**

Three supporting claims, each with a slide and a number behind it:

1. **Rate does not touch cash flow.** $100k self-amortized out of a 4% HYSA over 24
   months pays $4,342/mo whether the line costs 5% or 25%.
2. **Rate is a tax on speed, not a gate.** Over 30 years the flywheel compounds at every
   rung from 5% to 25%. At year 5 a 25% line still delivers 83% of what a 5% line
   delivers; by year 30 the gap widens to 2.5×.
3. **~96% of the cash flow is return of your own capital.** That single fact explains
   both of the above — why the rate barely moves the payout, and why net worth does not
   grow.

---

## 3. Model and parameters

All figures come from the shipped engine, `runSimulation` in
`src/lib/finance/projection-sim.ts`. A HYSA that you withdraw from on a fixed
amortization schedule **is** an amortized investment at that rate, so the HYSA is modeled
as `investmentInterestPct: 0.04`. This keeps the deck consistent with the calculator
students will go use at `/calculator`.

| Input | Value | Note |
|---|---|---|
| `investmentInterestPct` | `0.04` | the HYSA |
| `locInterestPct` | `0.05 … 0.25` step `0.05` | the swept variable |
| `msc` | `2000` | house key-scenario MSC |
| `investmentSizeFactor` | `5` | product default → $10,000 initial draw |
| `termMonths` | `24` | the self-amortization schedule |
| `locIncrease` | `1.5` | product default step-up |
| `payoffUpgradeMonths` | `4` (engine default) | predictive gate |
| `perpetualMix` | `0` | out of scope for this course |
| `totalMonths` | `361` | 30 years + month 0 |

**Two conventions the deck must honor.**

- **Smoothing.** The flywheel's monthly cash flow is saw-toothed — `docs/PRODUCT-STATUS.md`
  §6 notes the FI surface is non-monotone for this reason. Single-month samples are
  misleading and non-monotone across the rate ladder. **Every headline cash-flow figure in
  the deck is a trailing-12-month average** of `distributionCashFlow`, and the deck says so
  in the assumptions slide. Smoothed, the ladder is cleanly monotone in the rate.
- **`distributionCashFlow` excludes the MSC.** All quoted cash flow is the system's own
  income, not the student's contribution recycled.

---

## 4. Verified figures

Generated from the engine on 2026-08-29. The build script regenerates these rather than
hardcoding them, so the deck cannot drift from the engine.

### A. Unit economics, per $100,000, 4% HYSA, 24-month self-amortization

Level withdrawal **$4,342/mo**; total withdrawn $104,220; HYSA interest earned $4,220.

| LoC rate | Interest-only carry | Month-1 net cash |
|---|---|---|
| 5% | $417/mo | $3,926 |
| 10% | $833/mo | $3,509 |
| 15% | $1,250/mo | $3,092 |
| 20% | $1,667/mo | $2,676 |
| 25% | $2,083/mo | $2,259 |

The withdrawal column does not exist — it is $4,342 at every rate. That is claim 1.

### B. The ladder — trailing-12-month average system cash flow

| LoC | yr 5 | yr 10 | yr 20 | yr 30 | Peak debt | Final draw |
|---|---|---|---|---|---|---|
| 5% | $12,274 | $28,167 | $71,413 | $132,856 | $659,362 | $576,650 |
| 10% | $11,542 | $26,381 | $62,139 | $104,337 | $479,811 | $384,434 |
| 15% | $11,175 | $24,457 | $51,319 | $81,151 | $390,917 | $384,434 |
| 20% | $10,544 | $22,121 | $45,136 | $66,776 | $307,976 | $256,289 |
| 25% | $10,137 | $20,335 | $37,922 | $54,101 | $263,956 | $256,289 |

Year-5 spread across a 5× range of borrowing cost: **$12,274 → $10,137**, i.e. the 25%
line delivers 83% of the 5% line. That is claim 2.

Note for the capacity slide: peak debt *falls* as the rate rises. A dearer line does not
pile on more debt — it advances through fewer, smaller cycles.

### C. Return-of-capital split

At the 10% rung, month 120: payout **$24,732/mo = $1,027 interest + $23,705 return of
principal**. Across all five rungs the return-of-capital share sits between **95.7% and
96.1%**. That is claim 3.

(These are single-month samples, taken at a common month so the five rungs are
comparable; the deck quotes the *percentage* as the headline and one rung's dollar split
as the illustration.)

### D. Cash flow vs cash flow — the honest gap

The engine's `expectedFuturePayments` is a **nominal, undiscounted** sum of future
payments, while `marketBaseline` is a **balance**. Placing them side by side would be
apples-to-oranges, so the deck does not. Instead both sides are expressed as **monthly
income**: the flywheel's trailing-12 average against a 4% safe-withdrawal rate on the
index balance from the same MSC at 10%.

| | yr 5 | yr 10 | yr 20 | yr 30 |
|---|---|---|---|---|
| Index @ 4% SWR | $527 | $1,384 | $5,111 | $15,202 |
| Flywheel, 5% LoC | $12,274 | $28,167 | $71,413 | $132,856 |
| Flywheel, 10% LoC | $11,542 | $26,381 | $62,139 | $104,337 |
| Flywheel, 15% LoC | $11,175 | $24,457 | $51,319 | $81,151 |
| Flywheel, 20% LoC | $10,544 | $22,121 | $45,136 | $66,776 |
| Flywheel, 25% LoC | $10,137 | $20,335 | $37,922 | $54,101 |

Index balance at year 30: $4,560,651. Flywheel income at year 30 runs **3.6× (25%) to
8.7× (5%)** the index's safe income.

### E. The asymmetry guardrail — REQUIRED on the slide

Section D's multiple is real but it is not free, and the deck **must** state why on the
same slide it appears. A 4% SWR is designed to be **perpetual and unlevered**: the balance
survives the withdrawal. The flywheel's payout is **~96% return of capital**, requires
**continuous redeployment**, and is carried on **permanent outstanding debt** ($264k–$659k
at peak). They are not the same kind of dollar.

Framing to use: *you are trading terminal wealth for present income, and the price is
visible, not hidden.* Never present the multiple without the trade.

---

## 5. Slide outline (19)

Structure follows the house sandwich: dark ends, cream middle, dark thesis interstitials.

| # | Bg | Slide | Content |
|---|---|---|---|
| 01 | dark | Title | "The Savings Account Experiment", Investor Education Series, amplitude bars |
| 02 | cream | Disclosure | Standard text from `amplifica-deck-style` §7, verbatim |
| 03 | cream | The question | Does the flywheel work, or does it only look good because we chose a good asset? 2×2 cards |
| 04 | cream | The setup | Control variables; why a 4% HYSA is the right instrument — zero risk, zero story, zero spread |
| 05 | cream | The move | Self-amortization. A savings account pays nothing until you put it on a schedule. $100k → $4,342/mo |
| 06 | cream | **Reveal 1** | The withdrawal column that doesn't exist — §4A table, $4,342 at every rate |
| 07 | dark | Thesis | "Cash flow comes from the schedule. Wealth comes from the spread." + amplitude bars |
| 08 | cream | CYCLE | Credit / Yield / Collect / Liberate / Expand, applied to a savings account. Numbered cards |
| 09 | cream | The ladder | §4B table, 5 rungs × 4 horizons |
| 10 | cream | Reading the ladder | Rate is a tax on speed, not a gate. 83% at year 5, 2.5× spread by year 30 |
| 11 | cream | Investment capacity | Final draw + peak debt per rung; dearer lines take fewer, smaller cycles |
| 12 | cream | **Reveal 2** | ~96% of it is your own money coming back. §4C split |
| 13 | cream | The gap | §4D, cash flow vs cash flow. Both sides in $/mo |
| 14 | cream | What it costs | §4E asymmetry — perpetual unlevered income vs self-liquidating levered income |
| 15 | dark | Thesis | "The machine runs. The asset is the whole game." |
| 16 | cream | At 8% | What changes with a real Amplicon: the spread flips positive and wealth starts accruing |
| 17 | cream | When this is worth doing | Honest use cases and honest disqualifiers |
| 18 | cream | Sources & assumptions | Engine + parameters from §3, trailing-12 smoothing, SWR convention |
| 19 | dark | Thank you | Amplitude bars, close |

Speaker notes on **every** slide, per the house rule.

---

## 6. Compliance guardrails

Inherited from `amplifica-deck-style` §2, plus two specific to this deck:

- **Never promise returns.** Every figure is framed as *illustrative model output*, never
  as a projection or a guarantee. The engine's own accounting is nominal and documented as
  optimistic on magnitudes; the deck leans on *relationships between rungs*, not on any
  single dollar figure being achievable.
- **The 4% SWR is a convention, not a promise** — label it as a modeling convention on
  slides 13 and 18.
- **Return-of-capital language.** Slide 12 is about return of capital, so it must not
  drift into tax claims. Use "return of principal" for the mechanic; if tax treatment is
  mentioned at all, use the house line: *return-of-capital treatment; consult a CPA.*
- **Debt is shown, never buried.** Peak outstanding appears on slides 11 and 14.
- **Vocabulary:** "The Amplification", "Amplicon", "CYCLE". Never "snowball", "passive
  income", or "hustle".
- **Voice:** peers reporting what the model actually produced — humble on status, firm on
  method.

---

## 7. Build approach

1. A Node build script in the session scratchpad (the deck is a marketing artifact, not a
   repo source file) imports `runSimulation` and derives every figure in §4 at build time —
   no hardcoded numbers in the slide text.
2. Slides are built with the `amplifica-deck-style` helper library, copied verbatim
   (palette, `newS`, `amplitudeBars`, `footer`, `kicker`, `headline`, `card`, `quad`,
   `numberedCards`, `bigStat`, `statPanel`, `twoColumn`, `table`, `sources`, `placeImg`).
3. Render slides to images and QA with fresh eyes for overflow and overlap; fix and
   re-render.
4. Deliver the `.pptx`.

**Out of scope:** perpetual Amplicons, HYSA rate sensitivity (what if rates fall to 2%),
tax treatment beyond the one-line caveat, and HELOC-vs-PLOC comparison. These were
considered and cut to hold the deck at ~19 slides; they are candidates for a follow-on.

---

## 8. Success criteria

- A student who finishes the deck can state, unprompted, why cash flow and wealth are
  produced by two different mechanisms.
- A student can answer "does it still work at a 25% line?" with "yes, more slowly" and
  cite the year-5 figure.
- No student comes away believing the HYSA flywheel builds wealth.
- Every number in the deck traces to a `runSimulation` call with the §3 parameters.
