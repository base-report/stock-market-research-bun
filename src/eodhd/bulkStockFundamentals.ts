import type { BulkStockFundamentals } from "../schemas/BulkStockFundamentals";

import { BulkStockFundamentalsSchema } from "../schemas/BulkStockFundamentals";
import { fetchJson } from "../util/fetch";

const getBulkStockFundamentals = async (
  codes: string[],
): Promise<BulkStockFundamentals> => {
  const url = `${
    process.env.EODHD_API_BASE_URL
  }/bulk-fundamentals/US?api_token=${
    process.env.EODHD_API_TOKEN
  }&fmt=json&version=1.2&symbols=${codes.join(",")}`;

  const data = await fetchJson<BulkStockFundamentals>(url);

  return BulkStockFundamentalsSchema.parse(data);
};

export { getBulkStockFundamentals };
