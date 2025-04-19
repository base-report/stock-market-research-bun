import type { NonNullableDailyPricesObject } from "../schemas/HistoricalPrices";

/**
 * Calculate the average true range (ATR) for a given period
 * @param data Price data
 * @param period Number of days to calculate ATR for
 * @param startIndex Starting index
 * @returns The ATR value
 */
const calculateATR = (
  data: NonNullableDailyPricesObject[],
  period: number,
  startIndex: number
): number => {
  if (startIndex < period) return 0;
  
  let sum = 0;
  for (let i = 0; i < period; i++) {
    const currentIndex = startIndex - i;
    const currentDay = data[currentIndex];
    const previousDay = data[currentIndex - 1];
    
    // True Range is the greatest of:
    // 1. Current High - Current Low
    // 2. |Current High - Previous Close|
    // 3. |Current Low - Previous Close|
    const tr1 = currentDay.high - currentDay.low;
    const tr2 = Math.abs(currentDay.high - previousDay.close);
    const tr3 = Math.abs(currentDay.low - previousDay.close);
    
    const trueRange = Math.max(tr1, tr2, tr3);
    sum += trueRange;
  }
  
  return sum / period;
};

/**
 * Calculate the volatility contraction during a consolidation period
 * @param data Price data
 * @param startIndex Start of consolidation
 * @param endIndex End of consolidation
 * @returns Percentage of volatility contraction (0-1)
 */
const calculateVolatilityContraction = (
  data: NonNullableDailyPricesObject[],
  startIndex: number,
  endIndex: number
): number => {
  // Need at least 10 days of data for meaningful calculation
  if (endIndex - startIndex < 10) return 0;
  
  // Calculate ATR at the beginning of consolidation (first 5 days)
  const startATR = calculateATR(data, 5, startIndex + 4);
  
  // Calculate ATR at the end of consolidation (last 5 days)
  const endATR = calculateATR(data, 5, endIndex);
  
  // Calculate percentage contraction
  if (startATR === 0) return 0;
  const contractionPct = 1 - (endATR / startATR);
  
  return contractionPct;
};

/**
 * Calculate the price range volatility (high-low range)
 * @param data Price data
 * @returns Average daily range as a percentage
 */
const calculateRangeVolatility = (
  data: NonNullableDailyPricesObject[]
): number => {
  const ranges = data.map(d => (d.high - d.low) / d.low);
  return ranges.reduce((sum, range) => sum + range, 0) / ranges.length;
};

export { calculateATR, calculateVolatilityContraction, calculateRangeVolatility };
