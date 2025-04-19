import { db } from "./client";
import { getHistoricalPrices } from "./historicalPrices";
import { processData } from "../util/chart";
import { calculateVolatilityContraction } from "../util/volatility";
import { calculateConsolidationBounds } from "../util/outliers";
import { DateTime } from "luxon";
import { roundTo } from "../util/number";

/**
 * Update the volatility contraction and consolidation quality metrics for trades that don't have them populated
 * @returns Number of trades updated
 */
const updateTradeMetrics = () => {
  // Get only trades that don't have metrics populated
  const query = db.query(`
    SELECT
      id, code,
      consolidation_start_date, consolidation_end_date,
      volatility_contraction, consolidation_quality
    FROM trades
    WHERE volatility_contraction IS NULL OR consolidation_quality IS NULL
  `);
  const trades = query.all() as {
    id: number;
    code: string;
    consolidation_start_date: string;
    consolidation_end_date: string;
    volatility_contraction: number | null;
    consolidation_quality: number | null;
  }[];

  console.log(`Found ${trades.length} trades to update`);

  // Prepare the update statement
  const updateStmt = db.prepare(`
    UPDATE trades
    SET volatility_contraction = $volatility_contraction,
        consolidation_quality = $consolidation_quality
    WHERE id = $id
  `);

  let updatedCount = 0;

  // Process each trade
  for (const trade of trades) {
    // Get historical prices for this code
    const result = getHistoricalPrices(trade.code);
    if (!result) {
      console.log(`No historical prices found for ${trade.code}, skipping`);
      continue;
    }

    const { daily } = result;
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(daily);
    const historicalPrices = JSON.parse(jsonString);
    const processedData = processData(historicalPrices);

    // Find the start and end indices for the consolidation period
    const startDate = DateTime.fromFormat(
      trade.consolidation_start_date,
      "yyyy-MM-dd"
    );
    const endDate = DateTime.fromFormat(
      trade.consolidation_end_date,
      "yyyy-MM-dd"
    );

    let startIndex = -1;
    let endIndex = -1;

    for (let i = 0; i < processedData.length; i++) {
      const currentDate = DateTime.fromJSDate(processedData[i].date);

      if (startIndex === -1 && currentDate.hasSame(startDate, "day")) {
        startIndex = i;
      }

      if (endIndex === -1 && currentDate.hasSame(endDate, "day")) {
        endIndex = i;
      }

      if (startIndex !== -1 && endIndex !== -1) {
        break;
      }
    }

    if (startIndex === -1 || endIndex === -1) {
      console.log(
        `Could not find consolidation period for trade ${trade.id}, skipping`
      );
      continue;
    }

    // Calculate volatility contraction
    const volatilityContraction = calculateVolatilityContraction(
      processedData,
      startIndex,
      endIndex
    );

    // Calculate consolidation quality
    const consolidationData = processedData.slice(startIndex, endIndex + 1);
    const { rangeQuality, densityScore } = calculateConsolidationBounds(
      consolidationData,
      0.1, // Lower percentile
      0.9, // Upper percentile
      1.0 // Outlier filtering
    );

    // Calculate a combined quality score (0-100)
    const qualityScore = Math.round(
      (rangeQuality * 0.5 + volatilityContraction * 0.3 + densityScore * 0.2) *
        100
    );

    // Update the trade in the database
    updateStmt.run({
      $id: trade.id,
      $volatility_contraction: roundTo(volatilityContraction, 2),
      $consolidation_quality: qualityScore,
    });

    updatedCount++;
  }

  console.log(
    `Updated ${updatedCount} trades with volatility contraction and consolidation quality metrics`
  );
  return updatedCount;
};

export { updateTradeMetrics };
