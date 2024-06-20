import type { DBPerformanceTechnicalsWrite } from "../schemas/PerformanceTechnicals";
import type {
  NonNullableDailyPrices,
  NonNullableDailyPricesObject,
} from "../schemas/HistoricalPrices";

import { DateTime } from "luxon";
import { db } from "./client";
import {
  getHistoricalPrices,
  getAggregateHistoricalPricesList,
  getAggregateHistoricalPrices,
} from "./historicalPrices";
import { getAllSymbolCodes } from "./symbol";
import { processData } from "../util/chart";
import { calculateADR } from "../util/calc";
import { roundTo } from "../util/number";

const addPerformanceTechnicals = (
  performanceTechnicals: DBPerformanceTechnicalsWrite[],
) => {
  if (performanceTechnicals.length === 0) return;

  const insertRow = db.prepare(
    "INSERT INTO performance_technicals (name, aggregate_type, date, adr_20_pct, price_1, high_20, low_20, high_50, low_50, high_200, low_200) VALUES ($name, $aggregate_type, $date, $adr_20_pct, $price_1, $high_20, $low_20, $high_50, $low_50, $high_200, $low_200) ON CONFLICT(name, aggregate_type, date) DO UPDATE SET adr_20_pct=excluded.adr_20_pct, price_1=excluded.price_1, high_20=excluded.high_20, low_20=excluded.low_20, high_50=excluded.high_50, low_50=excluded.low_50, high_200=excluded.high_200, low_200=excluded.low_200",
  );

  const insertAll = db.transaction(
    (performanceTechnicals: DBPerformanceTechnicalsWrite[]) => {
      for (const performanceTechnical of performanceTechnicals) {
        insertRow.run({
          $name: performanceTechnical.name,
          $aggregate_type: performanceTechnical.aggregate_type,
          $date: performanceTechnical.date,
          $adr_20_pct: performanceTechnical.adr_20_pct,
          $price_1: performanceTechnical.price_1,
          $high_20: performanceTechnical.high_20,
          $low_20: performanceTechnical.low_20,
          $high_50: performanceTechnical.high_50,
          $low_50: performanceTechnical.low_50,
          $high_200: performanceTechnical.high_200,
          $low_200: performanceTechnical.low_200,
        });
      }
      return performanceTechnicals.length;
    },
  );

  insertAll(performanceTechnicals);
};

const calculatePerformanceTechnicals = (
  name: string,
  aggregate_type: string,
  historicalPrices: NonNullableDailyPrices[],
) => {
  const processedData: NonNullableDailyPricesObject[] =
    processData(historicalPrices);

  const performanceTechnicals: DBPerformanceTechnicalsWrite[] = [];

  processedData.forEach((data, index) => {
    // skip first 200 days
    if (index < 200) return;
    const date = DateTime.fromJSDate(data.date).toFormat("yyyy-MM-dd");
    const adr20 = roundTo(calculateADR(processedData, index + 1) * 100, 2);
    const price1 = processedData[index].close;
    const high20 = Math.max(
      ...processedData.slice(index - 20, index).map((d) => d.high),
    );
    const low20 = Math.min(
      ...processedData.slice(index - 20, index).map((d) => d.low),
    );
    const high50 = Math.max(
      ...processedData.slice(index - 50, index).map((d) => d.high),
    );
    const low50 = Math.min(
      ...processedData.slice(index - 50, index).map((d) => d.low),
    );
    const high200 = Math.max(
      ...processedData.slice(index - 200, index).map((d) => d.high),
    );
    const low200 = Math.min(
      ...processedData.slice(index - 200, index).map((d) => d.low),
    );

    performanceTechnicals.push({
      name,
      aggregate_type,
      date,
      adr_20_pct: adr20,
      price_1: price1,
      high_20: high20,
      low_20: low20,
      high_50: high50,
      low_50: low50,
      high_200: high200,
      low_200: low200,
    });
  });

  addPerformanceTechnicals(performanceTechnicals);
};

const calculatePerformanceTechnicalsForCode = (code: string) => {
  const result = getHistoricalPrices(code);
  if (!result?.daily) return;

  const { daily } = result;

  const decoder = new TextDecoder();
  const jsonString = decoder.decode(daily);
  const historicalPrices: NonNullableDailyPrices[] = JSON.parse(jsonString);

  calculatePerformanceTechnicals(code, "none", historicalPrices);
};

const calculatePerformanceTechnicalsForAggregate = (
  type: string,
  name: string,
) => {
  const result = getAggregateHistoricalPrices(type, [name]);
  if (!result) return;

  const [{ daily }] = result;

  calculatePerformanceTechnicals(name, type, daily);
};

const calculateAllPerformanceTechnicals = () => {
  const allSymbolCodes = getAllSymbolCodes();
  allSymbolCodes.forEach((code) => {
    calculatePerformanceTechnicalsForCode(code);
    console.log(`Calculated performance technicals for ${code}`);
  });

  const aggregateHistoricalPricesList = getAggregateHistoricalPricesList();

  aggregateHistoricalPricesList.forEach(([type, name]) => {
    calculatePerformanceTechnicalsForAggregate(type, name);
    console.log(
      `Calculated performance technicals for ${name} of type ${type}`,
    );
  });
};

export { addPerformanceTechnicals, calculateAllPerformanceTechnicals };
