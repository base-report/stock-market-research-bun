import type { NonNullableDailyPricesObject } from "../schemas/HistoricalPrices";
import type { ImprovedSetup } from "../schemas/ImprovedSetup";

import { DateTime } from "luxon";
import sharp from "sharp";
import { getHistoricalPrices } from "./historicalPrices";
import { generateChart } from "../chart/svg";
import { processData, fitLine } from "../util/chart";
import { addImprovedTrades } from "../db/improvedTrade";
import {
  calculateSMA,
  calculateADR,
  calculateDollarVolume,
} from "../util/calc";

// Momentum Breakout Configuration
// Focus: Finding unique breakout setups for follow-through analysis
const config = {
  // Prior move criteria - establish significant base building
  priorMoveMinDays: 3, // Minimum days for a significant prior move
  priorMoveMaxDays: 60, // Maximum days to search for prior moves
  priorMoveMaxWindow: 20, // Maximum duration for explosive move itself (concentrated power)
  minPriorMoveStrength: 5, // Minimum ADR multiple for prior move significance

  // Base building criteria - look for tight consolidation after prior move
  baseMinDays: 5, // Minimum consolidation days for valid base
  baseMaxDays: 20, // Maximum consolidation days to maintain momentum
  maxBaseDepth: 0.5, // Maximum retracement from prior move high (50%)

  // Breakout criteria - clear breakout confirmation
  minBreakoutStrength: 0.5, // Minimum ADR multiple for breakout day
  maxBreakoutExtension: 3.0, // Maximum ADR multiple extension to avoid late entries

  // Consolidation quality filters - ensure true sideways movement
  maxNetMovement: 0.03, // Max net start-to-end movement (lower = stricter sideways requirement)
  maxHalfTrend: 0.03, // Max trend between first/second half (lower = less internal trending)
  minFlatness: 0.87, // Min flatness score 0-1 (higher = more consistent price action)

  // Quality filters - ensure tradeable setups (no minPrice due to split adjustments)
  minDollarVolume: 10000000, // Minimum daily dollar volume for institutional liquidity
  maxVolatility: 0.3, // Maximum daily volatility (30% ADR) to avoid erratic stocks
};

/**
 * Find prior move for momentum breakout setup
 * Looks for significant upward move that establishes momentum
 */
const findPriorMove = (
  data: NonNullableDailyPricesObject[],
  index: number
):
  | {
      lowIndex: number;
      highIndex: number;
      strength: number;
      low: number;
      high: number;
    }
  | undefined => {
  const startIndex = Math.max(0, index - config.priorMoveMaxDays);

  let bestMove = undefined;
  let bestStrength = 0;

  // Look for the strongest move in the lookback period
  for (
    let lowIdx = startIndex;
    lowIdx < index - config.priorMoveMinDays;
    lowIdx++
  ) {
    for (
      let highIdx = lowIdx + config.priorMoveMinDays;
      highIdx < index;
      highIdx++
    ) {
      const moveDuration = highIdx - lowIdx;
      if (moveDuration > config.priorMoveMaxDays) break;

      // Check if the move is within the explosive window for concentrated power
      if (moveDuration > config.priorMoveMaxWindow) continue;

      const low = data[lowIdx].low;
      const high = data[highIdx].high;
      const movePercent = (high - low) / low;

      // Calculate ADR-relative strength
      const adr = calculateADR(data, highIdx);
      const adrStrength = movePercent / adr;

      if (
        adrStrength >= config.minPriorMoveStrength &&
        adrStrength > bestStrength
      ) {
        bestMove = {
          lowIndex: lowIdx,
          highIndex: highIdx,
          strength: adrStrength,
          low,
          high,
        };
        bestStrength = adrStrength;
      }
    }
  }

  return bestMove;
};

/**
 * Find base/consolidation after prior move
 * Looks for tight consolidation that forms a launchpad
 */
