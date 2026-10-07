# Lead-gen quiz: design

Date: 2026-10-06. Status: draft for review. Temporary feature, removable in one delete.

## Goal

A public quiz at `amplificawealth.com/quiz`, distributed mainly through Instagram, so it must work well on a phone. It sorts people into one of 8 investor archetypes using 15 questions with 5 answers each. It targets people who want to do more than buy ETFs but are not ready to quit their job and buy a business.

The quiz captures name and email before showing results. The results page can be reloaded and shared by link, and the person can download a PDF. We keep a copy of every submission (name, email, answers, scores, archetype). Every submitter is also subscribed to the Beehiiv newsletter.

Success: completions that reach the email gate, emails captured, and clicks from results to the calculator, the debt letter or the community.

## Confirmed decisions

- 8 archetypes (below). The primary button on every result is "Run the calculator", except the Recovering Debt-aholic (newsletter letter) and the Cash-Flow Builder (community join page).
- Downloadable means a generated PDF, built with `pdf-lib`.
- Reuse the existing lead pattern: service-role insert, honeypot, UTM capture, awaited best-effort Beehiiv subscribe.
- Beehiiv gets `first_name` only. No custom field. The archetype lives in `quiz_submissions` in Postgres, which is the source of truth for segmenting.
- All copy passes the no-ai-slop skill. No em dashes.
- The quiz stays out of the sitemap. Result pages are noindex.

## Architecture

New folder `src/features/quiz/`, routes under `src/app/quiz/`. It follows the repo's three import rules: `app/` may import `features/quiz`, and `features/quiz` imports only `shared/`.

One refactor comes with it. `features/calculator/data/beehiiv.ts` moves to `src/shared/beehiiv.ts`, since two features now use it. Its signature becomes `subscribeToNewsletter({ email, source, firstName? })`. The calculator passes `source: "calculator"`, so its behavior does not change. `utm_source` takes the `source` value.

```
src/shared/beehiiv.ts
src/features/quiz/
  CLAUDE.md
  content.ts          archetypes, questions, weights, result copy, CTAs
  scoring.ts          pure scoreAnswers(answers) -> { scores, archetype, runnerUp }
  scoring.test.ts
  content.test.ts
  data/actions.ts     submitQuiz server action
  data/actions.test.ts
  data/results.ts     getResultByToken (service-role read)
  pdf/buildResultPdf.ts
  ui/QuizClient.tsx   landing, question screens, email gate
  ui/ResultView.tsx
src/app/quiz/page.tsx
src/app/quiz/r/[token]/page.tsx
src/app/quiz/r/[token]/pdf/route.ts
supabase/migrations/0010_quiz_submissions.sql
```

Middleware: `/quiz` bypasses the auth round-trip, as `/calculator` does.

## Data

Migration `0010_quiz_submissions.sql`:

| column | type | notes |
|---|---|---|
| `id` | uuid pk | default `gen_random_uuid()` |
| `token` | uuid unique | default `gen_random_uuid()`, used in the result URL |
| `name` | text | trimmed, max 100 |
| `email` | text | same regex check as `leads` |
| `answers` | jsonb | array of 15 integers, each 0 to 4 |
| `scores` | jsonb | object keyed by archetype key |
| `archetype` | text | check constraint against the 8 keys |
| `runner_up` | text | same check |
| `quiz_version` | int | starts at 1 |
| `utm_source`, `utm_medium`, `utm_campaign` | text | each capped at 200 chars |
| `user_agent` | text | capped at 500 chars |
| `beehiiv_synced` | boolean | default false |
| `created_at` | timestamptz | default now() |

RLS is enabled with no policies, so the anon key is denied. Only the service-role client reads or writes the table. There is no unique index on email, so a retake adds a new row.

Each submit also inserts into `leads` with `source: "quiz"`. A duplicate there (`23505`) counts as success. `database.types.ts` gets a `QuizSubmission` mirror.

## Submit flow

`submitQuiz(formData)`, called from the client form's `onSubmit` (React 18 here has no `useFormState`, so the action is called directly, as `FoundContentForm` does):

1. Honeypot field `website`. If filled, redirect to `/quiz` without storing anything.
2. Validate: name 1 to 100 chars, email by regex, exactly 15 answers each an integer from 0 to 4.
3. Score on the server with `scoreAnswers`. Nothing from the browser is trusted except the raw answers.
4. Insert into `quiz_submissions`. A hard failure returns "Something went wrong. Please try again." and shows no result.
5. Insert into `leads` (`source: "quiz"`), duplicates ignored.
6. Await `subscribeToNewsletter` with the first token of the name as `first_name` and `source: "quiz"`. On success, set `beehiiv_synced`. Failure never blocks the result.
7. Redirect to `/quiz/r/[token]`.

