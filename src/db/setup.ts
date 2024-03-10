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
      updated_at TEXT,

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

const createTables = () => {
  createSymbolsTable(db);
  createStockInfoTable(db);
  createHistoricalPricesTable(db);
};

export { createTables };
