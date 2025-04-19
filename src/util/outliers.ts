import type { NonNullableDailyPricesObject } from "../schemas/HistoricalPrices";

/**
 * Calculate the interquartile range (IQR) for a set of values
 * @param values Array of numeric values
 * @returns The IQR value
 */
const calculateIQR = (values: number[]): number => {
  // Sort the values
  const sorted = [...values].sort((a, b) => a - b);

  // Find Q1 (25th percentile)
  const q1Index = Math.floor(sorted.length * 0.25);
  const q1 = sorted[q1Index];

  // Find Q3 (75th percentile)
  const q3Index = Math.floor(sorted.length * 0.75);
  const q3 = sorted[q3Index];

  // Calculate IQR
  return q3 - q1;
};

/**
 * Filter outliers from a dataset using the IQR method
 * @param data Array of values
 * @param multiplier IQR multiplier for outlier detection (default: 1.5)
 * @returns Filtered array with outliers removed
 */
const filterOutliers = (data: number[], multiplier: number = 1.5): number[] => {
  // If we have too few data points, don't filter
  if (data.length < 5) return data;

  // Calculate quartiles and IQR
  const sorted = [...data].sort((a, b) => a - b);
  const q1Index = Math.floor(sorted.length * 0.25);
  const q3Index = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Index];
  const q3 = sorted[q3Index];
  const iqr = q3 - q1;

  // Define bounds
  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;

  // Filter outliers
  return data.filter((x) => x >= lowerBound && x <= upperBound);
};

/**
 * Get a value at a specific percentile from a sorted array
 * @param sortedArray Sorted array of numbers
 * @param percentile Percentile (0-1)
 * @returns Value at the specified percentile
 */
const getPercentile = (sortedArray: number[], percentile: number): number => {
  const index = Math.floor(sortedArray.length * percentile);
  return sortedArray[index];
};

/**
 * Calculate the Average True Range (ATR) for the data
 * @param data Price data
 * @param period Period for ATR calculation
 * @returns ATR value
 */
const calculateATR = (
  data: NonNullableDailyPricesObject[],
  period: number = 14
): number => {
  if (data.length < period + 1) return 0;

  let trSum = 0;
  for (let i = 1; i < period + 1; i++) {
    const current = data[data.length - i];
    const previous = data[data.length - i - 1];

    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);

    trSum += Math.max(tr1, tr2, tr3);
  }

  return trSum / period;
};

/**
 * Calculate the slope of the midpoint of the consolidation range
 * @param data Price data
 * @returns Slope value
 */
const calculateRangeSlope = (data: NonNullableDailyPricesObject[]): number => {
  if (data.length < 5) return 0;

  // Calculate midpoints for each day
  const midpoints = data.map((d) => (d.high + d.low) / 2);

  // Use linear regression to calculate slope
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < midpoints.length; i++) {
    sumX += i;
    sumY += midpoints[i];
    sumXY += i * midpoints[i];
    sumX2 += i * i;
  }

  const n = midpoints.length;
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Normalize slope by dividing by the average price
  const avgPrice = sumY / n;
  const normalizedSlope = slope / avgPrice;

  return normalizedSlope;
};

/**
 * Calculate the consolidation range bounds using percentile-based approach
 * with recency bias to favor more recent candles
 * @param data Price data
 * @param lowerPercentile Lower percentile (default: 0.10)
 * @param upperPercentile Upper percentile (default: 0.90)
 * @param outlierMultiplier IQR multiplier for outlier detection (default: 1.0)
 * @returns Upper and lower bounds of the consolidation range and quality metrics
 */
