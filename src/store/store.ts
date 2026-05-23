import { create } from "zustand";
import type { Portfolio, MonthlyState } from "@engine/index";
import { project, withScenario } from "@engine/index";
import { defaultPortfolio } from "./initial";
import { loadPortfolio, savePortfolio } from "./persistence";

interface StoreState {
  portfolio: Portfolio;
  active: MonthlyState[];
  baseline: MonthlyState[] | null;
  loaded: boolean;

  loadFromDB: () => Promise<void>;
  setPortfolio: (p: Portfolio) => void;
  update: (mut: (p: Portfolio) => void) => void;
  replacePortfolio: (p: Portfolio) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(p: Portfolio) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void savePortfolio(p);
  }, 250);
}

function recompute(p: Portfolio) {
  const merged = withScenario(p, p.activeScenarioId);
  const active = project(merged);
  const baseline = p.baselineScenarioId
    ? project(withScenario(p, p.baselineScenarioId))
    : null;
  return { active, baseline };
}

export const useStore = create<StoreState>((set, get) => ({
  portfolio: defaultPortfolio(),
  active: [],
  baseline: null,
  loaded: false,

  loadFromDB: async () => {
    const loaded = await loadPortfolio();
    const p = loaded ?? defaultPortfolio();
    const { active, baseline } = recompute(p);
    set({ portfolio: p, active, baseline, loaded: true });
    if (!loaded) {
      scheduleSave(p);
    }
  },

  setPortfolio: (p) => {
    const { active, baseline } = recompute(p);
    set({ portfolio: p, active, baseline });
    scheduleSave(p);
  },

  update: (mut) => {
    const p = structuredClone(get().portfolio);
    mut(p);
    get().setPortfolio(p);
  },

  replacePortfolio: (p) => {
    get().setPortfolio(p);
  },
}));