Abuse resistance matches the calculator: honeypot, validation, service-role-only writes. Escalate to Vercel Firewall rate limiting if spam appears.

## Scoring

- Each option carries weights: 2 points to a primary archetype and optionally 1 to a secondary.
- The 15 answers are summed per archetype. The highest total wins. The second highest is the runner-up.
- Ties break by this fixed order: Recovering Debt-aholic, Serial Dabbler, Reluctant Landlord, Swing-for-the-Fences Speculator, ETF Optimizer, Autopilot Saver, Cash-Flow Builder, Acquirer. Runner-up ties break by the same order.
- `content.test.ts` checks that every weight key is a known archetype, every question has exactly 5 options, there are exactly 15 questions, and each archetype is the primary on 8 to 11 options. A scoring test also proves each archetype can win, using a synthetic answer set per archetype.
- `quiz_version` is stored on every row, so questions can change later without muddying old results.

## Archetypes

| key | name | primary button |
|---|---|---|
| `autopilot-saver` | The Autopilot Saver | Run the calculator |
| `recovering-debt-aholic` | The Recovering Debt-aholic | Read the letter (newsletter), secondary: calculator |
| `etf-optimizer` | The ETF Optimizer | Run the calculator |
| `serial-dabbler` | The Serial Dabbler | Run the calculator |
| `reluctant-landlord` | The Reluctant Landlord | Run the calculator |
| `swing-speculator` | The Swing-for-the-Fences Speculator | Run the calculator |
| `cash-flow-builder` | The Cash-Flow Builder | Join Amplifica (community), secondary: calculator |
| `acquirer` | The Acquirer | Run the calculator |

Destinations:

- Calculator: `/calculator`
- Debt letter: `https://newsletter.amplificawealth.com/p/pay-off-car-loan-before-higher-interest-debt`
- Community: `https://community.amplificawealth.com/join-now`

Abbreviations in the weights below: A autopilot-saver, D recovering-debt-aholic, E etf-optimizer, S serial-dabbler, L reluctant-landlord, P swing-speculator, C cash-flow-builder, Q acquirer.

## The 15 questions

Options display in the order written. `A2` means 2 points to Autopilot. `E2 A1` means 2 to ETF Optimizer and 1 to Autopilot.

**Q1. Where does most of your invested money sit today?**
1. A 401k or target-date fund I never touch. A2
2. Rental property. L2
3. Very little. Debt takes most of what I earn. D2
4. Stocks, crypto and a few bets I believe in. P2 S1
5. Index funds and ETFs I picked myself. E2 A1

**Q2. How often do you check your investments?**
1. Every day, sometimes more than once. P2 S1
2. Once a year, if that. A2
3. Monthly, usually to rebalance. E2
4. Every week, to see what they paid me. C2 Q1
5. Whenever the next course or tip shows up. S2

**Q3. An extra $1,000 lands in your account. What happens to it?**
1. It sits in savings until I figure out what to do. A2
2. It goes straight at my credit card balance. D2
3. It goes into my index funds, like every month. E2 A1
4. I look for something that beats the market. S2 P1
5. It buys another asset that pays me monthly. C2 Q1

**Q4. What is your honest relationship with debt?**
1. I have almost none, and I like it that way. A2 E1
2. Credit card balances I am working through. D2
3. A mortgage on a property I rent out. L2
4. A tool. I borrow with a repayment plan. C2 Q1
5. Business or deal debt I am carrying. Q2 P1

**Q5. Which money mistake taught you the most?**
1. Trying five things and finishing none. S2
2. Spending more than I earned for years. D2
3. Putting too much into one deal. Q2 P1
4. Buying something hot right before it fell. P2 S1
5. Buying a property that ate my time. L2

**Q6. The market drops 20% in a month. You...**
1. Don't look. It's in the 401k. A2
2. Feel sick, since the card payments don't shrink. D2
3. Rebalance and keep buying. E2
4. Buy more, or go find a bounce trade. P2 S1
5. Check that my income assets still pay. C2 Q1

**Q7. How many hours a week do you spend on money?**
1. About 30 minutes, on a set routine. C2
2. One or two, reading and tweaking my portfolio. E2 S1
3. More than five, between tenants, repairs and spreadsheets. L2
4. Most of my free time, on a deal I am building. Q2
5. A few hours, hopping between strategies. S2 P1

