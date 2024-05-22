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

const calculateSMA = (
  data: NonNullableDailyPricesObject[],
  index: number,
  period: number,
): number => {
  if (index < period) return Infinity; // handle edge case
  let sum = 0;
  for (let k = index - period + 1; k <= index; k++) {
    sum += data[k].close;
  }
  return sum / period;
};

const calculateADR = (
  data: NonNullableDailyPricesObject[],
  endIndex: number,
) => {
  const last20Days = data.slice(endIndex - 20, endIndex);
  const sum = last20Days.reduce((acc, d) => acc + d.high / d.low, 0);
  return sum / last20Days.length - 1;
};

const calculateDollarVolume = (
  data: NonNullableDailyPricesObject[],
  endIndex: number,
) => {
  const last20Days = data.slice(endIndex - 20, endIndex);
  return last20Days.reduce((acc, d) => acc + d.close * d.volume, 0) / 20;
};

const priorMoveMaxDays = 50;
const priorMoveMinPercentage = 0.3;
const trendlineMaxSlope = 0.1;
const trendlineMinDays = 10;
const trendlineMaxDays = 40;

const findPriorMove = (
  data: NonNullableDailyPricesObject[],
  index: number,
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
      "yyyy-MM-dd",
    );
    const lowDate = DateTime.fromJSDate(data[lowIndex].date).toFormat(
      "yyyy-MM-dd",
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

const findTrendlineWithBreakoutIndex = (
  data: NonNullableDailyPricesObject[],
  priorMoveHighIndex: number,
):
  | { trendline: Trendline; index: number; trendlineBreakPrice: number }
  | undefined => {
  let trendline: Trendline | undefined;

  for (let offset = trendlineMinDays; offset <= trendlineMaxDays; offset++) {
    const endIndex = priorMoveHighIndex + offset - 1;
    if (endIndex >= data.length) break;

    const trendlineData = data.slice(priorMoveHighIndex, endIndex);
    const trendlineFit = fitLine(trendlineData, (d) => d.high);
    if (!trendlineFit) continue;
    const { slope, intercept } = trendlineFit;

    const breakoutPrice = slope * (endIndex - priorMoveHighIndex) + intercept;
    const isBreakout = data[endIndex]?.close > breakoutPrice;

    const withinMaxSlope = Math.abs(slope) <= trendlineMaxSlope;

    if (withinMaxSlope && isBreakout) {
      trendline = { slope, intercept };
      return { trendline, index: endIndex, trendlineBreakPrice: breakoutPrice };
    }
  }

  return undefined;
};

const findHighestPriceAndExit = (
  data: NonNullableDailyPricesObject[],
  trade: Setup["trade"],
  index: number,
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

const findSetups = (_code: string) => {
  const { code, daily } = getHistoricalPrices(_code);
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(daily);
  const historicalPrices: HistoricalPrices = JSON.parse(jsonString);
  const processedData: NonNullableDailyPricesObject[] =
    processData(historicalPrices);

  const setups: Setup[] = [];

  for (let i = 0; i < processedData.length; i++) {
    const priorMove = findPriorMove(processedData, i);

    if (priorMove) {
      const res = findTrendlineWithBreakoutIndex(
        processedData,
        priorMove.highIndex,
      );
      if (res) {
        const { trendline, index, trendlineBreakPrice } = res;

        const adr = calculateADR(processedData, index);

        // Skip trades that are too extended
        if (
          processedData[index].close >
          processedData[priorMove.highIndex].high * (1 + adr)
        ) {
          continue;
        }

        const consolidation = {
          slope: trendline.slope,
          days: index - priorMove.highIndex,
          startIndex: priorMove.highIndex,
          endIndex: index,
          startDate: DateTime.fromJSDate(
            processedData[priorMove.highIndex].date,
          ).toFormat("yyyy-MM-dd"),
          endDate: DateTime.fromJSDate(processedData[index].date).toFormat(
            "yyyy-MM-dd",
          ),
        };

        if (consolidation) {
          const price = processedData[index].close;
          if (price <= trendlineBreakPrice) {
            continue;
          }

          const dollarVolume = calculateDollarVolume(processedData, index);

          // Skip trades with low dollar volume
          if (dollarVolume < 1000000) {
            continue;
          }

          const trade = {
            entry: {
              price,
              index,
              trendlineBreakPrice,
              adr,
              dollarVolume,
              date: DateTime.fromJSDate(processedData[index].date).toFormat(
                "yyyy-MM-dd",
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
            trade.entry.trendlineBreakPrice = trendlineBreakPrice;

            const { exit, highestPrice } = findHighestPriceAndExit(
              processedData,
              trade,
              index,
            );

            trade.exit = exit;
            trade.highestPrice = highestPrice;

            const setup: Setup = {
              code,
              priorMove,
              consolidation,
              trade,
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
            let priorMoveStartIndex =
              setup.priorMove.lowIndex - chartStartIndex;
            if (priorMoveStartIndex < 0) {
              priorMoveStartIndex = 0;
            }
            const priorMoveEndIndex =
              setup.priorMove.highIndex - chartStartIndex;
            const consolidationStartIndex =
              setup.consolidation.startIndex - chartStartIndex;
            const consolidationEndIndex =
              setup.consolidation.endIndex - chartStartIndex;
            const entryIndex = setup.trade.entry.index - chartStartIndex;
            let exitIndex = setup.trade.exit?.index - chartStartIndex;

            if (!exitIndex) {
              exitIndex = chartEndIndex - chartStartIndex;
            }

            const chart = generateChart(
              processedData.slice(chartStartIndex, chartEndIndex),
              priorMoveStartIndex,
              priorMoveEndIndex,
              consolidationStartIndex,
              consolidationEndIndex,
              entryIndex,
              exitIndex,
              trendline,
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
  }
  addTrades(setups);
  console.log(`${code}: ${setups.length}`);
};

export { findSetups };
