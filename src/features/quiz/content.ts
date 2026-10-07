// All quiz copy and scoring weights live here. Question and result copy is
// the reviewed text from docs/superpowers/specs/2026-10-06-lead-gen-quiz-design.md.
// Do not reword it without re-running the no-ai-slop pass.

/** Order matters: it is the tie-break order when two archetypes score the same. */
export const ARCHETYPE_KEYS = [
  "recovering-debt-aholic",
  "serial-dabbler",
  "reluctant-landlord",
  "swing-speculator",
  "etf-optimizer",
  "autopilot-saver",
  "cash-flow-builder",
  "acquirer",
] as const;

export type ArchetypeKey = (typeof ARCHETYPE_KEYS)[number];

export function isArchetypeKey(value: unknown): value is ArchetypeKey {
  return typeof value === "string" && (ARCHETYPE_KEYS as readonly string[]).includes(value);
}

/** Bump when questions or weights change; stored on every submission. */
export const QUIZ_VERSION = 1;
export const QUIZ_LENGTH = 15;
export const OPTIONS_PER_QUESTION = 5;

export const CALCULATOR_URL = "/calculator";
export const DEBT_LETTER_URL =
  "https://newsletter.amplificawealth.com/p/pay-off-car-loan-before-higher-interest-debt";
export const COMMUNITY_JOIN_URL = "https://community.amplificawealth.com/join-now";

export type Weights = Partial<Record<ArchetypeKey, 1 | 2>>;

export interface QuizOption {
  text: string;
  weights: Weights;
}

export interface QuizQuestion {
  prompt: string;
  options: readonly QuizOption[];
}

export interface CtaLink {
  label: string;
  href: string;
}

export interface Archetype {
  key: ArchetypeKey;
  name: string;
  diagnosis: string;
  nextSingle: string;
  primary: CtaLink;
  secondary?: CtaLink;
}

/** What the result page and PDF need about one saved submission. */
export interface QuizResult {
  token: string;
  name: string;
  archetype: ArchetypeKey;
  runnerUp: ArchetypeKey;
  createdAt: string;
}

const A = "autopilot-saver" as const;
const D = "recovering-debt-aholic" as const;
const E = "etf-optimizer" as const;
const S = "serial-dabbler" as const;
const L = "reluctant-landlord" as const;
const P = "swing-speculator" as const;
const C = "cash-flow-builder" as const;
const Q = "acquirer" as const;

/** o("text", [PRIMARY, 2], [SECONDARY, 1]) */
function o(text: string, ...pairs: [ArchetypeKey, 1 | 2][]): QuizOption {
  return { text, weights: Object.fromEntries(pairs) as Weights };
}

