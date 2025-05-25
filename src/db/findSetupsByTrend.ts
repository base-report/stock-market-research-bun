import type { NonNullableDailyPricesObject } from "../schemas/HistoricalPrices";
import type { Setup } from "../schemas/Setup";

import { DateTime } from "luxon";
import sharp from "sharp";
import { getHistoricalPrices } from "./historicalPrices";
import { generateChart } from "../chart/svg";
import { processData } from "../util/chart";
import { addTrades } from "../db/trade";
import {
  calculateSMA,
  calculateADR,
  calculateDollarVolume,
} from "../util/calc";
import { getCache } from "../util/cache";
import { calculateTrendSimilarity } from "../util/trendSimilarity";
import idealTrendPattern from "../idealTrendPattern";

// Configuration for trend similarity-based setup detection
const config = {
  // Trend similarity criteria
  windowSize: idealTrendPattern.length, // Use the length of the ideal pattern
  minSimilarityScore: 98, // Minimum similarity score (0-100)

  // Volume and liquidity filters - ensures tradeable setups
  minDollarVolume: 1000000, // Minimum daily dollar volume for liquidity

  // Pattern structure expectations (no filtering, just for analysis)
  // Quality metrics will be calculated after pattern matching for analysis
};

/**
 * Find exit point and highest price after entry
 * @param data Price data
 * @param trade Trade entry information
 * @param entryIndex Index of entry
 * @returns Exit and highest price information
 */
const findHighestPriceAndExit = (
  data: NonNullableDailyPricesObject[],
  trade: Partial<Setup["trade"]>,
  entryIndex: number
):
  | {
      exit: Setup["trade"]["exit"];
      highestPrice: Setup["trade"]["highestPrice"];
    }
  | undefined => {
  const cache = getCache();
  const cacheKey = `exit:${entryIndex}:${trade.entry?.date}`;

  return cache.getOrCalculate(cacheKey, () => {
    let exit: Setup["trade"]["exit"] | undefined;
    let highestPrice: Setup["trade"]["highestPrice"] = {
      index: entryIndex,
      price: data[entryIndex].high,
      days: 0,
      date: DateTime.fromJSDate(data[entryIndex].date).toFormat("yyyy-MM-dd"),
    };

    const entryLOD = data[entryIndex].low;

    // Start counting from the day after entry
    for (let i = entryIndex + 1; i < data.length; i++) {
      if (data[i].high > highestPrice.price) {
        highestPrice = {
          index: i,
          price: data[i].high,
          days: i - entryIndex,
          date: DateTime.fromJSDate(data[i].date).toFormat("yyyy-MM-dd"),
        };
      }

      // Exit on close below entry low
      if (data[i].close < entryLOD) {
        exit = {
          price: data[i].close,
          index: i,
          days: i - entryIndex,
          reason: "low of the day",
          date: DateTime.fromJSDate(data[i].date).toFormat("yyyy-MM-dd"),
        };
        break;
      }

      // Exit on close below SMA10
      const sma10 = calculateSMA(data, i, 10);
      if (data[i].close < sma10) {
        exit = {
          price: data[i].close,
          index: i,
          days: i - entryIndex,
          reason: "SMA10",
          date: DateTime.fromJSDate(data[i].date).toFormat("yyyy-MM-dd"),
        };
        break;
      }
    }

    // If no exit was found, use the last available data point
    if (!exit) {
      const lastIndex = data.length - 1;
      exit = {
        price: data[lastIndex].close,
        index: lastIndex,
        days: lastIndex - entryIndex,
        reason: "end of data",
        date: DateTime.fromJSDate(data[lastIndex].date).toFormat("yyyy-MM-dd"),
      };
    }

    return { exit, highestPrice };
  });
};

/**
 * Find setups using trend similarity approach
 * @param ticker Stock ticker symbol
 * @param maxSetups Maximum number of setups to find (0 = no limit)
 * @param generateCharts Whether to generate chart images
 * @returns Number of setups found
 */
