import type {
  DailyPrices,
  HistoricalPrices,
} from "../schemas/HistoricalPrices";

import { HistoricalPricesSchema } from "../schemas/HistoricalPrices";
import { fetchCsv } from "../util/fetch";

const getHistoricalPrices = async (code: string): Promise<HistoricalPrices> => {
  const url = `${process.env.EODHD_API_BASE_URL}/eod/${code}?api_token=${process.env.EODHD_API_TOKEN}`;

  const daily = await fetchCsv<DailyPrices[]>(url);
  return HistoricalPricesSchema.parse({ code, daily });
};

export { getHistoricalPrices };
