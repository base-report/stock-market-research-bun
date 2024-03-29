import type { Symbol } from "../schemas/Symbol";

import { db } from "./client";

const addSymbols = (symbols: Symbol[]) => {
  if (symbols.length === 0) return;

  const insertRow = db.prepare(
    "INSERT INTO symbols (code, name, exchange, isin) VALUES ($code, $name, $exchange, $isin) ON CONFLICT(code) DO UPDATE SET name=excluded.name, exchange=excluded.exchange, isin=excluded.isin",
  );

  const insertAll = db.transaction((symbols: Symbol[]) => {
    for (const symbol of symbols) {
      insertRow.run({
        $code: symbol.code,
        $name: symbol.name,
        $exchange: symbol.exchange,
        $isin: symbol.isin,
      });
    }
    return symbols.length;
  });

  const count = insertAll(symbols);
  console.log(`Inserted ${count} symbols`);
};

const getAllSymbolCodes = (): string[] => {
  const query = db.query(`SELECT code FROM symbols`);
  const symbols = query.values();
  return symbols.map(([code]) => code);
};

export { addSymbols, getAllSymbolCodes };
