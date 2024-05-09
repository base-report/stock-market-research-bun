import type {
  NonNullableDailyPrices,
  NonNullableDailyPricesObject,
} from "../schemas/HistoricalPrices";
import type { Trendline } from "../schemas/Trendline";

import { DateTime } from "luxon";

const processData = (
  data: NonNullableDailyPrices[],
): NonNullableDailyPricesObject[] =>
  data.map((d) => ({
    date: DateTime.fromMillis(d[5]).toJSDate(),
    open: d[0],
    high: d[1],
    low: d[2],
    close: d[3],
    volume: d[4],
  }));

const calculateMovingAverage = (
  data: NonNullableDailyPricesObject[],
  numberOfDays: number,
): ({ date: Date; average: number } | null)[] =>
  data
    .map((entry, index, array) => {
      if (index < numberOfDays - 1) {
        return null; // not enough data points to create the average
      }
      let sum = 0;
      for (let i = 0; i < numberOfDays; i++) {
        sum += array[index - i].close;
      }
      return {
        date: entry.date,
        average: sum / numberOfDays,
      };
    })
    .filter((entry) => entry !== null) as { date: Date; average: number }[];

const findLongestUptrend = (data: NonNullableDailyPricesObject[]) => {
  const ma10 = calculateMovingAverage(data, 10);

  let longestUptrend: NonNullableDailyPricesObject[] = [];
  let currentUptrend: NonNullableDailyPricesObject[] = [];

  for (let i = 0; i < ma10.length; i++) {
    if (data[i + 9].close > ma10[i].average) {
      // Check if closing price is above MA10
      currentUptrend.push({
        date: ma10[i].date,
        open: data[i + 9].open,
        high: data[i + 9].high,
        low: data[i + 9].low,
        close: data[i + 9].close,
        volume: data[i + 9].volume,
        ma10: ma10[i].average,
      });
    } else {
      if (currentUptrend.length > longestUptrend.length) {
        longestUptrend = currentUptrend;
      }
      currentUptrend = [];
    }
  }

  // Check at the end to capture any uptrend that might be the longest and hasn't been reset
  if (currentUptrend.length > longestUptrend.length) {
    longestUptrend = currentUptrend;
  }

  return longestUptrend;
};

const formatVolume = (d: number): string => {
  if (d >= 1e9) {
    return (d / 1e9).toFixed(0) + "B"; // Billions
  } else if (d >= 1e6) {
    return (d / 1e6).toFixed(0) + "M"; // Millions
  } else if (d >= 1e3) {
    return (d / 1e3).toFixed(0) + "K"; // Thousands
  }
  return d.toFixed(0); // Values less than 1000
};

const fitLine = (
  data: NonNullableDailyPricesObject[],
  keyFunc: (d: NonNullableDailyPricesObject) => number,
): Trendline | null => {
  const calculateLine = (
    p1: { index: number } & NonNullableDailyPricesObject,
    p2: { index: number } & NonNullableDailyPricesObject,
  ): Trendline => {
    const slope = (keyFunc(p2) - keyFunc(p1)) / (p2.index - p1.index);
    const intercept = keyFunc(p1) - slope * p1.index;
    return { slope, intercept };
  };

  const countInliers = (
    line: Trendline,
    data: NonNullableDailyPricesObject[],
    threshold: number,
  ): number => {
    let inlierCount = 0;
    data.forEach((point, index) => {
      const expectedY = line.slope * index + line.intercept;
      if (Math.abs(keyFunc(point) - expectedY) <= threshold) {
        inlierCount++;
      }
    });
    return inlierCount;
  };

  const stdDev = Math.sqrt(
    data.reduce(
      (acc, d) =>
        acc +
        Math.pow(
          keyFunc(d) - data.reduce((a, b) => a + keyFunc(b), 0) / data.length,
          2,
        ),
      0,
    ) / data.length,
  );

  let bestLine: Trendline | null = null;
  let bestInlierCount = 0;
  const dynamicThreshold = stdDev * 0.5; // Threshold based on half the standard deviation

  for (let i = 0; i < 300; i++) {
    let sampleIndices = [
      Math.floor(Math.random() * data.length),
      Math.floor(Math.random() * data.length),
    ];
    while (sampleIndices[0] === sampleIndices[1]) {
      sampleIndices[1] = Math.floor(Math.random() * data.length);
    }

    const line = calculateLine(
      { index: sampleIndices[0], ...data[sampleIndices[0]] },
      { index: sampleIndices[1], ...data[sampleIndices[1]] },
    );
    const inlierCount = countInliers(line, data, dynamicThreshold);

    if (inlierCount > bestInlierCount) {
      bestLine = line;
      bestInlierCount = inlierCount;
    }
  }
  return bestLine;
};

export {
  processData,
  calculateMovingAverage,
  findLongestUptrend,
  formatVolume,
  fitLine,
};
