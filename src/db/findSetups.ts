import type { HistoricalPrices } from "../schemas/HistoricalPrices";

import { DateTime } from "luxon";
import { roundTo } from "../util/number";
import { getHistoricalPrices } from "./historicalPrices";
import { findSimilarSegmentsAboveThreshold } from "../util/trendSimilarity";

const prtsBreakoutSetupClosingPrices = [
  1.8, 1.55, 1.61, 1.55, 1.72, 1.92, 1.81, 1.7, 1.75, 1.64, 1.68, 1.63, 1.73,
  1.77, 1.79, 1.83, 1.84, 1.83, 1.88, 2.19, 2.2, 2.11, 2.25, 2.43, 2.65, 2.66,
  3.06, 3.43, 3.4, 3.21, 3.32, 3.55, 3.68, 3.75, 4.25, 4.67, 4.95, 4.96, 4.49,
  5.07, 5.08, 5.03, 5.24, 5.66, 6.08, 5.88, 6, 5.97, 6.46, 6.97, 7.89, 8.43,
  7.76, 8.3, 7.7, 8.85, 8.57, 8.12, 8.1, 8.34, 8.73, 8.95, 8.84, 8.78, 8.71,
  8.8, 8.89, 8.84, 8.62, 8.64, 8.82, 8.66, 8.74, 8.74, 8.76, 8.74,
];

const findSetups = () => {
  const { code, daily } = getHistoricalPrices("AAPL");
  // decode daily which is Uint8Array
  const decoder = new TextDecoder();
  const jsonString = decoder.decode(daily);
  const historicalPrices: HistoricalPrices = JSON.parse(jsonString);
  const closingPrices = historicalPrices.map((c) => c[3]);

  const similarSegments = findSimilarSegmentsAboveThreshold(
    prtsBreakoutSetupClosingPrices,
    closingPrices,
  );
  const similarityTable = [];
  for (const { startIndex, endIndex, similarity } of similarSegments) {
    const startDate = DateTime.fromMillis(
      historicalPrices[startIndex][5],
    ).toFormat("yyyy-MM-dd");
    const endDate = DateTime.fromMillis(historicalPrices[endIndex][5]).toFormat(
      "yyyy-MM-dd",
    );
    similarityTable.push({
      startDate,
      endDate,
      similarity: `${roundTo(similarity, 2)}%`,
    });
  }

  console.log(
    `Similar setups found for ${code} based on the PRTS 2020-07-07 setup`,
  );
  console.table(similarityTable.sort((a, b) => b.similarity - a.similarity));
};

export { findSetups };
