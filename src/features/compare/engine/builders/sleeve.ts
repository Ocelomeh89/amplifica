// Capital an option does not absorb is not missing, it is idle. The sleeve is
// where it sits: an implicit cash account earning capital.idleYieldPct, taxed
// as ordinary portfolio income like any other cash.
//
// This is what makes totalCashCollected, exitProceeds, peakCapitalAtRisk and
// both paybacks mean anything. Before it, cash took a lump sum plus monthly,
// the flywheel ignored the lump sum entirely and the rental sized itself from
// price and down payment, and the tool compared $266k against $168k anyway.
//
// It attaches AFTER escalation (see run.ts): a quoted yield is nominal, so a
// sleeve bolted onto a "real" option beforehand would be inflated along with
// it. Running the wrap afterwards means the sleeve never has to reason about
// entryBasis at all.

import {
  HORIZON_MONTHS,
  LAST_INCOME_MONTH,
  type CapitalSchedule,
  type OptionSeries,
} from "../types";
import { cashAccount, scheduleFlow } from "./cash-account";

// Rounding slack. Balances are dollars; anything below a hundredth of a cent
// is float noise, not an overdraft.
const EPSILON = 1e-4;

export function withSleeve(option: OptionSeries, capital: CapitalSchedule): OptionSeries {
  if (option.entryBasis !== "nominal") {
    throw new Error(
      `withSleeve requires escalated (nominal) input; ${option.id} is "${option.entryBasis}"`
    );
  }

  const flow = scheduleFlow(capital);
  const residual = flow.map((f, m) => f - option.capitalIn[m]);
  const account = cashAccount(residual, capital.idleYieldPct, `${option.id}:sleeve`);

  for (let m = 0; m < HORIZON_MONTHS; m++) {
    if (account.balance[m] < -EPSILON) {
      throw new Error(
        `sleeve balance for ${option.id} went negative at month ${m} ` +
          `(${account.balance[m].toFixed(2)}): the option absorbed more capital ` +
          `than the schedule had provided by then`
      );
    }
  }

  const held = account.balance[LAST_INCOME_MONTH];

  return {
    ...option,
    // The contract: every option consumes the schedule in full.
    capitalIn: flow,
    preTaxCash: option.preTaxCash.map((c, m) => c + account.interest[m]),
    taxItems: [...option.taxItems, ...account.taxItems],
    exit: {
      ...option.exit,
      // At basis on both sides, so idle cash never manufactures a gain.
      grossProceeds: option.exit.grossProceeds + held,
      costBasis: option.exit.costBasis + held,
    },
    bookValue: option.bookValue.map((b, m) => b + account.balance[m]),
    continuingMonthlyIncome:
      option.continuingMonthlyIncome + held * (capital.idleYieldPct / 12),
  };
}

// The first month the schedule's contributions alone cover an option's
// upfront outlay. Interest earned while waiting is deliberately ignored: it
// would only pull the date earlier, and deriving the month from contributions
// alone keeps it independent of idleYieldPct, so changing the idle rate
// cannot silently move an option's start date.
export function entryMonth(demand: number, capital: CapitalSchedule): number {
  if (demand <= 0) return 0;
  const flow = scheduleFlow(capital);
  let balance = 0;
  for (let m = 0; m < HORIZON_MONTHS; m++) {
    balance += flow[m];
    if (balance + EPSILON >= demand) return m;
  }
  throw new Error(
    `the capital schedule never accumulates ${demand.toFixed(2)}: ` +
      `it totals ${flow.reduce((a, v) => a + v, 0).toFixed(2)} over the horizon`
  );
}
