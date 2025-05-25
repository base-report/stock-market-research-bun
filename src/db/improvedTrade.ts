import type { ImprovedSetup, DBImprovedSetupWrite } from "../schemas/ImprovedSetup";

import { db } from "./client";
import { transformImprovedSetupSchema } from "../schemas/ImprovedSetup";

const addImprovedTrades = (setups: ImprovedSetup[]) => {
  if (setups.length === 0) return;

  const trades = setups.map(transformImprovedSetupSchema);
  const insertRow = db.prepare(`
    INSERT INTO improved_trades (
      code, prior_move_low_date, prior_move_high_date, prior_move_pct,
      consolidation_slope, consolidation_days, consolidation_start_date, consolidation_end_date,
      consolidation_flatness, retracement,
      entry_price, entry_date, entry_trendline_break_price, entry_adr_pct, entry_dollar_volume,
      highest_price_date, highest_price, highest_price_days,
      exit_price, exit_date, exit_reason, exit_days
    ) VALUES (
      $code, $prior_move_low_date, $prior_move_high_date, $prior_move_pct,
      $consolidation_slope, $consolidation_days, $consolidation_start_date, $consolidation_end_date,
      $consolidation_flatness, $retracement,
      $entry_price, $entry_date, $entry_trendline_break_price, $entry_adr_pct, $entry_dollar_volume,
      $highest_price_date, $highest_price, $highest_price_days,
      $exit_price, $exit_date, $exit_reason, $exit_days
    ) ON CONFLICT(code, entry_date, exit_date) DO UPDATE SET
      prior_move_low_date=excluded.prior_move_low_date,
      prior_move_high_date=excluded.prior_move_high_date,
      prior_move_pct=excluded.prior_move_pct,
      consolidation_slope=excluded.consolidation_slope,
      consolidation_days=excluded.consolidation_days,
      consolidation_start_date=excluded.consolidation_start_date,
      consolidation_end_date=excluded.consolidation_end_date,
      consolidation_flatness=excluded.consolidation_flatness,
      retracement=excluded.retracement,
      entry_price=excluded.entry_price,
      entry_trendline_break_price=excluded.entry_trendline_break_price,
      entry_adr_pct=excluded.entry_adr_pct,
      entry_dollar_volume=excluded.entry_dollar_volume,
      highest_price_date=excluded.highest_price_date,
      highest_price=excluded.highest_price,
      highest_price_days=excluded.highest_price_days,
      exit_price=excluded.exit_price,
      exit_reason=excluded.exit_reason,
      exit_days=excluded.exit_days
  `);

  const insertAll = db.transaction((trades: DBImprovedSetupWrite[]) => {
    for (const trade of trades) {
      insertRow.run({
        $code: trade.code,
        $prior_move_low_date: trade.prior_move_low_date,
        $prior_move_high_date: trade.prior_move_high_date,
        $prior_move_pct: trade.prior_move_pct,
        $consolidation_slope: trade.consolidation_slope,
        $consolidation_days: trade.consolidation_days,
        $consolidation_start_date: trade.consolidation_start_date,
        $consolidation_end_date: trade.consolidation_end_date,
        $consolidation_flatness: trade.consolidation_flatness,
        $retracement: trade.retracement,
        $entry_price: trade.entry_price,
        $entry_date: trade.entry_date,
        $entry_trendline_break_price: trade.entry_trendline_break_price,
        $entry_adr_pct: trade.entry_adr_pct,
        $entry_dollar_volume: trade.entry_dollar_volume,
        $highest_price_date: trade.highest_price_date,
        $highest_price: trade.highest_price,
        $highest_price_days: trade.highest_price_days,
        $exit_price: trade.exit_price,
        $exit_date: trade.exit_date,
        $exit_reason: trade.exit_reason,
        $exit_days: trade.exit_days,
      });
    }
    return trades.length;
  });

  insertAll(trades);
};

export { addImprovedTrades };
