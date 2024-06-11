import { Database } from "bun:sqlite";
import { db } from "./client";

const createSymbolsTable = (db: Database) => {
  const query = db.query(`
    CREATE TABLE IF NOT EXISTS symbols (
      code TEXT PRIMARY KEY,
      name TEXT,
      exchange TEXT,
      isin TEXT
    );
  `);
  query.run();
};

const createStockInfoTable = (db: Database) => {
  const query = db.query(`
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
  `);
  query.run();
};

const createHistoricalPricesTable = (db: Database) => {
  const query = db.query(`
    CREATE TABLE IF NOT EXISTS historical_prices (
      code TEXT PRIMARY KEY,
      daily BLOB,

      FOREIGN KEY (code) REFERENCES symbols(code)
    );
  `);
  query.run();
};

const createAggregateHistoricalPricesTable = (db: Database) => {
  const query = db.query(`
    CREATE TABLE IF NOT EXISTS aggregate_historical_prices (
      type TEXT,
      name TEXT,
      daily BLOB,

      PRIMARY KEY (type, name)
    );
  `);
  query.run();
};

const createTradesTable = (db: Database) => {
  const query = db.query(`
    CREATE TABLE trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      gain_pct REAL AS ((exit_price - entry_price) / entry_price * 100) VIRTUAL,
      max_possible_gain_pct REAL AS ((highest_price - entry_price) / entry_price * 100) VIRTUAL,
      unrealized_gain_pct_from_exit REAL AS ((highest_price - exit_price) / exit_price * 100) VIRTUAL
    );
  `);
  query.run();
};

const createTables = () => {
  createSymbolsTable(db);
  createStockInfoTable(db);
  createHistoricalPricesTable(db);
  createAggregateHistoricalPricesTable(db);
  createTradesTable(db);
};

export { createTables };
