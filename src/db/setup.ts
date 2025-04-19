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
      volatility_contraction REAL,
      consolidation_quality REAL,
      gain_pct REAL AS ((exit_price - entry_price) / entry_price * 100) VIRTUAL,
      max_possible_gain_pct REAL AS ((highest_price - entry_price) / entry_price * 100) VIRTUAL,
      unrealized_gain_pct_from_exit REAL AS ((highest_price - exit_price) / exit_price * 100) VIRTUAL
    );
  `);
  query.run();
};

const createPerformanceTechnicalsTable = (db: Database) => {
  const query = db.query(`
    CREATE TABLE performance_technicals (
        name TEXT, -- code or aggregate name
        aggregate_type TEXT,
        date TEXT,

        adr_20_pct REAL,
        price_1 REAL,
        high_20 REAL,
        low_20 REAL,
        high_50 REAL,
        low_50 REAL,
        high_200 REAL,
        low_200 REAL,

        bpr REAL GENERATED ALWAYS AS (
          ROUND(
            (
              -- Relative Price Change
              (
                ((price_1 - low_20) / NULLIF(high_20 - low_20, 0) - 1) +
                ((price_1 - low_50) / NULLIF(high_50 - low_50, 0) - 1) +
                ((price_1 - low_200) / NULLIF(high_200 - low_200, 0) - 1)
              ) / 3 +

              -- Volatility Adjustment
              (
                LOG(MAX(high_20 / NULLIF(low_20, 0.0001), 1)) +
                LOG(MAX(high_50 / NULLIF(low_50, 0.0001), 1))
              ) / 2 +

              -- Modified Consolidation Bonus
              CASE
                WHEN price_1 < low_20 AND price_1 < low_50 AND price_1 < low_200 THEN -0.05
                ELSE 0
              END
            ),
            4  -- Precision
          )
        ) STORED,
        PRIMARY KEY (name, aggregate_type, date)
    );
  `);
  query.run();
};

const createBPRPercentilesTable = (db: Database) => {
  const query = db.query(`
    CREATE TABLE bpr_percentiles (
        date TEXT,
        min_bpr REAL,
        max_bpr REAL,
        percentile INTEGER
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
  createPerformanceTechnicalsTable(db);
  createBPRPercentilesTable(db);
};

export { createTables };
