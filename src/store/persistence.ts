import Dexie, { type Table } from "dexie";
import type { Portfolio } from "@engine/index";

interface PortfolioRow {
  id: string;
  data: Portfolio;
}

class AmplificaDB extends Dexie {
  portfolios!: Table<PortfolioRow, string>;

  constructor() {
    super("amplifica");
    this.version(1).stores({
      portfolios: "id",
    });
  }
}

const db = new AmplificaDB();
const SINGLETON_KEY = "current";

export async function loadPortfolio(): Promise<Portfolio | null> {
  const row = await db.portfolios.get(SINGLETON_KEY);
  return row?.data ?? null;
}

export async function savePortfolio(p: Portfolio): Promise<void> {
  await db.portfolios.put({ id: SINGLETON_KEY, data: p });
}

export async function clearPortfolio(): Promise<void> {
  await db.portfolios.delete(SINGLETON_KEY);
}
