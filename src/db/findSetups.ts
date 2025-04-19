import type { HistoricalPrices } from "../schemas/HistoricalPrices";
import type { Trendline } from "../schemas/Trendline";
import type { NonNullableDailyPricesObject } from "../schemas/HistoricalPrices";
import type { Setup } from "../schemas/Setup";

import { DateTime } from "luxon";
import sharp from "sharp";
import { getHistoricalPrices } from "./historicalPrices";
import { generateChart } from "../chart/svg";
import { processData, fitLine } from "../util/chart";
import { addTrades } from "../db/trade";
import {
  calculateSMA,
  calculateADR,
  calculateDollarVolume,
} from "../util/calc";
import { calculateVolatilityContraction } from "../util/volatility";
import { calculateConsolidationBounds } from "../util/outliers";
import cliProgress from "cli-progress";

const priorMoveMaxDays = 50;
const priorMoveMinPercentage = 0.25; // Reduced from 0.3 to find more setups
const consolidationMinDays = 7; // Reduced from 10 to find shorter consolidations
const consolidationMaxDays = 60; // Increased from 40 to find longer consolidations
const minVolatilityContraction = 0.25; // Reduced from 0.3 to find more setups

/**
 * Find a significant prior move that could lead to a consolidation
 * Improved to better handle V-shaped recoveries and rapid moves
 * @param data Price data
 * @param index Current index
 * @returns Prior move information if found
 */
const findPriorMove = (
  data: NonNullableDailyPricesObject[],
  index: number
): Setup["priorMove"] | undefined => {
  let highIndex = 0;
  let lowIndex = 0;

  let startIndex = index - priorMoveMaxDays;
  if (startIndex < 0) {
    startIndex = 0;
  }

  // First pass: find the absolute high and low in the lookback period
  for (let i = startIndex; i < index; i++) {
    if (data[i].high > data[highIndex].high) {
      highIndex = i;
    }
    if (data[i].low < data[lowIndex].low) {
      lowIndex = i;
    }
  }

  // For V-shaped recoveries (like in the example chart), we want to prioritize
  // the most recent significant low-to-high move

  // Look for the most recent significant low point before the current index
  // but after any major high point
  let recentLowIndex = lowIndex;
  let significantLowFound = false;

  // If the high came before the low, look for a more recent low
  if (highIndex < lowIndex) {
    // Use the original low
    significantLowFound = true;
  } else {
    // Look for a significant low after the high
    let lowestAfterHigh = highIndex;
    for (let i = highIndex + 1; i < index - 5; i++) {
      // Leave room for a move after the low
      if (data[i].low < data[lowestAfterHigh].low) {
        lowestAfterHigh = i;
        // Check if this is a significant low (at least 15% below the high)
        if ((data[highIndex].high - data[i].low) / data[i].low >= 0.15) {
          recentLowIndex = i;
          significantLowFound = true;
        }
      }
    }
  }

  // If we found a significant recent low, look for the high after it
  let recentHighIndex = highIndex;
  if (significantLowFound) {
    // Find the highest point between the recent low and current index
    recentHighIndex = recentLowIndex;
    for (let i = recentLowIndex + 1; i < index; i++) {
      if (data[i].high > data[recentHighIndex].high) {
        recentHighIndex = i;
      }
    }

    // Extend the high if there are new highs in the next few days
    let newHighInNext3Days = true;
    while (newHighInNext3Days) {
      newHighInNext3Days = false;
      for (
        let i = recentHighIndex + 1;
        i < recentHighIndex + 4 && i < index;
        i++
      ) {
        if (data[i]?.high > data[recentHighIndex]?.high) {
          recentHighIndex = i;
          newHighInNext3Days = true;
        }
      }
    }

    // Calculate the percentage move from the recent low to recent high
    const recentPct =
      (data[recentHighIndex].high - data[recentLowIndex].low) /
      data[recentLowIndex].low;

    // If the recent move is significant enough, use it instead of the absolute high/low
    if (recentPct >= priorMoveMinPercentage * 0.8) {
      // Slightly lower threshold for recent moves
      highIndex = recentHighIndex;
      lowIndex = recentLowIndex;
    }
  }

  // Calculate the final percentage move
  const pct = (data[highIndex].high - data[lowIndex].low) / data[lowIndex].low;

  const withinMaxDays = highIndex - lowIndex <= priorMoveMaxDays;
  if (pct >= priorMoveMinPercentage && highIndex > lowIndex && withinMaxDays) {
    const highDate = DateTime.fromJSDate(data[highIndex].date).toFormat(
      "yyyy-MM-dd"
    );
    const lowDate = DateTime.fromJSDate(data[lowIndex].date).toFormat(
      "yyyy-MM-dd"
    );

    return {
      highIndex,
      lowIndex,
      pct,
      highDate,
      lowDate,
    };
  }

  return undefined;
};

