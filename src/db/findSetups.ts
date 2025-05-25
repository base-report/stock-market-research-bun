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
import { getCache } from "../util/cache";

// Configuration for momentum setup detection - designed for swing trader discretion
const config = {
  // Prior move criteria - ensures significant momentum before consolidation
  priorMoveMaxDays: 60, // Maximum lookback period to search for prior moves
  priorMoveMaxWindow: 10, // Maximum duration for the explosive move itself
  minADRMultiple: 4, // Minimum move size relative to stock's average daily range
  maxPullbackFromHigh: 0.5, // Maximum retracement of prior move during consolidation
  moveEfficiencyThreshold: 0.5, // Minimum directional efficiency (filters choppy moves)

  // Consolidation criteria - identifies tight, controlled pullbacks
  consolidationMinDays: 5, // Minimum days for valid consolidation pattern
  consolidationMaxDays: 60, // Maximum days to maintain momentum
  minVolatilityContraction: 0.15, // Required volatility reduction during consolidation
  consolidationTightnessThreshold: 0.65, // Minimum tightness of price range

  // Volume and liquidity filters - ensures tradeable setups
  minDollarVolume: 1000000, // Minimum daily dollar volume for liquidity
  volumeDeclineThreshold: 0.7, // Required volume decline pattern during consolidation

  // Quality filters - eliminates poor price action
  maxExtensionFromHigh: 0.06, // Maximum extension above prior high at entry
  maxGapSize: 0.05, // Maximum gap size allowed during consolidation
  minPriceActionQuality: 0.65, // Minimum clean price action score
  minOverallQualityScore: 60, // Minimum combined quality assessment
};

/**
 * Calculate move efficiency - how "clean" and directional a move is
 * Higher values indicate more sustained, less choppy moves
 */
const calculateMoveEfficiency = (
  data: NonNullableDailyPricesObject[],
  startIndex: number,
  endIndex: number
): number => {
  if (endIndex <= startIndex) return 0;

  const totalMove = Math.abs(data[endIndex].close - data[startIndex].close);
  let totalMovement = 0;

  for (let i = startIndex + 1; i <= endIndex; i++) {
    totalMovement += Math.abs(data[i].close - data[i - 1].close);
  }

  return totalMovement > 0 ? totalMove / totalMovement : 0;
};

/**
 * Calculate volume pattern quality during consolidation
 * Good consolidations show declining volume
 */
const calculateVolumePattern = (
  data: NonNullableDailyPricesObject[],
  startIndex: number,
  endIndex: number
): number => {
  if (endIndex - startIndex < 5) return 0.5; // Not enough data

  const firstHalfEnd = startIndex + Math.floor((endIndex - startIndex) / 2);

  let firstHalfAvgVolume = 0;
  let secondHalfAvgVolume = 0;

  // Calculate average volume for first half
  for (let i = startIndex; i <= firstHalfEnd; i++) {
    firstHalfAvgVolume += data[i].volume;
  }
  firstHalfAvgVolume /= firstHalfEnd - startIndex + 1;

  // Calculate average volume for second half
  for (let i = firstHalfEnd + 1; i <= endIndex; i++) {
    secondHalfAvgVolume += data[i].volume;
  }
  secondHalfAvgVolume /= endIndex - firstHalfEnd;

  // Return ratio of volume decline (higher is better)
  return firstHalfAvgVolume > 0
    ? Math.min(1, secondHalfAvgVolume / firstHalfAvgVolume)
    : 0.5;
};

/**
 * Calculate price action quality - penalizes large gaps and erratic behavior
 */
const calculatePriceActionQuality = (
  data: NonNullableDailyPricesObject[],
  startIndex: number,
  endIndex: number
): number => {
  if (endIndex <= startIndex) return 0;

  let gapPenalty = 0;
  let wickPenalty = 0;
  let totalDays = endIndex - startIndex;

  for (let i = startIndex + 1; i <= endIndex; i++) {
    const prevClose = data[i - 1].close;
    const currentOpen = data[i].open;
    const currentHigh = data[i].high;
    const currentLow = data[i].low;
    const currentClose = data[i].close;

    // Penalize gaps
    const gapSize = Math.abs(currentOpen - prevClose) / prevClose;
    if (gapSize > config.maxGapSize) {
      gapPenalty += gapSize;
    }

    // Penalize excessive wicks (sign of indecision)
    const bodySize = Math.abs(currentClose - currentOpen);
    const upperWick = currentHigh - Math.max(currentOpen, currentClose);
    const lowerWick = Math.min(currentOpen, currentClose) - currentLow;
    const totalWick = upperWick + lowerWick;

    if (bodySize > 0 && totalWick / bodySize > 2) {
      wickPenalty += 0.1;
    }
  }

  // Return quality score (1 = perfect, 0 = terrible)
  const gapScore = Math.max(0, 1 - gapPenalty / totalDays);
  const wickScore = Math.max(0, 1 - wickPenalty / totalDays);

  return (gapScore + wickScore) / 2;
};

/**
 * Find a significant prior move that could lead to a consolidation
 * Now uses ADR-relative move detection for better quality assessment
 * @param data Price data
 * @param index Current index
 * @returns Prior move information if found
 */
