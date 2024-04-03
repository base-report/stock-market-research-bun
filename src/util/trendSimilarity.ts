// Helper function to calculate mean squared error
const meanSquaredError = (
  arr1: number[],
  arr2: number[],
  weights: number[],
): number => {
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    sum += weights[i] * Math.pow(arr1[i] - arr2[i], 2);
  }
  return sum / arr1.length;
};

const calculateTrendSimilarity = (
  trend1: number[],
  trend2: number[],
  lookbackPeriod: number = 200,
): number => {
  trend1 = trend1.slice(-lookbackPeriod);
  trend2 = trend2.slice(-lookbackPeriod);

  // Normalize the trends to [0, 1]
  const min1 = Math.min(...trend1);
  const max1 = Math.max(...trend1);
  const min2 = Math.min(...trend2);
  const max2 = Math.max(...trend2);

  trend1 = trend1.map((value) => (value - min1) / (max1 - min1));
  trend2 = trend2.map((value) => (value - min2) / (max2 - min2));

  // Filter out NaN values and limit to lookbackPeriod
  const validIndices: number[] = [];
  const startIndex = Math.max(0, trend1.length - lookbackPeriod);
  for (let i = startIndex; i < trend1.length; i++) {
    if (!isNaN(trend1[i]) && !isNaN(trend2[i])) {
      validIndices.push(i);
    }
  }
  trend1 = validIndices.map((index) => trend1[index]);
  trend2 = validIndices.map((index) => trend2[index]);

  // Create a weight array
  const weights: number[] = Array(trend1.length).fill(1);
  // Apply double weight only if lookbackPeriod >= 20
  if (lookbackPeriod >= 20) {
    for (let i = Math.max(0, weights.length - 20); i < weights.length; i++) {
      weights[i] = 2; // Giving double weight to the last 20 candles
    }
  }

  // Calculate the weighted MSE between the trends
  const mse = meanSquaredError(trend1, trend2, weights);

  // Normalize MSE to [0, 1]
  const nmse = 1 - mse;

  // Scale to [0, 100] and round to 4 decimal places
  return Math.round(nmse * 100 * 10000) / 10000;
};

const findSimilarSegmentsAboveThreshold = (
  trend1Prices: number[],
  historicalPrices: number[],
  threshold: number = 98,
) => {
  const segments = [];
  const segmentLength = trend1Prices.length;

  let i = 0;
  while (i <= historicalPrices.length - segmentLength) {
    let windowHighestSimilarity = -1;
    let windowBestSegment = null;

    // Iterate through the "window" starting from i
    while (i <= historicalPrices.length - segmentLength) {
      const currentSegment = historicalPrices.slice(i, i + segmentLength);
      const similarity = calculateTrendSimilarity(trend1Prices, currentSegment);

      if (similarity >= threshold) {
        // Within the threshold window, find the highest similarity
        if (similarity > windowHighestSimilarity) {
          windowHighestSimilarity = similarity;
          windowBestSegment = {
            startIndex: i,
            endIndex: i + segmentLength - 1,
            similarity,
          };
        }
        i++; // Continue through the window
      } else {
        // If we hit a segment below the threshold, break out to process the found segment
        break;
      }
    }

    // If a best segment within the window was found, add it to the list
    if (windowBestSegment) {
      segments.push(windowBestSegment);
      // Optionally, skip ahead to avoid immediate overlap
      i = windowBestSegment.endIndex; // Move to the end of the best segment's window
    } else {
      i++; // No high similarity found, move to the next segment
    }
  }

  return segments;
};

export { calculateTrendSimilarity, findSimilarSegmentsAboveThreshold };
