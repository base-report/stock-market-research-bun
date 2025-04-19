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
const priorMoveMinPercentage = 0.3;
const consolidationMinDays = 10;
const consolidationMaxDays = 40;
const minVolatilityContraction = 0.3; // 30% reduction in volatility

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

  for (let i = startIndex; i < index; i++) {
    if (data[i].high > data[highIndex].high) {
      highIndex = i;
    }
    if (data[i].low < data[lowIndex].low) {
      lowIndex = i;
    }
  }

  let newHighInNext3Days = true;

  while (newHighInNext3Days) {
    newHighInNext3Days = false;
    for (let i = highIndex + 1; i < highIndex + 4; i++) {
      if (data[i]?.high > data[highIndex]?.high) {
        highIndex = i;
        newHighInNext3Days = true;
      }
    }
  }

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
};

/**
 * Find a consolidation range with volatility contraction and breakout
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
  for (
    let period = consolidationMinDays;
    period <= consolidationMaxDays;
    period++
  ) {
    const endIndex = priorMoveHighIndex + period;
    if (endIndex >= data.length) break;

    const consolidationData = data.slice(priorMoveHighIndex, endIndex);

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
      priorMoveHighIndex,
      endIndex - 1
    );

    // Calculate a combined quality score (0-100)
    const qualityScore = Math.round(
      (rangeQuality * 0.6 + volatilityContraction * 0.4) * 100
    );

    // Check if we have sufficient volatility contraction
    if (volatilityContraction >= minVolatilityContraction) {
      // Check for breakout
      if (data[endIndex]?.close > upperBound) {
        return {
          upperBound,
          lowerBound,
          startIndex: priorMoveHighIndex,
          endIndex,
          volatilityContraction,
          rangeQuality,
          densityScore,
          qualityScore,
          breakoutPrice: upperBound,
        };
      }
    }
  }

  return undefined;
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
        if (dollarVolume < 1000000) {
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
