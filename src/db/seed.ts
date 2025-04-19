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

import cliProgress from "cli-progress";

const addBulkFundamentals = async (codes: string[]) => {
  const codeChunks = chunk(codes, 500);

  // Create a progress bar
  const bar = new cliProgress.SingleBar({
    format:
      " {bar} | {percentage}% | {value}/{total} chunks | ETA: {eta_formatted}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  bar.start(codeChunks.length, 0);

  for (let i = 0; i < codeChunks.length; i++) {
    const chunk = codeChunks[i];
    const bulkFundamentals = await getBulkStockFundamentals(chunk);
    addBulkStockInfo(bulkFundamentals);
    bar.update(i + 1);
  }

  bar.stop();
};

const parallelAddHistoricalPrices = async (codes: string[]) => {
  // Create a progress bar
  const bar = new cliProgress.SingleBar({
    format:
      " {bar} | {percentage}% | {value}/{total} symbols | ETA: {eta_formatted}",
    barCompleteChar: "\u2588",
    barIncompleteChar: "\u2591",
    hideCursor: true,
  });

  bar.start(codes.length, 0);

  let processed = 0;

  await processInBatches(
    codes,
    async (code) => {
      try {
        const historicalPrices = await getHistoricalPrices(code);
        addHistoricalPrices(historicalPrices);
        processed++;
        bar.update(processed);
      } catch (error) {
        processed++;
        bar.update(processed);
        throw error;
      }
    },
    20, // Batch size
    (code, error) => console.error("Error processing", code, error),
    false // Don't log batch progress (we have our own progress bar)
  );

  bar.stop();
};

const seed = async (specificCode?: string) => {
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
    delistedNyseSymbols
  );
  addSymbols(symbols);

  console.log("getExchangeSymbols end");
  console.timeEnd("getExchangeSymbols");

  // Get symbol codes - either a specific code or all codes
  let codes: string[];
  if (specificCode) {
    codes = [specificCode];
    console.log(`Seeding data for specific symbol: ${specificCode}`);
  } else {
    codes = getAllSymbolCodes();
    console.log(`Seeding data for all symbols: ${codes.length} symbols found`);
  }

  // Add bulk stock fundamentals
  console.time("addBulkFundamentals");
  console.log("addBulkFundamentals start");
  await addBulkFundamentals(codes);
  console.log("addBulkFundamentals end");
  console.timeEnd("addBulkFundamentals");

  // // Add bulk left over stock info
  // // console.time("addBulkLeftoverStockInfo");
  // // console.log("addBulkLeftoverStockInfo start");
  // // const leftoverStockInfoCodes =  getLeftoverStockInfoCodes();
  // // await addBulkFundamentals(leftoverStockInfoCodes);
  // // console.log("addBulkLeftoverStockInfo end");
  // // console.timeEnd("addBulkLeftoverStockInfo");

  // Add historical prices
  console.time("parallelAddHistoricalPrices");
  console.log("parallelAddHistoricalPrices start");
  await parallelAddHistoricalPrices(codes);
  console.log("parallelAddHistoricalPrices end");
  console.timeEnd("parallelAddHistoricalPrices");

  // // Add left over historical prices
  // // console.time("addLeftoverHistoricalPrices");
  // // console.log("addLeftoverHistoricalPrices start");
  // // const leftoverHistoricalPricesCodes = getLeftoverHistoricalPricesCodes();
  // // await parallelAddHistoricalPrices(leftoverHistoricalPricesCodes);
  // // console.log("addLeftoverHistoricalPrices end");
  // // console.timeEnd("addLeftoverHistoricalPrices");
};

export { seed };