const findPriorMove = (
  data: NonNullableDailyPricesObject[],
  index: number
): Setup["priorMove"] | undefined => {
  // Use cache to avoid recalculating the same prior move
  const cache = getCache();
  const cacheKey = `priormove:${index}`;

  return cache.getOrCalculate(cacheKey, () => {
    let highIndex = 0;
    let lowIndex = 0;

    let startIndex = index - config.priorMoveMaxDays;
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

      // Calculate ADR at the recent high to determine significance threshold
      const adrAtRecentHigh = calculateADR(data, recentHighIndex);
      const requiredRecentMove = adrAtRecentHigh * config.minADRMultiple * 0.8; // Slightly lower threshold for recent moves

      // If the recent move is significant enough relative to ADR, use it instead of the absolute high/low
      if (recentPct >= requiredRecentMove) {
        highIndex = recentHighIndex;
        lowIndex = recentLowIndex;
      }
    }

    // Calculate the final percentage move
    const pct =
      (data[highIndex].high - data[lowIndex].low) / data[lowIndex].low;

    // Calculate ADR at the high point to determine if this move is significant
    const adrAtHigh = calculateADR(data, highIndex);
    const requiredMove = adrAtHigh * config.minADRMultiple;

    // Check that the move duration is within the explosive window
    const moveDuration = highIndex - lowIndex;
    const withinExplosiveWindow = moveDuration <= config.priorMoveMaxWindow;
    const isSignificantMove = pct >= requiredMove;

    // Check move efficiency - ensure the move is clean and directional
    const moveEfficiency = calculateMoveEfficiency(data, lowIndex, highIndex);
    const hasGoodEfficiency = moveEfficiency >= config.moveEfficiencyThreshold;

    if (
      isSignificantMove &&
      highIndex > lowIndex &&
      withinExplosiveWindow &&
      hasGoodEfficiency
    ) {
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
  });
};

/**
 * Find a consolidation range with volatility contraction and breakout
 * with improved detection that favors recent price action
 * @param data Price data
 * @param priorMove Information about the prior move
 * @returns Consolidation range information if found
 */
