import { createTables } from "./db/setup";
import { getExchangeSymbols } from "./eodhd/exchangeSymbols";
import { addSymbols } from "./db/symbol";

// Create tables
console.time("createTables");
createTables();
console.timeEnd("createTables");

// Add exchange symbols
console.time("getExchangeSymbols");
console.log("getExchangeSymbols start");
const [nasdaqSymbols, nyseSymbols] = await Promise.all([
  getExchangeSymbols("NASDAQ"),
  getExchangeSymbols("NYSE"),
]);
const symbols = nasdaqSymbols.concat(nyseSymbols);
addSymbols(symbols);

console.log("getExchangeSymbols end");
