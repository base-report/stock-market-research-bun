import type { HistoricalPrices } from "../schemas/HistoricalPrices";
import type { Trendline } from "../schemas/Trendline";
import type { NonNullableDailyPricesObject } from "../schemas/HistoricalPrices";

import { DateTime } from "luxon";
import { getHistoricalPrices } from "./historicalPrices";
import { generateChart } from "../chart/svg";
import { processData, fitLine } from "../util/chart";
import sharp from "sharp";

interface Trade {
  entry: {
    price: number;
    index: number;
    trendlineBreakPrice: number;
    adr: number;
    dollarVolume: number;
  };
  exit?: {
    price: number;
    index: number;
    reason: string;
    days?: number;
  };
  highestPrice?: {
    index: number;
    price: number;
    days: number;
  };
}

interface Setup {
  priorMove: {
    lowIndex: number;
    highIndex: number;
    percentage: number;
  };
  consolidation?: {
    slope: number;
    days: number;
    startIndex: number;
    endIndex: number;
  };
  trade?: Trade;
}

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
const trendlineMaxSlope = 0.15;
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

  const percentage =
    (data[highIndex].high - data[lowIndex].low) / data[lowIndex].low;

  const withinMaxDays = highIndex - lowIndex <= priorMoveMaxDays;
  if (
    percentage >= priorMoveMinPercentage &&
    highIndex > lowIndex &&
    withinMaxDays
  ) {
    return {
      highIndex,
      lowIndex,
      percentage,
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
  trade: Trade,
  index: number,
): { exit: Trade["exit"]; highestPrice: Trade["highestPrice"] } | undefined => {
  let highestPrice = {
    index: trade.entry.index,
    price: trade.entry.price,
    days: 1,
  };

  let exit: Trade["exit"] | undefined;

  const entryLOD = data[trade.entry.index].low;

  // Start counting from the day after entry
  for (let i = index + 1; i < data.length; i++) {
    if (data[i].high > highestPrice.price) {
      highestPrice = {
        index: i,
        price: data[i].high,
        days: i - trade.entry.index,
      };
    }
    if (data[i].close < entryLOD) {
      exit = {
        price: data[i].close,
        index: i,
        days: i - trade.entry.index,
        reason: "low of the day",
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
      };
      break;
    }
  }

  return { exit, highestPrice };
};

const findSetups = () => {
  const { code, daily } = getHistoricalPrices("AMD");
  console.log(daily.length);
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
            const priorMoveStartIndex =
              setup.priorMove.lowIndex - chartStartIndex;
            const priorMoveEndIndex =
              setup.priorMove.highIndex - chartStartIndex;
            const consolidationStartIndex =
              setup.consolidation.startIndex - chartStartIndex;
            const consolidationEndIndex =
              setup.consolidation.endIndex - chartStartIndex;
            const entryIndex = setup.trade.entry.index - chartStartIndex;
            const exitIndex = setup.trade.exit?.index - chartStartIndex;

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
            const chartBuffer = Buffer.from(chart);
            const entryDate = DateTime.fromJSDate(
              processedData[setup.trade.entry.index].date,
            ).toFormat("yyyy-MM-dd");
            const exitDate = DateTime.fromJSDate(
              processedData[setup.trade.exit?.index].date,
            ).toFormat("yyyy-MM-dd");
            const filename = `${code}-${entryDate}-${exitDate}.png`;
            sharp(chartBuffer).png().toFile(`./charts/${filename}`);
            console.log("Chart saved to", filename);
          }
        }
      }
    }
  }
  console.log(setups.length);
};

export { findSetups };
