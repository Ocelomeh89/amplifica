-- projections: add the stock-market benchmark rate (annual decimal). Existing
-- rows backfill to 10%, matching DEFAULT_MARKET_RETURN_PCT in projection-sim.ts.
alter table public.projections
  add column market_return_pct numeric(5, 4) not null default 0.10
    check (market_return_pct >= 0);
