import { z } from "zod";

const roundTo = (num: number, decimals: number) => {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

// Schema for improved setups (findSetupsByAuggie)
const ImprovedSetupSchema = z.object({
  code: z.string(),
  priorMove: z.object({
    lowIndex: z.number(),
    highIndex: z.number(),
    pct: z.number(),
    lowDate: z.string(),
    highDate: z.string(),
  }),
  consolidation: z.object({
    slope: z.number(),
    days: z.number(),
    startIndex: z.number(),
    endIndex: z.number(),
    startDate: z.string(),
    endDate: z.string(),
    flatness: z.number(), // flatness score instead of volatilityContraction
    retracement: z.number(), // retracement from prior move high
  }),
  trade: z.object({
    entry: z.object({
      price: z.number(),
      index: z.number(),
      trendlineBreakPrice: z.number(),
      adr: z.number(),
      dollarVolume: z.number(),
      date: z.string(),
    }),
    highestPrice: z.object({
      index: z.number(),
      price: z.number(),
      days: z.number(),
      date: z.string(),
    }),
    exit: z.object({
      price: z.number(),
      index: z.number(),
      reason: z.string(),
      days: z.number(),
      date: z.string(),
    }),
  }),
});

type ImprovedSetup = z.infer<typeof ImprovedSetupSchema>;

// Transform function for database writes
const transformImprovedSetupSchema = (x: ImprovedSetup) => ({
  code: x.code,
  prior_move_low_date: x.priorMove.lowDate,
  prior_move_high_date: x.priorMove.highDate,
  prior_move_pct: roundTo(x.priorMove.pct * 100, 2),
  consolidation_slope: roundTo(x.consolidation.slope, 6),
  consolidation_days: x.consolidation.days,
  consolidation_start_date: x.consolidation.startDate,
  consolidation_end_date: x.consolidation.endDate,
  consolidation_flatness: roundTo(x.consolidation.flatness, 4),
  retracement: roundTo(x.consolidation.retracement, 4),
  entry_price: roundTo(x.trade.entry.price, 2),
  entry_date: x.trade.entry.date,
  entry_trendline_break_price: roundTo(x.trade.entry.trendlineBreakPrice, 2),
  entry_adr_pct: roundTo(x.trade.entry.adr, 4),
  entry_dollar_volume: roundTo(x.trade.entry.dollarVolume, 0),
  highest_price_date: x.trade.highestPrice.date,
  highest_price: roundTo(x.trade.highestPrice.price, 2),
  highest_price_days: x.trade.highestPrice.days,
  exit_price: roundTo(x.trade.exit.price, 2),
  exit_date: x.trade.exit.date,
  exit_reason: x.trade.exit.reason,
  exit_days: x.trade.exit.days,
});

const DBImprovedSetupWriteSchema = ImprovedSetupSchema.transform(transformImprovedSetupSchema);

type DBImprovedSetupWrite = z.infer<typeof DBImprovedSetupWriteSchema>;

const DBImprovedSetupReadSchema = ImprovedSetupSchema.transform((x) => ({
  ...transformImprovedSetupSchema(x),
  gain_pct: z.number(),
  max_possible_gain_pct: z.number(),
  unrealized_gain_pct: z.number(),
}));

type DBImprovedSetupRead = z.infer<typeof DBImprovedSetupReadSchema>;

export {
  ImprovedSetupSchema,
  transformImprovedSetupSchema,
  DBImprovedSetupWriteSchema,
  DBImprovedSetupReadSchema,
};
export type { ImprovedSetup, DBImprovedSetupWrite, DBImprovedSetupRead };
