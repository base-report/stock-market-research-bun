import { db } from "./client";
import { sql } from "bun";

/**
 * Sync data from SQLite to PostgreSQL
 * @returns Object with counts of records synced for each table
 */
const syncToPostgres = async () => {
  console.log("Starting sync from SQLite to PostgreSQL...");

  // Drop existing tables to ensure we have the latest schema
  await dropPostgresTables();

  // Create tables in PostgreSQL
  await createPostgresTables();

  // Sync each table
  const symbolsCount = await syncSymbols();
  const stockInfoCount = await syncStockInfo();
  const tradesCount = await syncTrades();

  const results = {
    symbols: symbolsCount,
    stockInfo: stockInfoCount,
    trades: tradesCount,
    total: symbolsCount + stockInfoCount + tradesCount,
  };

  console.log("Sync completed successfully!");
  console.log(`Total records synced: ${results.total}`);

  return results;
};

/**
 * Drop existing tables in PostgreSQL
 */
const dropPostgresTables = async () => {
  console.log("Dropping existing tables in PostgreSQL...");

  try {
    // Drop tables in reverse order of dependencies
    await sql`DROP TABLE IF EXISTS trades CASCADE`.simple();
    await sql`DROP TABLE IF EXISTS stock_info CASCADE`.simple();
    await sql`DROP TABLE IF EXISTS symbols CASCADE`.simple();

    console.log("PostgreSQL tables dropped successfully");
  } catch (error) {
    console.error("Error dropping PostgreSQL tables:", error);
  }
};

/**
 * Create tables in PostgreSQL
 */
const createPostgresTables = async () => {
  console.log("Creating tables in PostgreSQL if they don't exist...");

  // Create symbols table
  await sql`
    CREATE TABLE IF NOT EXISTS symbols (
      code TEXT PRIMARY KEY,
      name TEXT,
      exchange TEXT,
      isin TEXT
    );
  `.simple();

  // Create stock_info table
  await sql`
    CREATE TABLE IF NOT EXISTS stock_info (
      code TEXT PRIMARY KEY,
      ipo_date TEXT,
      sector TEXT,
      industry TEXT,
      gic_sector TEXT,
      gic_group TEXT,
      gic_industry TEXT,
      gic_sub_industry TEXT,
      description TEXT,
      address TEXT,
      web_url TEXT,
      logo_url TEXT,
      full_time_employees INTEGER,
      is_delisted BOOLEAN,

      FOREIGN KEY (code) REFERENCES symbols(code)
    );
  `.simple();

  // Create trades table
  await sql`
    CREATE TABLE IF NOT EXISTS trades (
      id SERIAL PRIMARY KEY,
      code TEXT,
      prior_move_low_date TEXT,
      prior_move_high_date TEXT,
      prior_move_pct REAL,
      consolidation_slope REAL,
      consolidation_days INTEGER,
      consolidation_start_date TEXT,
      consolidation_end_date TEXT,
      entry_price REAL,
      entry_date TEXT,
      entry_trendline_break_price REAL,
      entry_adr_pct REAL,
      entry_dollar_volume REAL,
      highest_price_date TEXT,
      highest_price REAL,
      highest_price_days INTEGER,
      exit_price REAL,
      exit_date TEXT,
      exit_reason TEXT,
      exit_days INTEGER,
      volatility_contraction REAL,
      consolidation_quality REAL,
      gain_pct REAL GENERATED ALWAYS AS ((exit_price - entry_price) / NULLIF(entry_price, 0) * 100) STORED,
      max_possible_gain_pct REAL GENERATED ALWAYS AS ((highest_price - entry_price) / NULLIF(entry_price, 0) * 100) STORED,
      unrealized_gain_pct_from_exit REAL GENERATED ALWAYS AS ((highest_price - exit_price) / NULLIF(exit_price, 0) * 100) STORED
    );
  `.simple();

  console.log("PostgreSQL tables created successfully");
};

/**
 * Sync symbols table from SQLite to PostgreSQL
 * @returns Number of records synced
 */
