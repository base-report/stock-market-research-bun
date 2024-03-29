import type { HistoricalPrices } from "../schemas/HistoricalPrices";

import { db } from "./client";

const addHistoricalPrices = (historicalPrices: HistoricalPrices) => {
  const query = db.query(
    "INSERT INTO historical_prices (code, daily) VALUES ($code, $daily) ON CONFLICT(code) DO UPDATE SET daily=excluded.daily",
  );
  query.run({
    $code: historicalPrices.code,
    $daily: historicalPrices.daily,
  });
};

const getLeftoverHistoricalPricesCodes = (): string[] => {
  const query = db.query(
    "SELECT code FROM symbols WHERE code NOT IN (SELECT code FROM historical_prices)",
  );
  const symbols = query.values();
  return symbols.map(([code]) => code);
};

export { addHistoricalPrices, getLeftoverHistoricalPricesCodes };