const findBase = (
  data: NonNullableDailyPricesObject[],
  priorMove: any,
  index: number
):
  | {
      startIndex: number;
      endIndex: number;
      high: number;
      low: number;
      tightness: number;
      flatness: number;
      retracement: number;
    }
  | undefined => {
  const baseStartIndex = priorMove.highIndex + 1;
  const baseEndIndex = index;
  const baseDuration = baseEndIndex - baseStartIndex;

  // Check base duration requirements
  if (baseDuration < config.baseMinDays || baseDuration > config.baseMaxDays) {
    return undefined;
  }

  // Calculate base statistics
  const baseData = data.slice(baseStartIndex, baseEndIndex + 1);
  const baseHigh = Math.max(...baseData.map((d) => d.high));
  const baseLow = Math.min(...baseData.map((d) => d.low));
  const baseRange = baseHigh - baseLow;

  // Check retracement from prior move high
  const retracement =
    (priorMove.high - baseLow) / (priorMove.high - priorMove.low);
  if (retracement > config.maxBaseDepth) {
    return undefined;
  }

  // Improved consolidation validation: check if it's actually sideways movement
  const startPrice = baseData[0].close;
  const endPrice = baseData[baseData.length - 1].close;
  const netMove = Math.abs(endPrice - startPrice) / startPrice;

  // Reject if the "consolidation" has too much net directional movement
  if (netMove > config.maxNetMovement) {
    return undefined;
  }

  // Check for excessive trending within the base
  const midIndex = Math.floor(baseData.length / 2);
  const firstHalfHigh = Math.max(
    ...baseData.slice(0, midIndex).map((d) => d.high)
  );
  const secondHalfHigh = Math.max(
    ...baseData.slice(midIndex).map((d) => d.high)
  );
  const firstHalfLow = Math.min(
    ...baseData.slice(0, midIndex).map((d) => d.low)
  );
  const secondHalfLow = Math.min(...baseData.slice(midIndex).map((d) => d.low));

  // If second half is consistently much higher/lower than first half, it's trending
  const avgFirstHalf = (firstHalfHigh + firstHalfLow) / 2;
  const avgSecondHalf = (secondHalfHigh + secondHalfLow) / 2;
  const halfTrend = Math.abs(avgSecondHalf - avgFirstHalf) / avgFirstHalf;

  if (halfTrend > config.maxHalfTrend) {
    return undefined;
  }

  // Calculate "flatness" score - how much of the range is actual consolidation vs trending
  const closes = baseData.map((d) => d.close);
  const avgClose = closes.reduce((sum, c) => sum + c, 0) / closes.length;
  const deviations = closes.map((c) => Math.abs(c - avgClose) / avgClose);
  const avgDeviation =
    deviations.reduce((sum, d) => sum + d, 0) / deviations.length;
  const flatnessScore = 1 - avgDeviation * 10; // Scale to 0-1 range

  if (flatnessScore < config.minFlatness) {
    return undefined;
  }

  // Calculate base tightness (smaller range = tighter base)
  const atr = calculateADR(data, index) * data[index].close;
  const tightness = 1 - baseRange / (atr * 2); // Normalize against 2x ATR

  return {
    startIndex: baseStartIndex,
    endIndex: baseEndIndex,
    high: baseHigh,
    low: baseLow,
    tightness: Math.max(0, tightness),
    flatness: flatnessScore,
    retracement: retracement,
  };
};

/**
 * Check for momentum breakout
 * Validates breakout strength and extension
 */
const checkMomentumBreakout = (
  data: NonNullableDailyPricesObject[],
  base: any,
  breakoutIndex: number
): boolean => {
  // Check breakout strength
  const adr = calculateADR(data, breakoutIndex);
  const dailyMove =
    (data[breakoutIndex].close - data[breakoutIndex - 1].close) /
    data[breakoutIndex - 1].close;
  const strengthRatio = dailyMove / adr;

  if (strengthRatio < config.minBreakoutStrength) {
    return false;
  }

  // Check if breaking above base resistance
  if (data[breakoutIndex].close <= base.high) {
    return false;
  }

  // Check extension (not too far above resistance) - using ADR multiples
  const extension = (data[breakoutIndex].close - base.high) / base.high;
  const extensionRatio = extension / adr;
  if (extensionRatio > config.maxBreakoutExtension) {
    return false;
  }

  return true;
};

/**
 * Find exit using simple momentum rules
 */