const findSetupsByTrend = (
  ticker: string,
  maxSetups: number = 0,
  generateCharts: boolean = true
): number => {
  // Clear the calculation cache to prevent memory buildup between tickers
  getCache().clear();

  const result = getHistoricalPrices(ticker);
  if (!result) return 0;

  const { code, daily } = result;

  const decoder = new TextDecoder();
  const jsonString = decoder.decode(daily);
  const historicalPrices = JSON.parse(jsonString);
  const processedData: NonNullableDailyPricesObject[] =
    processData(historicalPrices);

  if (processedData.length < config.windowSize + 10) {
    return 0; // Not enough data
  }

  const finalSetups: Setup[] = [];
  let setupsFound = 0;
  let totalWindows = 0;
  let highSimilarityWindows = 0;

  // Slide the window through the data
  for (let i = 0; i <= processedData.length - config.windowSize; i++) {
    totalWindows++;
    // If we've reached the maximum number of setups, stop processing
    if (maxSetups > 0 && setupsFound >= maxSetups) break;

    const windowData = processedData.slice(i, i + config.windowSize);
    const windowPrices = windowData.map((d) => d.close);

    // Calculate similarity to ideal pattern
    const similarity = calculateTrendSimilarity(
      idealTrendPattern,
      windowPrices,
      config.windowSize
    );

    if (similarity >= config.minSimilarityScore) {
      highSimilarityWindows++;

      // For trend similarity, we'll create a simplified setup without pattern analysis
      // Entry point is at the end of the window (breakout point)
      const entryIndex = i + config.windowSize - 1;

      // Create simplified prior move (from start to 40% of window)
      const priorMoveStartIndex = i;
      const priorMoveEndIndex = i + Math.floor(config.windowSize * 0.4);
      const priorMoveLow = Math.min(
        ...processedData
          .slice(priorMoveStartIndex, priorMoveEndIndex + 1)
          .map((d) => d.low)
      );
      const priorMoveHigh = Math.max(
        ...processedData
          .slice(priorMoveStartIndex, priorMoveEndIndex + 1)
          .map((d) => d.high)
      );
      const priorMovePct = (priorMoveHigh - priorMoveLow) / priorMoveLow;

      // Create simplified consolidation (from 30% to 85% of window)
      const consolidationStartIndex = i + Math.floor(config.windowSize * 0.3);
      const consolidationEndIndex = i + Math.floor(config.windowSize * 0.85);

      // Create prior move object
      const priorMove: Setup["priorMove"] = {
        lowIndex: priorMoveStartIndex,
        highIndex: priorMoveEndIndex,
        pct: priorMovePct,
        lowDate: DateTime.fromJSDate(
          processedData[priorMoveStartIndex].date
        ).toFormat("yyyy-MM-dd"),
        highDate: DateTime.fromJSDate(
          processedData[priorMoveEndIndex].date
        ).toFormat("yyyy-MM-dd"),
      };

      // Create consolidation object
      const consolidation: Setup["consolidation"] = {
        slope: 0, // Simplified - no trendline calculation
        days: consolidationEndIndex - consolidationStartIndex,
        startIndex: consolidationStartIndex,
        endIndex: consolidationEndIndex,
        startDate: DateTime.fromJSDate(
          processedData[consolidationStartIndex].date
        ).toFormat("yyyy-MM-dd"),
        endDate: DateTime.fromJSDate(
          processedData[consolidationEndIndex].date
        ).toFormat("yyyy-MM-dd"),
        volatilityContraction: 0, // Simplified - will calculate for display only
        qualityScore: Math.round(similarity), // Use similarity as quality score
        rangeQuality: similarity / 100,
        densityScore: similarity / 100,
      };

      // Check dollar volume at entry
      const dollarVolume = calculateDollarVolume(processedData, entryIndex);
      if (dollarVolume < config.minDollarVolume) {
        continue;
      }

      // Create trade entry
      const adr = calculateADR(processedData, entryIndex);
      const entryPrice = processedData[entryIndex].close;

      const trade = {
        entry: {
          price: entryPrice,
          index: entryIndex,
          trendlineBreakPrice: entryPrice, // For trend similarity, entry price is the breakout
          adr,
          dollarVolume,
          date: DateTime.fromJSDate(processedData[entryIndex].date).toFormat(
            "yyyy-MM-dd"
          ),
        },
      };

      // Find exit and highest price
      const exitResult = findHighestPriceAndExit(
        processedData,
        trade,
        entryIndex
      );
      if (!exitResult) continue;

      const { exit, highestPrice } = exitResult;

      // Complete the trade object
      const completeTrade = {
        ...trade,
        exit,
        highestPrice,
      };

      // Create the final setup
      const setup: Setup = {
        code,
        priorMove,
        consolidation,
        trade: completeTrade,
      };

      finalSetups.push(setup);
      setupsFound++;

      // Generate chart if requested
      if (generateCharts) {
        let chartStartIndex = setup.priorMove.lowIndex - 20;
        if (chartStartIndex < 0) {
          chartStartIndex = 0;
        }

        let chartEndIndex = setup.trade.exit?.index + 20;
        if (chartEndIndex >= processedData.length) {
          chartEndIndex = processedData.length - 1;
        }

        let priorMoveStartIndex = setup.priorMove.lowIndex - chartStartIndex;
        if (priorMoveStartIndex < 0) {
          priorMoveStartIndex = 0;
        }

        const priorMoveEndIndex = setup.priorMove.highIndex - chartStartIndex;
        const consolidationStartIndex =
          setup.consolidation.startIndex - chartStartIndex;
        const consolidationEndIndex =
          setup.consolidation.endIndex - chartStartIndex;
        const entryIndex = setup.trade.entry.index - chartStartIndex;
        const exitIndex = setup.trade.exit?.index - chartStartIndex;

        // Calculate simple bounds for chart visualization
        const consolidationData = processedData.slice(
          consolidationStartIndex,
          consolidationEndIndex
        );
        const upperBound = Math.max(...consolidationData.map((d) => d.high));
        const lowerBound = Math.min(...consolidationData.map((d) => d.low));

        const consolidationRangeForChart = {
          upperBound,
          lowerBound,
          volatilityContraction: 0, // Simplified
          qualityScore: Math.round(similarity),
          similarityScore: similarity,
        };

        // Generate chart with consolidation range visualization
        const chart = generateChart(
          processedData.slice(chartStartIndex, chartEndIndex),
          priorMoveStartIndex,
          priorMoveEndIndex,
          consolidationStartIndex,
          consolidationEndIndex,
          entryIndex,
          exitIndex,
          null, // No trendline for simplified approach
          consolidationRangeForChart
        );

        if (chart) {
          const chartBuffer = Buffer.from(chart);
          const filename = `${setup.code}-${setup.trade.entry.date}-${setup.trade.exit.date}-trend.png`;
          sharp(chartBuffer).png().toFile(`./charts/${filename}`);
        }
      }

      // Skip ahead to avoid overlapping patterns
      i += Math.floor(config.windowSize * 0.5); // Skip 50% of window size to reduce overlap
    }
  }

  // Add the final setups to the database
  addTrades(finalSetups);
  console.log(
    `${finalSetups.length > 0 ? finalSetups[0].code : "No setups found"}: ${finalSetups.length} (trend similarity)`
  );
  return finalSetups.length;
};

export { findSetupsByTrend };
