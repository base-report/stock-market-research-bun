import type { Symbol } from "../schemas/Symbol";

import { SymbolSchema } from "../schemas/Symbol";
import { fetchCsv } from "../util/fetch";

const INVALID_SYMBOLS = [
  "ZJZZT",
  "ZVZZT",
  "ZWZZT",
  "NTEST",
  "NTEST-H",
  "NTEST-I",
];

type InputExchange = "NASDAQ" | "NYSE";

const getExchangeSymbols = async (
  exchange: InputExchange,
): Promise<Symbol[]> => {
  const url = `${process.env.EODHD_API_BASE_URL}/exchange-symbol-list/${exchange}?api_token=${process.env.EODHD_API_TOKEN}&delisted=1&type=common_stock`;

  const data = await fetchCsv<Symbol[]>(url);
  const symbols = data.map((symbol) => SymbolSchema.parse(symbol));
  const validSymbols = symbols.filter(
    (symbol) => !INVALID_SYMBOLS.includes(symbol.code),
  );

  return validSymbols;
};

export { getExchangeSymbols };
