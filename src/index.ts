import { createTables } from "./db/setup";
import { seed } from "./db/seed";
import { getAllSymbolCodes } from "./db/symbol";
import { findSetups } from "./db/findSetups";
import { createAggregateHistoricalPrices } from "./db/historicalPrices";

// // Create tables
// console.time("createTables");
// createTables();
// console.timeEnd("createTables");
//
// // Seed data
// console.time("seed data");
// await seed();
// console.timeEnd("seed data");

// // Get all codes
// const codes = getAllSymbolCodes();
// console.log(`Found ${codes.length} symbols`);
//
// // Find setups
// console.time("find setups");
// for (const code of codes) {
//   console.time(`find setups for ${code}`);
//   try {
//     findSetups(code);
//   } catch (e) {
//     console.error(e);
//   }
//   console.timeEnd(`find setups for ${code}`);
//   // wait 100ms between each code
//   await new Promise((resolve) => setTimeout(resolve, 100));
// }
// console.timeEnd("find setups");

// Create aggregate historical prices
console.time("create aggregate historical prices");
createAggregateHistoricalPrices();
console.timeEnd("create aggregate historical prices");