const findConsolidationRange = (
  data: NonNullableDailyPricesObject[],
  priorMove: Setup["priorMove"]
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
  // Use cache to avoid recalculating the same consolidation range
  const cache = getCache();
  const cacheKey = `consolrange:${priorMove.highIndex}:${priorMove.lowIndex}`;

  return cache.getOrCalculate(cacheKey, () => {
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
      const adjustedStartIndex = priorMove.highIndex + offset;

      // Try different consolidation periods
      for (
        let period = config.consolidationMinDays;
        period <= config.consolidationMaxDays;
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

        // Calculate additional quality metrics
        const volumePattern = calculateVolumePattern(
          data,
          adjustedStartIndex,
          endIndex - 1
        );
        const priceActionQuality = calculatePriceActionQuality(
          data,
          adjustedStartIndex,
          endIndex - 1
        );

        // Calculate a combined quality score (0-100) with new factors
        const qualityScore = Math.round(
          (rangeQuality * 0.3 +
            volatilityContraction * 0.25 +
            densityScore * 0.2 +
            volumePattern * 0.15 +
            priceActionQuality * 0.1) *
            100
        );

        // Calculate the midpoint of the consolidation range
        const consolidationMidpoint = (upperBound + lowerBound) / 2;

        // Calculate the midpoint of the prior move
        const priorMoveLow = data[priorMove.lowIndex].low;
        const priorMoveHigh = data[priorMove.highIndex].high;
        const priorMoveMidpoint = (priorMoveHigh + priorMoveLow) / 2;

        // Check if the consolidation is above the midpoint of the prior move
        // This ensures we're capturing consolidations with momentum
        const isAbovePriorMoveMidpoint =
          consolidationMidpoint > priorMoveMidpoint;

        // Skip if the consolidation is below the midpoint of the prior move
        if (!isAbovePriorMoveMidpoint) continue;

        // Check if we have sufficient volatility contraction
        // For shorter consolidations, we're a bit more lenient with volatility contraction
        const minRequiredContraction =
          consolidationData.length <= 15
            ? config.minVolatilityContraction * 0.8
            : config.minVolatilityContraction;

        // Check overall quality thresholds
        const hasGoodPriceAction =
          priceActionQuality >= config.minPriceActionQuality;
        const hasGoodOverallQuality =
          qualityScore >= config.minOverallQualityScore;

        if (
          volatilityContraction >= minRequiredContraction &&
          hasGoodPriceAction &&
          hasGoodOverallQuality
        ) {
          // Check for breakout - we'll be more flexible with what constitutes a breakout
          // Either the close is above the upper bound OR the high is significantly above it
          const isCloseBreakout = data[endIndex]?.close > upperBound;
          const isHighBreakout = data[endIndex]?.high > upperBound * 1.01; // 1% above upper bound

          // Make sure the day before the breakout didn't close above the upper bound
          // This prevents false breakouts where the stock has already broken out
          // Note: It's okay if the stock gaps up from within the range
          const previousDay = data[endIndex - 1];
          const previousDayNotAboveRange = previousDay.close <= upperBound;

          if ((isCloseBreakout || isHighBreakout) && previousDayNotAboveRange) {
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
  });
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
  // Use cache to avoid recalculating the same exit points
  const cache = getCache();
  const cacheKey = `exit:${index}:${trade.entry.index}`;

  return cache.getOrCalculate(cacheKey, () => {
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
  });
};

const findSetups = (
  ticker: string,
  maxSetups: number = 0,
  generateCharts: boolean = true
) => {
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

  // Store potential setups by their consolidation signature to find the strongest prior move
  const potentialSetups: Map<
    string,
    {
      priorMove: Setup["priorMove"];
      consolidation: any;
      trade: any;
      endIndex: number;
      upperBound: number;
      lowerBound: number;
      volatilityContraction: number;
      qualityScore: number;
      trendline: any;
    }
  > = new Map();

  for (let i = 0; i < processedData.length; i++) {
    const priorMove = findPriorMove(processedData, i);

    if (priorMove) {
      const consolidationRange = findConsolidationRange(
        processedData,
        priorMove
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

        // Skip trades that are too extended from the prior high
        if (
          processedData[endIndex].close >
          processedData[priorMove.highIndex].high *
            (1 + config.maxExtensionFromHigh)
        ) {
          continue;
        }

        // Check that the stock hasn't retraced too much of the prior move
        const priorMoveHigh = processedData[priorMove.highIndex].high;
        const priorMoveLow = processedData[priorMove.lowIndex].low;
        const priorMoveSize = priorMoveHigh - priorMoveLow;
        const maxAllowedRetracement =
          priorMoveSize * config.maxPullbackFromHigh;
        const minAllowedLevel = priorMoveHigh - maxAllowedRetracement;

        let hasViolatedPullbackLimit = false;
        for (let i = priorMove.highIndex + 1; i <= endIndex; i++) {
          if (processedData[i].low < minAllowedLevel) {
            hasViolatedPullbackLimit = true;
            break;
          }
        }

        if (hasViolatedPullbackLimit) {
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
          volatilityContraction: volatilityContraction,
          qualityScore: qualityScore,
          rangeQuality: consolidationRange.rangeQuality,
          densityScore: consolidationRange.densityScore,
        };

        const price = processedData[endIndex].close;
        const dollarVolume = calculateDollarVolume(processedData, endIndex);

        // Skip trades with low dollar volume
        if (dollarVolume < config.minDollarVolume) {
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

        // Make sure the day before the breakout didn't close above the upper bound
        const previousDay = processedData[endIndex - 1];
        const previousDayNotAboveRange = previousDay.close <= upperBound;

        // Check for breakout - we'll be more flexible with what constitutes a breakout
        const isCloseBreakout = processedData[endIndex]?.close > upperBound;
        const isHighBreakout =
          processedData[endIndex]?.high > upperBound * 1.01; // 1% above upper bound

        // Only proceed if this is a valid breakout and the previous day was in range
        if ((isCloseBreakout || isHighBreakout) && previousDayNotAboveRange) {
          // Create a unique key for this consolidation/trade
          const setupKey = `${consolidation.startIndex}-${consolidation.endIndex}-${trade.entry.date}`;

          // Check if we already have a setup with this key
          const existingSetup = potentialSetups.get(setupKey);

          // If we don't have this setup yet, or the current one has a stronger prior move
          if (!existingSetup || priorMove.pct > existingSetup.priorMove.pct) {
            // Store this setup as the best one for this consolidation/trade
            potentialSetups.set(setupKey, {
              priorMove,
              consolidation,
              trade,
              endIndex,
              upperBound,
              lowerBound,
              volatilityContraction,
              qualityScore,
              trendline,
            });
          }
        }
      }
    }
  }

  // Now process all the potential setups we've collected
  // This ensures we only keep the setup with the strongest prior move for each consolidation
  const finalSetups: Setup[] = [];

  // Process each potential setup (limited by maxSetups if specified)
  let processedCount = 0;
  for (const [_, setupData] of potentialSetups.entries()) {
    // If we've reached the maximum number of setups, stop processing
    if (maxSetups > 0 && processedCount >= maxSetups) break;

    const {
      priorMove,
      consolidation,
      trade,
      endIndex,
      upperBound,
      lowerBound,
      volatilityContraction,
      qualityScore,
      trendline,
    } = setupData;

    // Process the exit and highest price
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

    // Create the final setup
    const setup: Setup = {
      code,
      priorMove,
      consolidation,
      trade: completeTrade,
    };

    // Add to final setups
    finalSetups.push(setup);
    processedCount++;

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
        const filename = `${setup.code}-${setup.trade.entry.date}-${setup.trade.exit.date}.png`;
        sharp(chartBuffer).png().toFile(`./charts/${filename}`);
      }
    }
  }

  // Add the final setups to the database
  addTrades(finalSetups);
  console.log(
    `${finalSetups.length > 0 ? finalSetups[0].code : "No setups found"}: ${finalSetups.length}`
  );
  return finalSetups.length;
};

export { findSetups };
