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

const createTables = () => {
  createSymbolsTable(db);
};

export { createTables };