const calculateConsolidationBounds = (
  data: NonNullableDailyPricesObject[],
  lowerPercentile: number = 0.1,
  upperPercentile: number = 0.9,
  outlierMultiplier: number = 1.0
): {
  upperBound: number;
  lowerBound: number;
  rangeQuality: number;
  densityScore: number;
  isValidConsolidation: boolean;
} => {
  // Apply recency bias - give more weight to recent candles
  // Split the data into two parts: early phase and recent phase
  const splitPoint = Math.floor(data.length * 0.4); // First 40% is early phase
  const earlyPhase = data.slice(0, splitPoint);
  const recentPhase = data.slice(splitPoint);

  // Extract highs and lows with more weight on recent phase
  let highs: number[] = [];
  let lows: number[] = [];

  // Add early phase data (with less weight)
  earlyPhase.forEach((d) => {
    highs.push(d.high);
    lows.push(d.low);
  });

  // Add recent phase data with double weight (add each point twice)
  recentPhase.forEach((d) => {
    highs.push(d.high);
    highs.push(d.high); // Add twice for more weight
    lows.push(d.low);
    lows.push(d.low); // Add twice for more weight
  });

  // Filter outliers with more aggressive multiplier
  const filteredHighs = filterOutliers(highs, outlierMultiplier);
  const filteredLows = filterOutliers(lows, outlierMultiplier);

  // Sort the filtered data
  const sortedHighs = [...filteredHighs].sort((a, b) => a - b);
  const sortedLows = [...filteredLows].sort((a, b) => a - b);

  // Use percentiles instead of min/max
  const upperBound = getPercentile(sortedHighs, upperPercentile);
  const lowerBound = getPercentile(sortedLows, lowerPercentile);

  // Calculate the range
  const range = upperBound - lowerBound;

  // Calculate ATR for comparison
  const atr = calculateATR(data);

  // Calculate range-to-ATR ratio (lower is better for consolidation)
  const rangeToATR = atr > 0 ? range / atr : 999;

  // Calculate what percentage of candles fall within the range with recency bias
  let totalWeight = 0;
  let weightedCandlesInRange = 0;

  // We'll use a weighted approach where recent candles count more
  for (let i = 0; i < data.length; i++) {
    const candle = data[i];
    // Calculate recency weight - more recent candles get higher weight
    // Linear weight from 1.0 to 2.0 based on position
    const recencyWeight = 1.0 + i / (data.length - 1); // Ranges from 1.0 to 2.0

    // A candle is considered "in range" if its body (open to close) is mostly within the range
    const bodyHigh = Math.max(candle.open, candle.close);
    const bodyLow = Math.min(candle.open, candle.close);

    // Calculate how much of the body is in the range
    const bodySize = bodyHigh - bodyLow;
    if (bodySize === 0) continue; // Skip dojis

    const overlapHigh = Math.min(bodyHigh, upperBound);
    const overlapLow = Math.max(bodyLow, lowerBound);
    const overlapSize = Math.max(0, overlapHigh - overlapLow);

    // Calculate the percentage of the body in range
    const bodyInRangePercent = overlapSize / bodySize;

    // Add the weighted contribution
    weightedCandlesInRange += bodyInRangePercent * recencyWeight;
    totalWeight += recencyWeight;
  }

  // Calculate density score with recency bias
  const densityScore =
    totalWeight > 0 ? weightedCandlesInRange / totalWeight : 0;

  // Calculate the slope of the range
  const rangeSlope = Math.abs(calculateRangeSlope(data));

  // Determine if this is a valid consolidation
  // We're more lenient with the slope in either direction (up or down)
  // This helps capture both bullish and bearish consolidations
  const rawSlope = calculateRangeSlope(data);
  const isUpwardSloping = rawSlope > 0;
  const isDownwardSloping = rawSlope < 0;

  // Allow slightly steeper slopes in either direction
  // Upward slopes are allowed to be slightly steeper (bullish bias)
  const slopeLimit = isUpwardSloping ? 0.012 : isDownwardSloping ? 0.01 : 0.008;

  const isValidConsolidation =
    rangeToATR < 4.5 && // Range should be less than 4.5x ATR
    densityScore > 0.65 && // At least 65% of candles should be in range
    rangeSlope < slopeLimit; // Allow appropriate slopes based on direction

  // Calculate an overall quality score (0-1, higher is better)
  const rangeQuality =
    (1 - Math.min(rangeToATR / 5, 1)) * 0.4 + // 40% weight to range/ATR ratio
    densityScore * 0.4 + // 40% weight to density
    (1 - Math.min(rangeSlope / 0.01, 1)) * 0.2; // 20% weight to flatness

  return {
    upperBound,
    lowerBound,
    rangeQuality,
    densityScore,
    isValidConsolidation,
  };
};

export { calculateIQR, filterOutliers, calculateConsolidationBounds };
