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

const getAggregateHistoricalPrices = (
  type: string,
  subIndustries: string[],
): AggregateHistoricalPrices => {
  const subIndustriesString = subIndustries
    .map((industry) => `'${industry}'`)
    .join(", ");
  const query = db.query(`
    SELECT $type AS type, name, daily
    FROM aggregate_historical_prices
    WHERE type=$type AND name IN (${subIndustriesString})
  `);

  const historicalPricesList = query.values({
    $type: type,
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
  const pricesList = getAggregateHistoricalPrices(
    "gic_sub_industry",
    subIndustries,
  );

  const daily = constructAggregatedHistoricalPrices(pricesList, true);
  const aggregateHistoricalPrices = AggregateHistoricalPricesSchema.parse({
    type: "gic_industry",
    name: industry,
    daily,
  });

  addAggregateHistoricalPrices(aggregateHistoricalPrices);
  console.log(`Created aggregate historical prices for ${industry}`);
};

const createAggregateHistoricalPricesForGICGroup = (
  group: string,
  industries: string[],
) => {
  const pricesList = getAggregateHistoricalPrices("gic_industry", industries);

  const daily = constructAggregatedHistoricalPrices(pricesList, true);
  const aggregateHistoricalPrices = AggregateHistoricalPricesSchema.parse({
    type: "gic_group",
    name: group,
    daily,
  });

  addAggregateHistoricalPrices(aggregateHistoricalPrices);
  console.log(`Created aggregate historical prices for ${group}`);
};

const createAggregateHistoricalPricesForGICSector = (
  sector: string,
  groups: string[],
) => {
  const pricesList = getAggregateHistoricalPrices("gic_group", groups);

  const daily = constructAggregatedHistoricalPrices(pricesList, true);
  const aggregateHistoricalPrices = AggregateHistoricalPricesSchema.parse({
    type: "gic_sector",
    name: sector,
    daily,
  });

  addAggregateHistoricalPrices(aggregateHistoricalPrices);
  console.log(`Created aggregate historical prices for ${sector}`);
};

const createAggregateHistoricalPricesForGICMarket = (sectors: string[]) => {
  const pricesList = getAggregateHistoricalPrices("gic_sector", sectors);

  const daily = constructAggregatedHistoricalPrices(pricesList, true);
  const aggregateHistoricalPrices = AggregateHistoricalPricesSchema.parse({
    type: "gic_market",
    name: "market",
    daily,
  });

  addAggregateHistoricalPrices(aggregateHistoricalPrices);
  console.log(`Created aggregate historical prices for market`);
};

const createAggregateHistoricalPrices = () => {
  const allSubIndustries = getAllGICSubIndustries();
  for (const subIndustry of allSubIndustries) {
    createAggregateHistoricalPricesForGICSubIndustry(subIndustry);
  }
  const allIndustriesAndSubIndustries = getALLGICIndustriesAndSubIndustries();
  for (const [industry, subIndustries] of Object.entries(
    allIndustriesAndSubIndustries,
  )) {
    createAggregateHistoricalPricesForGICIndustry(industry, subIndustries);
  }
  const allGroupsAndIndustries = getALLGICGroupsAndIndustries();
  for (const [group, industries] of Object.entries(allGroupsAndIndustries)) {
    createAggregateHistoricalPricesForGICGroup(group, industries);
  }
  const allSectorsAndGroups = getALLGICSectorsAndGroups();
  for (const [sector, groups] of Object.entries(allSectorsAndGroups)) {
    createAggregateHistoricalPricesForGICSector(sector, groups);
  }
  createAggregateHistoricalPricesForGICMarket(Object.keys(allSectorsAndGroups));
};

export {
  addHistoricalPrices,
  getLeftoverHistoricalPricesCodes,
  getHistoricalPrices,
  createAggregateHistoricalPrices,
};