/**
 * Find a consolidation range with volatility contraction and breakout
 * with improved detection that favors recent price action
 * @param data Price data
 * @param priorMoveHighIndex Index of the high point of the prior move
 * @returns Consolidation range information if found
 */
const findConsolidationRange = (
  data: NonNullableDailyPricesObject[],
  priorMoveHighIndex: number
):
  | {
      upperBound: number;
      lowerBound: number;
      startIndex: number;
      endIndex: number;
      volatilityContraction: number;
      rangeQuality: number;
      densityScore: number;
      qualityScore: number;
      breakoutPrice: number;
    }
  | undefined => {
  // Store the best consolidation found
  let bestConsolidation:
    | {
        upperBound: number;
        lowerBound: number;
        startIndex: number;
        endIndex: number;
        volatilityContraction: number;
        rangeQuality: number;
        densityScore: number;
        qualityScore: number;
        breakoutPrice: number;
      }
    | undefined;

  // Try different starting points for consolidation
  // This helps with cases where the initial volatility after a move is high
  // We'll try more offsets to better capture consolidations that start a bit later
  // after the prior move high (like in the April-May example)
  for (let offset = 0; offset <= 10; offset++) {
    const adjustedStartIndex = priorMoveHighIndex + offset;

    // Try different consolidation periods
    for (
      let period = consolidationMinDays;
      period <= consolidationMaxDays;
      period++
    ) {
      const endIndex = adjustedStartIndex + period;
      if (endIndex >= data.length - 1) break; // Need at least one more candle for breakout

      const consolidationData = data.slice(adjustedStartIndex, endIndex);

      // Calculate range bounds with outlier filtering to "capture the meat of the move"
      const {
        upperBound,
        lowerBound,
        rangeQuality,
        densityScore,
        isValidConsolidation,
      } = calculateConsolidationBounds(
        consolidationData,
        0.1, // Lower percentile
        0.9, // Upper percentile
        1.0 // More aggressive outlier filtering
      );

      // Skip this period if it's not a valid consolidation
      if (!isValidConsolidation) continue;

      // Calculate volatility contraction
      const volatilityContraction = calculateVolatilityContraction(
        data,
        adjustedStartIndex,
        endIndex - 1
      );

      // Calculate a combined quality score (0-100)
      const qualityScore = Math.round(
        (rangeQuality * 0.5 +
          volatilityContraction * 0.3 +
          densityScore * 0.2) *
          100
      );

      // Check if we have sufficient volatility contraction
      // For shorter consolidations, we're a bit more lenient with volatility contraction
      const minRequiredContraction =
        consolidationData.length <= 15
          ? minVolatilityContraction * 0.8
          : minVolatilityContraction;

      if (volatilityContraction >= minRequiredContraction) {
        // Check for breakout - we'll be more flexible with what constitutes a breakout
        // Either the close is above the upper bound OR the high is significantly above it
        const isCloseBreakout = data[endIndex]?.close > upperBound;
        const isHighBreakout = data[endIndex]?.high > upperBound * 1.01; // 1% above upper bound

        if (isCloseBreakout || isHighBreakout) {
          const consolidation = {
            upperBound,
            lowerBound,
            startIndex: adjustedStartIndex,
            endIndex,
            volatilityContraction,
            rangeQuality,
            densityScore,
            qualityScore,
            breakoutPrice: upperBound,
          };

          // If this is our first valid consolidation or it has a better quality score
          // than our previous best, update the best consolidation
          if (
            !bestConsolidation ||
            qualityScore > bestConsolidation.qualityScore
          ) {
            bestConsolidation = consolidation;
          }
        }
      }
    }
  }

  return bestConsolidation;
};

const findHighestPriceAndExit = (
  data: NonNullableDailyPricesObject[],
  trade: Setup["trade"],
  index: number
):
  | {
      exit: Setup["trade"]["exit"];
      highestPrice: Setup["trade"]["highestPrice"];
    }
  | undefined => {
  let highestPrice: Setup["trade"]["highestPrice"] = {
    index: 0,
    price: 0,
    days: 1,
    date: "",
  };

  let exit: Setup["trade"]["exit"] = {
    price: 0,
    index: 0,
    days: 0,
    reason: "",
    date: "",
  };

  const entryLOD = data[trade.entry.index].low;

  // Start counting from the day after entry
  for (let i = index + 1; i < data.length; i++) {
    if (data[i].high > highestPrice.price) {
      highestPrice = {
        index: i,
        price: data[i].high,
        days: i - trade.entry.index,
        date: DateTime.fromJSDate(data[i].date).toFormat("yyyy-MM-dd"),
      };
    }
    if (data[i].close < entryLOD) {
      exit = {
        price: data[i].close,
        index: i,
        days: i - trade.entry.index,
        reason: "low of the day",
        date: DateTime.fromJSDate(data[i].date).toFormat("yyyy-MM-dd"),
      };
      break;
    }
    const sma10 = calculateSMA(data, i, 10);
    if (data[i].close < sma10) {
      exit = {
        price: data[i].close,
        index: i,
        days: i - trade.entry.index,
        reason: "SMA10",
        date: DateTime.fromJSDate(data[i].date).toFormat("yyyy-MM-dd"),
      };
      break;
    }
  }

  return { exit, highestPrice };
};