export const QUESTIONS: readonly QuizQuestion[] = [
  {
    prompt: "Where does most of your invested money sit today?",
    options: [
      o("A 401k or target-date fund I never touch.", [A, 2]),
      o("Rental property.", [L, 2]),
      o("Very little. Debt takes most of what I earn.", [D, 2]),
      o("Stocks, crypto and a few bets I believe in.", [P, 2], [S, 1]),
      o("Index funds and ETFs I picked myself.", [E, 2], [A, 1]),
    ],
  },
  {
    prompt: "How often do you check your investments?",
    options: [
      o("Every day, sometimes more than once.", [P, 2], [S, 1]),
      o("Once a year, if that.", [A, 2]),
      o("Monthly, usually to rebalance.", [E, 2]),
      o("Every week, to see what they paid me.", [C, 2], [Q, 1]),
      o("Whenever the next course or tip shows up.", [S, 2]),
    ],
  },
  {
    prompt: "An extra $1,000 lands in your account. What happens to it?",
    options: [
      o("It sits in savings until I figure out what to do.", [A, 2]),
      o("It goes straight at my credit card balance.", [D, 2]),
      o("It goes into my index funds, like every month.", [E, 2], [A, 1]),
      o("I look for something that beats the market.", [S, 2], [P, 1]),
      o("It buys another asset that pays me monthly.", [C, 2], [Q, 1]),
    ],
  },
  {
    prompt: "What is your honest relationship with debt?",
    options: [
      o("I have almost none, and I like it that way.", [A, 2], [E, 1]),
      o("Credit card balances I am working through.", [D, 2]),
      o("A mortgage on a property I rent out.", [L, 2]),
      o("A tool. I borrow with a repayment plan.", [C, 2], [Q, 1]),
      o("Business or deal debt I am carrying.", [Q, 2], [P, 1]),
    ],
  },
  {
    prompt: "Which money mistake taught you the most?",
    options: [
      o("Trying five things and finishing none.", [S, 2]),
      o("Spending more than I earned for years.", [D, 2]),
      o("Putting too much into one deal.", [Q, 2], [P, 1]),
      o("Buying something hot right before it fell.", [P, 2], [S, 1]),
      o("Buying a property that ate my time.", [L, 2]),
    ],
  },
  {
    prompt: "The market drops 20% in a month. You...",
    options: [
      o("Don't look. It's in the 401k.", [A, 2]),
      o("Feel sick, since the card payments don't shrink.", [D, 2]),
      o("Rebalance and keep buying.", [E, 2]),
      o("Buy more, or go find a bounce trade.", [P, 2], [S, 1]),
      o("Check that my income assets still pay.", [C, 2], [Q, 1]),
    ],
  },
  {
    prompt: "How many hours a week do you spend on money?",
    options: [
      o("About 30 minutes, on a set routine.", [C, 2]),
      o("One or two, reading and tweaking my portfolio.", [E, 2], [S, 1]),
      o("More than five, between tenants, repairs and spreadsheets.", [L, 2]),
      o("Most of my free time, on a deal I am building.", [Q, 2]),
      o("A few hours, hopping between strategies.", [S, 2], [P, 1]),
    ],
  },
  {
    prompt: "What have you tried besides index funds?",
    options: [
      o("Nothing yet.", [A, 2]),
      o("A course or two, plus some crypto.", [S, 2]),
      o("Options or leveraged trades.", [P, 2]),
      o("A rental property or two.", [L, 2]),
      o("Buying or investing in a small business.", [Q, 2], [C, 1]),
    ],
  },
  {
    prompt: "How do you feel about your paycheck?",
    options: [
      o("Stuck. I need it to cover what I owe.", [D, 2]),
      o("It is one of my income streams, and the smallest one.", [C, 2], [Q, 1]),
      o("Fine. I just want my investments to do more.", [E, 2]),
      o("A means to an end. I am building my exit.", [Q, 2], [C, 1]),
      o("It is never enough, so I keep hunting for the next big move.", [P, 2], [S, 1]),
    ],
  },
  {
    prompt: "How do you feel about borrowing to invest?",
    options: [
      o("Reckless. I would never do it.", [A, 2], [D, 1]),
      o("I am careful. Borrowing hurt me before.", [D, 2]),
      o("I did it for my rentals, and I would do it again.", [L, 2], [Q, 1]),
      o("Normal for deals. Leverage is how acquisitions get done.", [Q, 2]),
      o("I do it, with a plan, and I like the math.", [C, 2], [Q, 1]),
    ],
  },
  {
    prompt: 'What does "enough" cash flow look like for you?',
    options: [
      o("A portfolio big enough to pull 4% a year.", [E, 2], [A, 1]),
      o("Enough to stop chasing the next thing.", [S, 2]),
      o("Rent that covers the mortgage and then some.", [L, 2]),
      o("Income that covers my bills, so work is optional.", [C, 2], [Q, 1]),
      o("Income that funds my next deal without new savings.", [Q, 2], [C, 1]),
    ],
  },
  {
    prompt: "How do you feel about owning a business or property?",
    options: [
      o("It has never crossed my mind.", [A, 2]),
      o("Not until I am out of debt.", [D, 2]),
      o("I would consider it, but index funds are easier.", [E, 2], [A, 1]),
      o("I own property and manage it myself.", [L, 2]),
      o("I want to buy a business and I am working out how to pay for it.", [Q, 2], [C, 1]),
    ],
  },
  {
    prompt: "What holds you back from doing more?",
    options: [
      o("I don't know what else is out there.", [A, 2], [S, 1]),
      o("I try too many things and none gets enough time.", [S, 2]),
      o("I want to get rich fast, so I take too much risk.", [P, 2]),
      o("Capital. I know the move, I just need the funds.", [Q, 2], [C, 1]),
      o("Nothing. I already run a routine and want people doing the same.", [C, 2]),
    ],
  },
  {
    prompt: "How much could you put to work each month?",
    options: [
      o("Under $500, after the minimum payments.", [D, 2], [A, 1]),
      o("Whatever is left after repairs and reserves.", [L, 2]),
      o("It varies. Whatever is left after my latest idea.", [S, 2], [P, 1]),
      o("Whatever the next trade needs.", [P, 2], [S, 1]),
      o("A lump sum, if the right deal shows up.", [Q, 2], [C, 1]),
    ],
  },
  {
    prompt: "What do you want your money to do in five years?",
    options: [
      o("Grow into a bigger pile on its own.", [E, 2], [A, 1]),
      o("Be one system I stop tinkering with.", [S, 2]),
      o("Land one big win so I can stop.", [P, 2]),
      o("Pay me every month and fund a bigger move.", [C, 2], [Q, 1]),
      o("Fund me buying my own business.", [Q, 2], [C, 1]),
    ],
  },
];

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  "autopilot-saver": {
    key: "autopilot-saver",
    name: "The Autopilot Saver",
    diagnosis:
      "You pay yourself first and you don't panic. That habit beats most investors. What's missing is the question of what your money earns after fees, and what it could earn with a different job. The default setting works, and it also caps you.",
    nextSingle:
      "Add up what your 401k and savings earned last year after fees. Then run the calculator with $1,000 a month and see what a second income stream adds.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "recovering-debt-aholic": {
    key: "recovering-debt-aholic",
    name: "The Recovering Debt-aholic",
    diagnosis:
      "You spent big for a while, the cards piled up, and now you want to invest but feel you can't until the balance hits zero. That belief deserves a test before you put years behind it. Paying debt off first has a price, like any other choice.",
    nextSingle:
      "Read my letter on why the avalanche method optimizes the wrong number. Then list every balance next to its rate. Any plan starts with that list.",
    primary: { label: "Read the letter", href: DEBT_LETTER_URL },
    secondary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "etf-optimizer": {
    key: "etf-optimizer",
    name: "The ETF Optimizer",
    diagnosis:
      "You got the basics right: low fees, broad funds, steady contributions. Your next dollar earns the market return, and so does every one after it. That is the ceiling of this approach.",
    nextSingle:
      "Keep the index funds. Run the calculator with your monthly amount and see what a second stream of cash flow adds on top.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "serial-dabbler": {
    key: "serial-dabbler",
    name: "The Serial Dabbler",
    diagnosis:
      "You have tried a course, a coin, a side hustle. You are curious and you move fast, and both help. Nothing compounds because each new idea resets the clock.",
    nextSingle:
      "Pick one routine and run it for 90 days before you look at anything else. The calculator gives you a number to measure it against.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "reluctant-landlord": {
    key: "reluctant-landlord",
    name: "The Reluctant Landlord",
    diagnosis:
      "The property pays, and it pays in phone calls too. When repairs, tenants and reserves take your weekends, the return looks different from what the spreadsheet says. Real estate can be a good asset. The test is what each hour of your time earns.",
    nextSingle:
      "Write down the hours you spent on the property last month and divide the net income by them. Then run the calculator and compare that rate with a hands-off income stream.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "swing-speculator": {
    key: "swing-speculator",
    name: "The Swing-for-the-Fences Speculator",
    diagnosis:
      "You like big upside, and sometimes it pays. I bought a business before I was ready, and I lost big. A swing needs a base under it, and the base is dull: steady monthly cash flow from small positions.",
    nextSingle:
      "Decide what you can lose without changing your life. Then run the calculator and see what steady cash flow builds before your next swing.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  "cash-flow-builder": {
    key: "cash-flow-builder",
    name: "The Cash-Flow Builder",
    diagnosis:
      "You already think like an Amplifica client. You borrow on purpose, you track what comes in, and you care more about the weekly routine than the headlines. The people running the same cycle compare notes in the community.",
    nextSingle:
      "Join the community, share your numbers, and see how others handle the same decisions.",
    primary: { label: "Join Amplifica", href: COMMUNITY_JOIN_URL },
    secondary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
  acquirer: {
    key: "acquirer",
    name: "The Acquirer",
    diagnosis:
      "You are ready for something bigger than a portfolio. You know deals take capital, and you are working out where it comes from. Amplifica sits under that plan: a cash-flow base that funds the move without draining your savings.",
    nextSingle:
      "Run the calculator and see how long a monthly cash-flow base takes to reach the check size you need.",
    primary: { label: "Run the calculator", href: CALCULATOR_URL },
  },
};

export const MIGUEL_NOTE =
  "I swung for the fences before I was ready. Now I build singles first. The calculator is where I'd start.";

export const DISCLAIMER =
  "Educational only. Not financial advice. Examples use stated assumptions, not promised returns.";
