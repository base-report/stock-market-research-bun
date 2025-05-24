import { z } from "zod";
import { roundTo } from "../util/number";

const SetupSchema = z.object({
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
    volatilityContraction: z.number().optional(),
    qualityScore: z.number().optional(),
    rangeQuality: z.number().optional(),
    densityScore: z.number().optional(),
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

type Setup = z.infer<typeof SetupSchema>;

const transformSetupSchema = (x: Setup) => ({
  code: x.code,
  prior_move_low_date: x.priorMove.lowDate,
  prior_move_high_date: x.priorMove.highDate,
  prior_move_pct: roundTo(x.priorMove.pct * 100, 4),
  consolidation_slope: roundTo(x.consolidation.slope, 4),
  consolidation_days: x.consolidation.days,
  consolidation_start_date: x.consolidation.startDate,
  consolidation_end_date: x.consolidation.endDate,
  entry_price: roundTo(x.trade.entry.price, 2),
  entry_date: x.trade.entry.date,
  entry_trendline_break_price: roundTo(x.trade.entry.trendlineBreakPrice, 2),
  entry_adr_pct: roundTo(x.trade.entry.adr * 100, 2),
  entry_dollar_volume: roundTo(x.trade.entry.dollarVolume, 0),
  highest_price_date: x.trade.highestPrice.date,
  highest_price: roundTo(x.trade.highestPrice.price, 2),
  highest_price_days: x.trade.highestPrice.days,
  exit_price: roundTo(x.trade.exit.price, 2),
  exit_date: x.trade.exit.date,
  exit_reason: x.trade.exit.reason,
  exit_days: x.trade.exit.days,
  volatility_contraction: x.consolidation.volatilityContraction
    ? roundTo(x.consolidation.volatilityContraction, 2)
    : null,
  consolidation_quality: x.consolidation.qualityScore
    ? roundTo(x.consolidation.qualityScore, 0)
    : null,
});

const DBSetupWriteSchema = SetupSchema.transform(transformSetupSchema);

type DBSetupWrite = z.infer<typeof DBSetupWriteSchema>;

const DBSetupReadSchema = SetupSchema.transform((x) => ({
  ...transformSetupSchema(x),
  gain_pct: z.number(),
  max_possible_gain_pct: z.number(),
  unrealized_gain_pct: z.number(),
}));

type DBSetupRead = z.infer<typeof DBSetupReadSchema>;

export type { Setup, DBSetupWrite, DBSetupRead };
export {
  SetupSchema,
  DBSetupWriteSchema,
  DBSetupReadSchema,
  transformSetupSchema,
};