const findExit = (
  data: NonNullableDailyPricesObject[],
  entryIndex: number
):
  | {
      exit: ImprovedSetup["trade"]["exit"];
      highestPrice: ImprovedSetup["trade"]["highestPrice"];
    }
  | undefined => {
  let highestPrice = {
    index: entryIndex,
    price: data[entryIndex].high,
    days: 0,
    date: DateTime.fromJSDate(data[entryIndex].date).toFormat("yyyy-MM-dd"),
  };

  // Look for exit from the day after entry
  for (let i = entryIndex + 1; i < data.length; i++) {
    // Update highest price
    if (data[i].high > highestPrice.price) {
      highestPrice = {
        index: i,
        price: data[i].high,
        days: i - entryIndex,
        date: DateTime.fromJSDate(data[i].date).toFormat("yyyy-MM-dd"),
      };
    }

    const sma10 = calculateSMA(data, i, 10);

    // Exit on close below 10-day SMA (momentum breakdown)
    if (data[i].close < sma10) {
      return {
        exit: {
          price: data[i].close,
          index: i,
          days: i - entryIndex,
          reason: "momentum breakdown (SMA10)",
          date: DateTime.fromJSDate(data[i].date).toFormat("yyyy-MM-dd"),
        },
        highestPrice,
      };
    }

    // Exit on large single-day decline
    const dailyDecline =
      (data[i - 1].close - data[i].close) / data[i - 1].close;
    const adr = calculateADR(data, i);
    if (dailyDecline > adr * 2.5) {
      return {
        exit: {
          price: data[i].close,
          index: i,
          days: i - entryIndex,
          reason: "large decline",
          date: DateTime.fromJSDate(data[i].date).toFormat("yyyy-MM-dd"),
        },
        highestPrice,
      };
    }
  }

  return undefined;
};

/**
 * Main function to find momentum breakout setups
 * @param ticker Stock symbol to analyze
 * @param maxSetups Maximum number of setups to find (0 = unlimited)
 * @param generateCharts Whether to generate chart visualizations
 * @returns Number of setups found
 */
const findSetupsByAuggie = (
  ticker: string,
  maxSetups: number = 0,
  generateCharts: boolean = true
): number => {
  const result = getHistoricalPrices(ticker);
  if (!result) return 0;

  const { code, daily } = result;
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(daily);
  const historicalPrices = JSON.parse(jsonString);
  const processedData: NonNullableDailyPricesObject[] =
    processData(historicalPrices);

  const finalSetups: ImprovedSetup[] = [];
  let setupsFound = 0;

  console.log(
    `Scanning ${processedData.length} data points for momentum breakout patterns...`
  );

  // Scan through data looking for momentum breakout patterns
  for (
    let i = config.priorMoveMaxDays + config.baseMaxDays;
    i < processedData.length - 10;
    i++
  ) {
    // Stop if we've reached max setups
    if (maxSetups > 0 && setupsFound >= maxSetups) break;

    // Basic quality filters first
    const dollarVolume = calculateDollarVolume(processedData, i);
    if (dollarVolume < config.minDollarVolume) continue;

    const adr = calculateADR(processedData, i);
    if (adr > config.maxVolatility) continue;

    // Find prior move
    const priorMove = findPriorMove(processedData, i);
    if (!priorMove) continue;

    // Find base after prior move (base should end BEFORE current index)
    const base = findBase(processedData, priorMove, i - 1);
    if (!base) continue;

    // Check for momentum breakout (current index breaks above completed base)
    if (!checkMomentumBreakout(processedData, base, i)) continue;

    // Found valid momentum breakout setup

    // Find exit point
    const exitResult = findExit(processedData, i);
    if (!exitResult) continue;

    const { exit, highestPrice } = exitResult;

    // Create setup object
    const priorMoveSetup: ImprovedSetup["priorMove"] = {
      lowIndex: priorMove.lowIndex,
      highIndex: priorMove.highIndex,
      pct: (priorMove.high - priorMove.low) / priorMove.low,
      lowDate: DateTime.fromJSDate(
        processedData[priorMove.lowIndex].date
      ).toFormat("yyyy-MM-dd"),
      highDate: DateTime.fromJSDate(
        processedData[priorMove.highIndex].date
      ).toFormat("yyyy-MM-dd"),
    };

    // Create consolidation from the base
    const trendline = fitLine(
      processedData.slice(base.startIndex, base.endIndex + 1),
      (d) => d.close
    ) || { slope: 0, intercept: 0 };

    const consolidation: ImprovedSetup["consolidation"] = {
      slope: trendline.slope,
      days: base.endIndex - base.startIndex,
      startIndex: base.startIndex,
      endIndex: base.endIndex,
      startDate: DateTime.fromJSDate(
        processedData[base.startIndex].date
      ).toFormat("yyyy-MM-dd"),
      endDate: DateTime.fromJSDate(processedData[base.endIndex].date).toFormat(
        "yyyy-MM-dd"
      ),
      flatness: base.flatness,
      retracement: base.retracement,
    };

    // Create trade object
    const trade: ImprovedSetup["trade"] = {
      entry: {
        price: processedData[i].close,
        index: i,
        trendlineBreakPrice: base.high,
        adr,
        dollarVolume,
        date: DateTime.fromJSDate(processedData[i].date).toFormat("yyyy-MM-dd"),
      },
      exit,
      highestPrice,
    };

    // Create final setup
    const setup: ImprovedSetup = {
      code,
      priorMove: priorMoveSetup,
      consolidation,
      trade,
    };

    finalSetups.push(setup);
    setupsFound++;

    // Generate chart if requested
    if (generateCharts) {
      let chartStartIndex = setup.priorMove.lowIndex - 10;
      if (chartStartIndex < 0) chartStartIndex = 0;

      let chartEndIndex = setup.trade.exit.index + 10;
      if (chartEndIndex >= processedData.length) {
        chartEndIndex = processedData.length - 1;
      }

      const chartData = processedData.slice(chartStartIndex, chartEndIndex);

      // Adjust indices for chart
      const priorMoveStartIndex = setup.priorMove.lowIndex - chartStartIndex;
      const priorMoveEndIndex = setup.priorMove.highIndex - chartStartIndex;
      const consolidationStartIndex =
        setup.consolidation.startIndex - chartStartIndex;
      // Extend consolidation to include one more candle before entry
      const consolidationEndIndex =
        setup.consolidation.endIndex + 1 - chartStartIndex;
      const entryIndex = setup.trade.entry.index - chartStartIndex;
      const exitIndex = setup.trade.exit.index - chartStartIndex;

      // Create consolidation range for chart
      const consolidationRange = {
        upperBound: base.high,
        lowerBound: base.low,
        flatness: base.flatness,
        retracement: base.retracement,
        priorMovePct: (priorMove.high - priorMove.low) / priorMove.low,
      };

      // Generate chart
      const chart = generateChart(
        chartData,
        priorMoveStartIndex,
        priorMoveEndIndex,
        consolidationStartIndex,
        consolidationEndIndex,
        entryIndex,
        exitIndex,
        trendline,
        consolidationRange
      );

      if (chart) {
        const chartBuffer = Buffer.from(chart);
        const filename = `${setup.code}-${setup.trade.entry.date}-${setup.trade.exit.date}.png`;
        sharp(chartBuffer).png().toFile(`./charts/${filename}`);
      }
    }
  }

  // Add setups to database
  addImprovedTrades(finalSetups);

  console.log(
    `${finalSetups.length > 0 ? finalSetups[0].code : "No setups found"}: ${finalSetups.length} (Momentum Breakout)`
  );

  return finalSetups.length;
};

