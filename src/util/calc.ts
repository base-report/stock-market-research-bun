import type { NonNullableDailyPricesObject } from "../schemas/HistoricalPrices";

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

export { calculateSMA, calculateADR, calculateDollarVolume };
