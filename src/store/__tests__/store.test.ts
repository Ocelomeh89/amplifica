import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { useStore } from "../store";
import { clearPortfolio } from "../persistence";
import { defaultPortfolio } from "../initial";

describe("store", () => {
  beforeEach(async () => {
    await clearPortfolio();
    useStore.setState({
      portfolio: defaultPortfolio(),
      active: [],
      baseline: null,
      loaded: false,
    });
  });

  it("recomputes projection when portfolio changes", () => {
    useStore.getState().update((p) => {
      p.horizonMonths = 6;
      p.startingCash = 1000;
      p.monthlySavings = { default: 500, overrides: [] };
    });
    const { active } = useStore.getState();
    expect(active).toHaveLength(6);
    expect(active[0].cashBalance).toBeCloseTo(1500, 2);
  });

  it("loadFromDB persists and reloads", async () => {
    useStore.getState().update((p) => {
      p.name = "Persisted plan";
    });
    await new Promise((r) => setTimeout(r, 400));
    useStore.setState({ loaded: false });
    await useStore.getState().loadFromDB();
    expect(useStore.getState().portfolio.name).toBe("Persisted plan");
  });
});