export {
  findSetupsByAuggie,
  findPriorMove,
  findBase,
  checkMomentumBreakout,
  findExit,
  config as auggieConfig,
};

// Helper function to update algorithm parameters for experimentation
// Usage example:
// import { updateAlgorithmParams } from './findSetupsByAuggie';
// updateAlgorithmParams({
//   // Consolidation quality
//   maxNetMovement: 0.05,     // Stricter: only 5% net movement allowed
//   maxHalfTrend: 0.03,       // Stricter: only 3% trend between halves
//   minFlatness: 0.8,         // Stricter: require 80% flatness score
//   // Prior move explosiveness
//   priorMoveMaxWindow: 8,    // Require moves to happen within 8 days (more explosive)
//   minPriorMoveStrength: 3.0 // Require stronger moves (3x ADR)
// });
export const updateAlgorithmParams = (params: {
  maxNetMovement?: number;
  maxHalfTrend?: number;
  minFlatness?: number;
  priorMoveMaxWindow?: number;
  minPriorMoveStrength?: number;
}) => {
  if (params.maxNetMovement !== undefined)
    config.maxNetMovement = params.maxNetMovement;
  if (params.maxHalfTrend !== undefined)
    config.maxHalfTrend = params.maxHalfTrend;
  if (params.minFlatness !== undefined) config.minFlatness = params.minFlatness;
  if (params.priorMoveMaxWindow !== undefined)
    config.priorMoveMaxWindow = params.priorMoveMaxWindow;
  if (params.minPriorMoveStrength !== undefined)
    config.minPriorMoveStrength = params.minPriorMoveStrength;
};

// Legacy function name for backward compatibility
export const updateConsolidationParams = updateAlgorithmParams;