const findSetups = (_code: string, maxSetups: number = 0) => {
  const result = getHistoricalPrices(_code);
  if (!result) return 0;

  const { code, daily } = result;

  const decoder = new TextDecoder();
  const jsonString = decoder.decode(daily);
  const historicalPrices = JSON.parse(jsonString);
  const processedData: NonNullableDailyPricesObject[] =
    processData(historicalPrices);

  const setups: Setup[] = [];

  for (let i = 0; i < processedData.length; i++) {
    // If we've reached the maximum number of setups, stop processing
    if (maxSetups > 0 && setups.length >= maxSetups) break;

    const priorMove = findPriorMove(processedData, i);

    if (priorMove) {
      const consolidationRange = findConsolidationRange(
        processedData,
        priorMove.highIndex
      );

      if (consolidationRange) {
        const {
          upperBound,
          lowerBound,
          startIndex,
          endIndex,
          volatilityContraction,
          qualityScore,
          breakoutPrice,
        } = consolidationRange;

        const adr = calculateADR(processedData, endIndex);

        // Skip trades that are too extended
        if (
          processedData[endIndex].close >
          processedData[priorMove.highIndex].high * (1 + adr)
        ) {
          continue;
        }

        // Create a trendline for chart visualization purposes
        const consolidationData = processedData.slice(startIndex, endIndex);
        const trendline = fitLine(consolidationData, (d) => d.high);

        if (!trendline) continue;

        const consolidation = {
          slope: trendline.slope,
          days: endIndex - startIndex,
          startIndex: startIndex,
          endIndex: endIndex,
          startDate: DateTime.fromJSDate(
            processedData[startIndex].date
          ).toFormat("yyyy-MM-dd"),
          endDate: DateTime.fromJSDate(processedData[endIndex].date).toFormat(
            "yyyy-MM-dd"
          ),
        };

        const price = processedData[endIndex].close;
        const dollarVolume = calculateDollarVolume(processedData, endIndex);

        // Skip trades with low dollar volume
        if (dollarVolume < 500000) {
          // Reduced from 1,000,000 to find more setups
          continue;
        }

        const trade = {
          entry: {
            price,
            index: endIndex,
            trendlineBreakPrice: breakoutPrice,
            adr,
            dollarVolume,
            date: DateTime.fromJSDate(processedData[endIndex].date).toFormat(
              "yyyy-MM-dd"
            ),
          },
        };

        // look for a setup with overlapping trading dates
        const existingSetup = setups.find((setup) => {
          return (
            setup.priorMove.lowIndex <= priorMove.lowIndex &&
            setup.priorMove.highIndex >= priorMove.highIndex &&
            setup.consolidation?.startIndex <= consolidation.startIndex &&
            setup.consolidation?.endIndex >= consolidation.endIndex
          );
        });

        if (trade && !existingSetup) {
          const exitResult = findHighestPriceAndExit(
            processedData,
            trade as Setup["trade"],
            endIndex
          );

          if (!exitResult) continue;

          const { exit, highestPrice } = exitResult;

          // Add exit and highestPrice to trade object
          const completeTrade = {
            ...trade,
            exit,
            highestPrice,
          };

          const setup: Setup = {
            code,
            priorMove,
            consolidation,
            trade: completeTrade,
          };
          setups.push(setup);

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
          let exitIndex = setup.trade.exit?.index - chartStartIndex;

          if (!exitIndex) {
            exitIndex = chartEndIndex - chartStartIndex;
          }

          // Create a consolidation range object for the chart
          const consolidationRangeForChart = {
            upperBound,
            lowerBound,
            volatilityContraction,
            qualityScore,
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
            trendline,
            consolidationRangeForChart
          );

          if (chart) {
            const chartBuffer = Buffer.from(chart);
            const filename = `${code}-${setup.trade.entry.date}-${setup.trade.exit.date}.png`;
            sharp(chartBuffer).png().toFile(`./charts/${filename}`);
          }
        }
      }
    }
  }

  addTrades(setups);
  console.log(`${code}: ${setups.length}`);
  return setups.length;
};

export { findSetups, calculateADR, findPriorMove, findConsolidationRange };