**Q8. What have you tried besides index funds?**
1. Nothing yet. A2
2. A course or two, plus some crypto. S2
3. Options or leveraged trades. P2
4. A rental property or two. L2
5. Buying or investing in a small business. Q2 C1

**Q9. How do you feel about your paycheck?**
1. Stuck. I need it to cover what I owe. D2
2. It is one of my income streams, and the smallest one. C2 Q1
3. Fine. I just want my investments to do more. E2
4. A means to an end. I am building my exit. Q2 C1
5. It is never enough, so I keep hunting for the next big move. P2 S1

**Q10. How do you feel about borrowing to invest?**
1. Reckless. I would never do it. A2 D1
2. I am careful. Borrowing hurt me before. D2
3. I did it for my rentals, and I would do it again. L2 Q1
4. Normal for deals. Leverage is how acquisitions get done. Q2
5. I do it, with a plan, and I like the math. C2 Q1

**Q11. What does "enough" cash flow look like for you?**
1. A portfolio big enough to pull 4% a year. E2 A1
2. Enough to stop chasing the next thing. S2
3. Rent that covers the mortgage and then some. L2
4. Income that covers my bills, so work is optional. C2 Q1
5. Income that funds my next deal without new savings. Q2 C1

**Q12. How do you feel about owning a business or property?**
1. It has never crossed my mind. A2
2. Not until I am out of debt. D2
3. I would consider it, but index funds are easier. E2 A1
4. I own property and manage it myself. L2
5. I want to buy a business and I am working out how to pay for it. Q2 C1

**Q13. What holds you back from doing more?**
1. I don't know what else is out there. A2 S1
2. I try too many things and none gets enough time. S2
3. I want to get rich fast, so I take too much risk. P2
4. Capital. I know the move, I just need the funds. Q2 C1
5. Nothing. I already run a routine and want people doing the same. C2

**Q14. How much could you put to work each month?**
1. Under $500, after the minimum payments. D2 A1
2. Whatever is left after repairs and reserves. L2
3. It varies. Whatever is left after my latest idea. S2 P1
4. Whatever the next trade needs. P2 S1
5. A lump sum, if the right deal shows up. Q2 C1

**Q15. What do you want your money to do in five years?**
1. Grow into a bigger pile on its own. E2 A1
2. Be one system I stop tinkering with. S2
3. Land one big win so I can stop. P2
4. Pay me every month and fund a bigger move. C2 Q1
5. Fund me buying my own business. Q2 C1

Primary-point counts: A 9, D 9, E 9, S 9, L 9, P 9, C 10, Q 11.

## Result copy

Each result has a diagnosis, a "your next single", and a button. Every result also shows the runner-up line ("You also have some of: ...") and the note from Miguel.

**Note from Miguel (all results):** "I swung for the fences before I was ready. Now I build singles first. The calculator is where I'd start."

**The Autopilot Saver.**
Diagnosis: You pay yourself first and you don't panic. That habit beats most investors. What's missing is the question of what your money earns after fees, and what it could earn with a different job. The default setting works, and it also caps you.
Your next single: Add up what your 401k and savings earned last year after fees. Then run the calculator with $1,000 a month and see what a second income stream adds.
Button: Run the calculator.

**The Recovering Debt-aholic.**
Diagnosis: You spent big for a while, the cards piled up, and now you want to invest but feel you can't until the balance hits zero. That belief deserves a test before you put years behind it. Paying debt off first has a price, like any other choice.
Your next single: Read my letter on why the avalanche method optimizes the wrong number. Then list every balance next to its rate. Any plan starts with that list.
Button: Read the letter. Secondary: Run the calculator.

**The ETF Optimizer.**
Diagnosis: You got the basics right: low fees, broad funds, steady contributions. Your next dollar earns the market return, and so does every one after it. That is the ceiling of this approach.
Your next single: Keep the index funds. Run the calculator with your monthly amount and see what a second stream of cash flow adds on top.
Button: Run the calculator.

**The Serial Dabbler.**
Diagnosis: You have tried a course, a coin, a side hustle. You are curious and you move fast, and both help. Nothing compounds because each new idea resets the clock.
Your next single: Pick one routine and run it for 90 days before you look at anything else. The calculator gives you a number to measure it against.
Button: Run the calculator.

