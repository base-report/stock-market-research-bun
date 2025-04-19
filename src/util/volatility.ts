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
 * with emphasis on recent volatility reduction
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
  // Need at least 7 days of data for meaningful calculation (reduced from 10)
  if (endIndex - startIndex < 7) return 0;

  const totalDays = endIndex - startIndex;

  // For shorter consolidations, use a different approach
  if (totalDays < 15) {
    // Calculate ATR at the beginning of consolidation (first 3 days)
    const startATR = calculateATR(data, 3, startIndex + 2);

    // Calculate ATR at the end of consolidation (last 3 days)
    const endATR = calculateATR(data, 3, endIndex);

    // Calculate percentage contraction
    if (startATR === 0) return 0;
    return 1 - endATR / startATR;
  }

  // For longer consolidations, use a more sophisticated approach
  // that emphasizes recent volatility reduction

  // Calculate early phase ATR (first third of consolidation)
  const earlyPhaseEnd = startIndex + Math.floor(totalDays / 3);
  const earlyPhaseATR = calculateATR(data, 5, earlyPhaseEnd);

  // Calculate middle phase ATR
  const midPhaseEnd = startIndex + Math.floor((totalDays * 2) / 3);
  const midPhaseATR = calculateATR(data, 5, midPhaseEnd);

  // Calculate late phase ATR (last third of consolidation)
  const latePhaseATR = calculateATR(data, 5, endIndex);

  // Calculate weighted contraction with more emphasis on recent reduction
  if (earlyPhaseATR === 0) return 0;

  // Calculate contractions between phases
  const earlyToMidContraction = 1 - midPhaseATR / earlyPhaseATR;
  const midToLateContraction = 1 - latePhaseATR / midPhaseATR;

  // Weight recent contraction more heavily (70% recent, 30% early)
  const weightedContraction =
    earlyToMidContraction * 0.3 + midToLateContraction * 0.7;

  return weightedContraction;
};

/**
 * Calculate the price range volatility (high-low range)
 * @param data Price data
 * @returns Average daily range as a percentage
 */
const calculateRangeVolatility = (
  data: NonNullableDailyPricesObject[]
): number => {
  const ranges = data.map((d) => (d.high - d.low) / d.low);
  return ranges.reduce((sum, range) => sum + range, 0) / ranges.length;
};

export {
  calculateATR,
  calculateVolatilityContraction,
  calculateRangeVolatility,
};