const syncSymbols = async () => {
  console.log("Syncing symbols table...");

  // Get all symbols from SQLite
  const symbolsQuery = db.query(`SELECT * FROM symbols`);
  const symbols = symbolsQuery.all() as any[];

  if (symbols.length === 0) {
    console.log("No symbols found in SQLite");
    return 0;
  }

  console.log(`Found ${symbols.length} symbols in SQLite`);

  // Clear existing data in PostgreSQL
  await sql`TRUNCATE TABLE symbols CASCADE`.simple();

  // Insert symbols into PostgreSQL
  let count = 0;
  const batchSize = 1000;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    await sql`INSERT INTO symbols ${sql(batch)}`;
    count += batch.length;
    console.log(`Inserted ${count}/${symbols.length} symbols`);
  }

  console.log(`Synced ${count} symbols to PostgreSQL`);
  return count;
};

/**
 * Sync stock_info table from SQLite to PostgreSQL
 * @returns Number of records synced
 */
const syncStockInfo = async () => {
  console.log("Syncing stock_info table...");

  // Get all stock_info from SQLite
  const stockInfoQuery = db.query(`SELECT * FROM stock_info`);
  const stockInfoRaw = stockInfoQuery.all() as any[];

  // Convert is_delisted from integer (0/1) to boolean (false/true) for PostgreSQL
  const stockInfo = stockInfoRaw.map((info) => ({
    ...info,
    is_delisted: info.is_delisted === 1 || info.is_delisted === true,
  }));

  if (stockInfo.length === 0) {
    console.log("No stock_info found in SQLite");
    return 0;
  }

  console.log(`Found ${stockInfo.length} stock_info records in SQLite`);

  // Clear existing data in PostgreSQL
  await sql`TRUNCATE TABLE stock_info CASCADE`.simple();

  // Insert stock_info into PostgreSQL
  let count = 0;
  const batchSize = 1000;

  for (let i = 0; i < stockInfo.length; i += batchSize) {
    const batch = stockInfo.slice(i, i + batchSize);
    await sql`INSERT INTO stock_info ${sql(batch)}`;
    count += batch.length;
    console.log(`Inserted ${count}/${stockInfo.length} stock_info records`);
  }

  console.log(`Synced ${count} stock_info records to PostgreSQL`);
  return count;
};

/**
 * Sync trades table from SQLite to PostgreSQL
 * @returns Number of records synced
 */
const syncTrades = async () => {
  console.log("Syncing trades table...");

  // Get all trades from SQLite
  const tradesQuery = db.query(`
    SELECT
      code, prior_move_low_date, prior_move_high_date, prior_move_pct,
      consolidation_slope, consolidation_days, consolidation_start_date, consolidation_end_date,
      entry_price, entry_date, entry_trendline_break_price, entry_adr_pct, entry_dollar_volume,
      highest_price_date, highest_price, highest_price_days,
      exit_price, exit_date, exit_reason, exit_days,
      volatility_contraction, consolidation_quality
    FROM trades
  `);
  const tradesRaw = tradesQuery.all() as any[];

  // Filter out trades with zero entry or exit prices to avoid division by zero
  const trades = tradesRaw.filter(
    (trade) => trade.entry_price > 0 && trade.exit_price > 0
  );

  console.log(
    `Filtered out ${tradesRaw.length - trades.length} trades with zero prices`
  );

  if (trades.length === 0) {
    console.log("No trades found in SQLite");
    return 0;
  }

  console.log(`Found ${trades.length} trades in SQLite`);

  // Clear existing data in PostgreSQL
  await sql`TRUNCATE TABLE trades CASCADE`.simple();

  // Insert trades into PostgreSQL
  let count = 0;
  const batchSize = 1000;

  for (let i = 0; i < trades.length; i += batchSize) {
    const batch = trades.slice(i, i + batchSize);
    await sql`INSERT INTO trades ${sql(
      batch,
      "code",
      "prior_move_low_date",
      "prior_move_high_date",
      "prior_move_pct",
      "consolidation_slope",
      "consolidation_days",
      "consolidation_start_date",
      "consolidation_end_date",
      "entry_price",
      "entry_date",
      "entry_trendline_break_price",
      "entry_adr_pct",
      "entry_dollar_volume",
      "highest_price_date",
      "highest_price",
      "highest_price_days",
      "exit_price",
      "exit_date",
      "exit_reason",
      "exit_days",
      "volatility_contraction",
      "consolidation_quality"
    )}`;
    count += batch.length;
    console.log(`Inserted ${count}/${trades.length} trades`);
  }

  console.log(`Synced ${count} trades to PostgreSQL`);
  return count;
};

export { syncToPostgres };
