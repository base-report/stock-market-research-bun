import { z } from "zod";
import { parseNumber, roundTo } from "../util/number";
import { parseDateWithUsaClosingTime } from "../util/date";

const BaseDailyPricesSchema = z.object({
  Date: z.string(),
  Open: z.union([z.number(), z.string(), z.null()]),
  High: z.union([z.number(), z.string(), z.null()]),
  Low: z.union([z.number(), z.string(), z.null()]),
  Close: z.union([z.number(), z.string(), z.null()]),
  Adjusted_close: z.union([z.number(), z.string(), z.null()]),
  Volume: z.union([z.number(), z.string(), z.null()]),
});

const DailyPricesSchema = BaseDailyPricesSchema.transform((x) => {
  const open = parseNumber(x.Open);
  const high = parseNumber(x.High);
  const low = parseNumber(x.Low);
  const close = parseNumber(x.Close);
  const adjustedClose = parseNumber(x.Adjusted_close);
  const volume = parseNumber(x.Volume);

  if (
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    adjustedClose === null
  ) {
    return null;
  }

  const ratio = adjustedClose / close;

  const o = roundTo(open * ratio, 4);
  const h = roundTo(high * ratio, 4);
  const l = roundTo(low * ratio, 4);
  const c = roundTo(close * ratio, 4);
  const v = volume;
  const t = parseDateWithUsaClosingTime(x.Date).getTime();

  const result = [o, h, l, c, v, t];

  if (result.some((x) => typeof x !== "number" || Number.isNaN(x))) {
    return null;
  }

  return result;
});

type DailyPrices = z.infer<typeof DailyPricesSchema>;

const HistoricalPricesSchema = z.object({
  code: z.string(),
  daily: z.array(DailyPricesSchema).transform((array) => {
    const rows = array.filter((item) => item !== null);
    const jsonString = JSON.stringify(rows);
    const encoder = new TextEncoder();
    const binaryData: Uint8Array = encoder.encode(jsonString);

    return binaryData;
  }),
});

type HistoricalPrices = z.infer<typeof HistoricalPricesSchema>;

export type { DailyPrices, HistoricalPrices };
export { DailyPricesSchema, HistoricalPricesSchema };