**The Reluctant Landlord.**
Diagnosis: The property pays, and it pays in phone calls too. When repairs, tenants and reserves take your weekends, the return looks different from what the spreadsheet says. Real estate can be a good asset. The test is what each hour of your time earns.
Your next single: Write down the hours you spent on the property last month and divide the net income by them. Then run the calculator and compare that rate with a hands-off income stream.
Button: Run the calculator.

**The Swing-for-the-Fences Speculator.**
Diagnosis: You like big upside, and sometimes it pays. I bought a business before I was ready, and I lost big. A swing needs a base under it, and the base is dull: steady monthly cash flow from small positions.
Your next single: Decide what you can lose without changing your life. Then run the calculator and see what steady cash flow builds before your next swing.
Button: Run the calculator.

**The Cash-Flow Builder.**
Diagnosis: You already think like an Amplifica client. You borrow on purpose, you track what comes in, and you care more about the weekly routine than the headlines. The people running the same cycle compare notes in the community.
Your next single: Join the community, share your numbers, and see how others handle the same decisions.
Button: Join Amplifica. Secondary: Run the calculator.

**The Acquirer.**
Diagnosis: You are ready for something bigger than a portfolio. You know deals take capital, and you are working out where it comes from. Amplifica sits under that plan: a cash-flow base that funds the move without draining your savings.
Your next single: Run the calculator and see how long a monthly cash-flow base takes to reach the check size you need.
Button: Run the calculator.

**Disclaimer (results page and PDF):** Educational only. Not financial advice. Examples use stated assumptions, not promised returns.

## Screens and UX copy

- **Landing:** headline "What kind of investor are you?" Subline: "15 questions. About 3 minutes. You get your investor profile and your next step." Button: "Start".
- **Question screens:** one question per screen. Tapping an answer selects it and advances after about 150 ms. A Back button and a progress bar ("4 of 15") stay visible.
- **Email gate (after Q15):** headline "Where should we send your results?" Fields: Name, Email. Button: "Show my results". Small print: "We'll also send you the Amplifica newsletter. Unsubscribe anytime."
- **Result page:** archetype name, diagnosis, your next single, primary button, secondary link if any, runner-up line, "Download your results (PDF)", note from Miguel, disclaimer.

Mobile rules:

- Answer buttons are at least 52 px tall and full width, with 16 px or larger text.
- Inputs use 16 px text so iOS does not zoom.
- Layout is one column, readable at 360 px, and tested at 390 px.
- Answers persist in `localStorage` (wrapped in try/catch) so a reload inside Instagram's in-app browser does not restart the quiz.
- UTM parameters on `/quiz` are read from the query string and passed through hidden fields.

## PDF

Built in `pdf/buildResultPdf.ts` with `pdf-lib` and standard fonts. US Letter, one page, 54 pt margins.

1. Header: "Amplifica Wealth" in the plum accent.
2. Title: "Your investor profile". Below it: the person's name and the date.
3. Archetype name, large.
4. Diagnosis paragraph.
5. "Your next single" in a bordered box.
6. Runner-up line.
7. The link to the destination for that archetype, written out in full.
8. Footer: disclaimer.

The route `/quiz/r/[token]/pdf` returns `application/pdf` with `Content-Disposition: attachment; filename="amplifica-investor-profile.pdf"`. An unknown token returns 404.

## Privacy and indexing

- Result pages carry `robots: noindex`. `robots.ts` disallows `/quiz/r/`.
- The quiz is not listed in `sitemap.ts`.
- The unique token is a random UUID, not the email or the row id.

## Testing

- `scoring.test.ts`: totals, tie-break order, runner-up, every archetype can win.
- `content.test.ts`: 15 questions, 5 options each, known archetype keys only, primary counts 8 to 11 per archetype.
- `actions.test.ts`: honeypot, bad email, wrong answer count, out-of-range answer, name length, happy path with mocks.
- `boundaries.test.ts` stays green with no change.
- Manual check at 390 px width in the browser: full run, reload mid-quiz, PDF download on a phone-sized viewport.

## Removal

Delete `src/features/quiz/` and `src/app/quiz/`. Drop `quiz_submissions` in a new migration. Remove the `/quiz` line from the middleware and the `/quiz/r/` line from `robots.ts`. `shared/beehiiv.ts` stays because the calculator uses it.

## Open items

1. **Domain.** Confirm at deploy time that `amplificawealth.com/quiz` resolves to this Next.js app (the root domain is the hub).
2. **Funnel tracking.** v1 records only completions. Starts and drop-off per question would need a small events table. Not in scope.

Resolved: the Speculator copy keeps no loss figure, and there is no Beehiiv custom field.
