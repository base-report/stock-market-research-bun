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

const calculateScalingFactor = (
  data: NonNullableDailyPricesObject[],
): number => {
  const xRange = data.length;
  const yRange =
    Math.max(...data.map((d) => d.high)) - Math.min(...data.map((d) => d.low));
  return yRange / xRange;
};

// use the Theil-Sen estimator to fit a trendline
const fitLine = (
  data: NonNullableDailyPricesObject[],
  keyFunc: (d: NonNullableDailyPricesObject) => number,
): Trendline | null => {
  if (data.length < 2) {
    return null;
  }

  const slopes: number[] = [];

  for (let i = 0; i < data.length - 1; i++) {
    for (let j = i + 1; j < data.length; j++) {
      const slope = (keyFunc(data[j]) - keyFunc(data[i])) / (j - i);
      slopes.push(slope);
    }
  }

  const medianSlope = (): number => {
    const sortedSlopes = slopes.slice().sort((a, b) => a - b);
    const middle = Math.floor(sortedSlopes.length / 2);
    if (sortedSlopes.length % 2 === 0) {
      return (sortedSlopes[middle - 1] + sortedSlopes[middle]) / 2;
    } else {
      return sortedSlopes[middle];
    }
  };

  const slope = medianSlope();
  const intercepts: number[] = data.map(
    (point, index) => keyFunc(point) - slope * index,
  );

  const medianIntercept = (): number => {
    const sortedIntercepts = intercepts.slice().sort((a, b) => a - b);
    const middle = Math.floor(sortedIntercepts.length / 2);
    if (sortedIntercepts.length % 2 === 0) {
      return (sortedIntercepts[middle - 1] + sortedIntercepts[middle]) / 2;
    } else {
      return sortedIntercepts[middle];
    }
  };

  const intercept = medianIntercept();

  return { slope, intercept };
};

const slopeToAngle = (slope: number): number =>
  Math.atan(slope) * (180 / Math.PI);

export {
  processData,
  calculateMovingAverage,
  findLongestUptrend,
  formatVolume,
  fitLine,
  slopeToAngle,
  calculateScalingFactor,
};
