import { getExchangeSymbols } from "../eodhd/exchangeSymbols";
import { addSymbols, getAllSymbolCodes } from "./symbol";

import { chunk, processInBatches } from "../util/batch";
import { getBulkStockFundamentals } from "../eodhd/bulkStockFundamentals";
import { addBulkStockInfo, getLeftoverStockInfoCodes } from "./stockInfo";

import { getHistoricalPrices } from "../eodhd/historicalPrices";
import {
  addHistoricalPrices,
  getLeftoverHistoricalPricesCodes,
} from "./historicalPrices";

const addBulkFundamentals = async (codes: string[]) => {
  const codeChunks = chunk(codes, 500);

  for (const i in codeChunks) {
    console.log(`Processing chunk ${i} of ${codeChunks.length}...`);
    const chunk = codeChunks[i];
    const bulkFundamentals = await getBulkStockFundamentals(chunk);
    addBulkStockInfo(bulkFundamentals);
  }
};

const parallelAddHistoricalPrices = async (codes: string[]) => {
  await processInBatches(
    codes,
    async (code) => {
      try {
        const historicalPrices = await getHistoricalPrices(code);
        addHistoricalPrices(historicalPrices);
      } catch (error) {
        throw error;
      }
    },
    20, // Batch size
    (code, error) => console.log("Error processing", code, error),
    true, // log batch progress
  );
};

const seed = async () => {
  // Add exchange symbols
  console.time("getExchangeSymbols");
  console.log("getExchangeSymbols start");
  const [
    nasdaqSymbols,
    nyseSymbols,
    delistedNasdaqSymbols,
    delistedNyseSymbols,
  ] = await Promise.all([
    getExchangeSymbols("NASDAQ"),
    getExchangeSymbols("NYSE"),
    getExchangeSymbols("NASDAQ", true),
    getExchangeSymbols("NYSE", true),
  ]);
  const symbols = nasdaqSymbols.concat(
    nyseSymbols,
    delistedNasdaqSymbols,
    delistedNyseSymbols,
  );
  addSymbols(symbols);

  console.log("getExchangeSymbols end");

  // Get all symbol codes
  const codes = getAllSymbolCodes();

  // Add bulk stock fundamentals
  console.time("addBulkFundamentals");
  console.log("addBulkFundamentals start");
  await addBulkFundamentals(codes);
  console.log("addBulkFundamentals end");
  console.timeEnd("addBulkFundamentals");

  // Add bulk left over stock info
  // console.time("addBulkLeftoverStockInfo");
  // console.log("addBulkLeftoverStockInfo start");
  // const leftoverStockInfoCodes =  getLeftoverStockInfoCodes();
  // await addBulkFundamentals(leftoverStockInfoCodes);
  // console.log("addBulkLeftoverStockInfo end");
  // console.timeEnd("addBulkLeftoverStockInfo");

  // Add historical prices
  console.time("parallelAddHistoricalPrices");
  console.log("parallelAddHistoricalPrices start");
  await parallelAddHistoricalPrices(codes);
  console.log("parallelAddHistoricalPrices end");
  console.timeEnd("parallelAddHistoricalPrices");

  // Add left over historical prices
  // console.time("addLeftoverHistoricalPrices");
  // console.log("addLeftoverHistoricalPrices start");
  // const leftoverHistoricalPricesCodes = getLeftoverHistoricalPricesCodes();
  // await parallelAddHistoricalPrices(leftoverHistoricalPricesCodes);
  // console.log("addLeftoverHistoricalPrices end");
  // console.timeEnd("addLeftoverHistoricalPrices");
};

export { seed };
