import type {
  HistoricalPrices,
  AggregateHistoricalPrices,
} from "../schemas/HistoricalPrices";

import { db } from "./client";
import { AggregateHistoricalPricesSchema } from "../schemas/HistoricalPrices";
import {
  getAllGICSubIndustries,
  getALLGICIndustriesAndSubIndustries,
  getALLGICGroupsAndIndustries,
  getALLGICSectorsAndGroups,
} from "./stockInfo";
import { constructAggregatedHistoricalPrices } from "../util/aggregateHistoricalPrices";

const addHistoricalPrices = (historicalPrices: HistoricalPrices) => {
  const query = db.query(
    "INSERT INTO historical_prices (code, daily) VALUES ($code, $daily) ON CONFLICT(code) DO UPDATE SET daily=excluded.daily",
  );
  query.run({
    $code: historicalPrices.code,
    $daily: historicalPrices.daily,
  });
};

const addAggregateHistoricalPrices = (
  aggregateHistoricalPrices: AggregateHistoricalPrices,
) => {
  const query = db.query(
    "INSERT INTO aggregate_historical_prices (type, name, daily) VALUES ($type, $name, $daily) ON CONFLICT(type, name) DO UPDATE SET daily=excluded.daily",
  );
  query.run({
    $type: aggregateHistoricalPrices.type,
    $name: aggregateHistoricalPrices.name,
    $daily: aggregateHistoricalPrices.daily,
  });
};

const getLeftoverHistoricalPricesCodes = (): string[] => {
  const query = db.query(
    "SELECT code FROM symbols WHERE code NOT IN (SELECT code FROM historical_prices)",
  );
  const symbols = query.values();
  return symbols.map(([code]) => code);
};

const getHistoricalPrices = (code: string): HistoricalPrices | null => {
  const query = db.query("SELECT * FROM historical_prices WHERE code=$code");
  const historicalPrices = query.get({ $code: code });
  return historicalPrices;
};

const getHistoricalPricesForGICSubIndustry = (
  subIndustry: string,
): AggregateHistoricalPrices[] => {
  const query = db.query(`
    SELECT $type AS type, code AS name, daily
    FROM historical_prices
    WHERE code IN (SELECT code FROM stock_info WHERE gic_sub_industry=$subIndustry)
  `);

  const historicalPricesList = query.values({
    $type: "gic_sub_industry",
    $subIndustry: subIndustry,
  });
  const decoder = new TextDecoder();

  return historicalPricesList.map(([type, name, daily]) => ({
    type,
    name,
    daily: JSON.parse(decoder.decode(daily)),
  }));
};

const getAggregateHistoricalPricesForGICIndustry = (
  subIndustries: string[],
): AggregateHistoricalPrices => {
  const subIndustriesString = subIndustries
    .map((industry) => `'${industry}'`)
    .join(", ");
  const query = db.query(`
    SELECT $type AS type, name, daily
    FROM aggregate_historical_prices
    WHERE type='gic_sub_industry' AND name IN (${subIndustriesString})
  `);

  const historicalPricesList = query.values({
    $type: "gic_industry",
  });
  const decoder = new TextDecoder();

  return historicalPricesList.map(([type, name, daily]) => ({
    type,
    name,
    daily: JSON.parse(decoder.decode(daily)),
  }));
};

const createAggregateHistoricalPricesForGICSubIndustry = (
  subIndustry: string,
) => {
  const historicalPricesList =
    getHistoricalPricesForGICSubIndustry(subIndustry);
  const daily = constructAggregatedHistoricalPrices(historicalPricesList);
  const aggregateHistoricalPrices = AggregateHistoricalPricesSchema.parse({
    type: "gic_sub_industry",
    name: subIndustry,
    daily,
  });
  addAggregateHistoricalPrices(aggregateHistoricalPrices);
  console.log(`Created aggregate historical prices for ${subIndustry}`);
};

const createAggregateHistoricalPricesForGICIndustry = (
  industry: string,
  subIndustries: string[],
) => {
  const pricesList = getAggregateHistoricalPricesForGICIndustry(subIndustries);

  const daily = constructAggregatedHistoricalPrices(pricesList, true);
  const aggregateHistoricalPrices = AggregateHistoricalPricesSchema.parse({
    type: "gic_industry",
    name: industry,
    daily,
  });

  addAggregateHistoricalPrices(aggregateHistoricalPrices);
  console.log(`Created aggregate historical prices for ${industry}`);
};

const createAggregateHistoricalPrices = () => {
  // const allSubIndustries = getAllGICSubIndustries();
  // for (const subIndustry of allSubIndustries) {
  //   createAggregateHistoricalPricesForGICSubIndustry(subIndustry);
  // }
  const allIndustriesAndSubIndustries = getALLGICIndustriesAndSubIndustries();
  for (const [industry, subIndustries] of Object.entries(
    allIndustriesAndSubIndustries,
  )) {
    createAggregateHistoricalPricesForGICIndustry(industry, subIndustries);
  }
};

export {
  addHistoricalPrices,
  getLeftoverHistoricalPricesCodes,
  getHistoricalPrices,
  createAggregateHistoricalPrices,
};
