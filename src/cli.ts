#!/usr/bin/env bun
import { Command } from "commander";
import cliProgress from "cli-progress";
import { createTables } from "./db/setup";
import { seed } from "./db/seed";
import { getAllSymbolCodes } from "./db/symbol";
import { findSetups } from "./db/findSetups";
import { createAggregateHistoricalPrices } from "./db/historicalPrices";
import { calculateAllPerformanceTechnicals } from "./db/performanceTechnicals";
import { updateTradeMetrics } from "./db/updateTradeMetrics";
import { populateBprPercentiles } from "./db/bprPercentiles";
import { syncToPostgres } from "./db/syncToPostgres";
import fs from "fs";
import path from "path";
import { Database } from "bun:sqlite";

// Create a new progress bar instance
const multibar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format:
      " {bar} | {task} | {percentage}% | {value}/{total} | ETA: {eta_formatted}",
  },
  cliProgress.Presets.shades_classic,
);

// Create a program instance
const program = new Command();

// Configure the program
program
  .name("stock-market-research")
  .description("CLI for stock market research operations")
  .version("1.0.0");

// Reset database command
program
  .command("reset-db")
  .description("Reset the database by deleting the existing database file")
  .action(() => {
    const dbPath = process.env.DB_PATH || "./data.sqlite";

    if (fs.existsSync(dbPath)) {
      console.log(`Removing existing database file: ${dbPath}`);
      fs.unlinkSync(dbPath);
      console.log("Database file removed.");
    } else {
      console.log("No existing database file found.");
    }

    // Check for and remove any SQLite journal files
    const dbDir = path.dirname(dbPath);
    const dbName = path.basename(dbPath);

    const shmPath = path.join(dbDir, `${dbName}-shm`);
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
      console.log("SQLite shared memory file removed.");
    }

    const walPath = path.join(dbDir, `${dbName}-wal`);
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
      console.log("SQLite write-ahead log file removed.");
    }

    console.log("Database reset completed.");
  });

// Create tables command
program
  .command("create-tables")
  .description("Create database tables")
  .action(() => {
    console.log("Creating tables...");
    console.time("createTables");
    createTables();
    console.timeEnd("createTables");
    console.log("Tables created successfully.");
  });

// Seed data command
program
  .command("seed-data")
  .description("Seed the database with data")
  .option("-c, --code <code>", "Process a specific symbol code")
  .action(async (options) => {
    console.log("Seeding data...");
    console.time("seed data");

    if (options.code) {
      console.log(`Seeding data for specific symbol: ${options.code}`);
      await seed(options.code);
    } else {
      console.log("Seeding data for all symbols");
      await seed();
    }

    console.timeEnd("seed data");
    console.log("Data seeded successfully.");
  });

// Find setups command
program
  .command("find-setups")
  .description("Find setups for all symbols")
  .option("-c, --code <code>", "Process a specific symbol code")
  .option(
    "-l, --limit <number>",
    "Limit the number of symbols to process",
    parseInt,
  )
  .option(
    "-m, --max-setups <number>",
    "Maximum number of setups to find per symbol",
    parseInt,
  )
  .option("--no-charts", "Skip chart generation for faster processing")
  .action(async (options) => {
    console.log("Finding setups...");
    console.time("find setups");

    const maxSetups = options.maxSetups || 0;
    let totalSetups = 0;
    let bar: any;

    if (maxSetups > 0) {
      console.log(`Limiting to ${maxSetups} setups per symbol`);
    }

    if (options.code) {
      // Process a single code
      console.log(`Processing setup for ${options.code}...`);
      const generateCharts = options.charts !== false;
      if (!generateCharts) {
        console.log("Chart generation disabled for faster processing");
      }
      try {
        const setupsFound = findSetups(options.code, maxSetups, generateCharts);
        totalSetups = setupsFound;
      } catch (e) {
        console.error(`Error processing ${options.code}:`, e);
      }
    } else {
      // Process all codes or a limited number
      const allCodes = getAllSymbolCodes();
      const codes = options.limit ? allCodes.slice(0, options.limit) : allCodes;

      console.log(`Found ${codes.length} symbols to process`);

      // Create a progress bar
      bar = multibar.create(codes.length, 0, { task: "Finding setups" });

      totalSetups = 0;

      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        const generateCharts = options.charts !== false;
        try {
          const setupsFound = findSetups(code, maxSetups, generateCharts);
          totalSetups += setupsFound;
          bar.update(i + 1, {
            task: `Processed ${code} (${setupsFound} setups)`,
          });
        } catch (e) {
          console.error(`Error processing ${code}:`, e);
        }
        // wait 100ms between each code
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      bar.stop();
      console.log(`Total setups found: ${totalSetups}`);
    }

    console.timeEnd("find setups");
    console.log("Setups finding completed.");
  });

// Create aggregate historical prices command
program
  .command("create-aggregate-prices")
  .description("Create aggregate historical prices")
  .action(() => {
    console.log("Creating aggregate historical prices...");
    console.time("create aggregate historical prices");
    createAggregateHistoricalPrices();
    console.timeEnd("create aggregate historical prices");
    console.log("Aggregate historical prices created successfully.");
  });

// Calculate performance technicals command
program
  .command("calculate-technicals")
  .description("Calculate all performance technicals")
  .action(() => {
    console.log("Calculating performance technicals...");
    console.time("calculate all performance technicals");
    calculateAllPerformanceTechnicals();
    console.timeEnd("calculate all performance technicals");
    console.log("Performance technicals calculated successfully.");
  });

// Update trade metrics command
program
  .command("update-trade-metrics")
  .description(
    "Update volatility contraction and consolidation quality metrics for trades that don't have them populated",
  )
  .action(() => {
    console.log("Updating trade metrics...");
    console.time("update trade metrics");
    const updatedCount = updateTradeMetrics();
    console.timeEnd("update trade metrics");
    console.log(`Updated ${updatedCount} trades with metrics successfully.`);
  });

// Populate BPR percentiles command
program
  .command("populate-bpr-percentiles")
  .description("Calculate and populate BPR percentiles table")
  .option(
    "-d, --date <date>",
    "Specific date to calculate percentiles for (format: YYYY-MM-DD)",
  )
  .action((options) => {
    console.log("Populating BPR percentiles...");
    console.time("populate bpr percentiles");

    if (options.date) {
      console.log(`Calculating percentiles for specific date: ${options.date}`);
    } else {
      console.log("Calculating percentiles for all dates");
    }

    populateBprPercentiles();
    console.timeEnd("populate bpr percentiles");
    console.log("BPR percentiles populated successfully.");
  });

// Sync to PostgreSQL command
program
  .command("sync-to-postgres")
  .description("Sync symbols, stock_info, and trades from SQLite to PostgreSQL")
  .action(async () => {
    console.log("Syncing symbols, stock_info, and trades to PostgreSQL...");
    console.time("sync to postgres");
    const results = await syncToPostgres();
    console.timeEnd("sync to postgres");
    console.log("Data synced to PostgreSQL successfully.");
    console.log("Records synced:");
    console.log(`  Symbols: ${results.symbols}`);
    console.log(`  Stock Info: ${results.stockInfo}`);
    console.log(`  Trades: ${results.trades}`);
    console.log(`  Total: ${results.total}`);
  });

// Reset charts and trades command
program
  .command("reset-charts")
  .description("Delete all chart files and clear the trades table")
  .action(() => {
    console.log("Resetting charts and trades...");

    // Delete all chart files
    console.log("Deleting chart files...");
    const chartsDir = "./charts";

    // Create charts directory if it doesn't exist
    if (!fs.existsSync(chartsDir)) {
      fs.mkdirSync(chartsDir, { recursive: true });
    }

    // Read all files in the charts directory
    const files = fs.readdirSync(chartsDir);

    // Delete each PNG file
    let deletedCount = 0;
    for (const file of files) {
      if (file.endsWith(".png")) {
        fs.unlinkSync(path.join(chartsDir, file));
        deletedCount++;
      }
    }
    console.log(`Deleted ${deletedCount} chart files.`);

    // Clear the trades table
    console.log("Clearing trades table...");
    try {
      const db = new Database("data.sqlite");
      db.exec("DELETE FROM trades");
      console.log("Trades table cleared successfully.");
    } catch (error) {
      console.error("Error clearing trades table:", error);
    }

    console.log("Reset completed successfully.");
  });

// Run all command
program
  .command("run-all")
  .description(
    "Run the entire process (reset DB, create tables, seed data, find setups, etc.)",
  )
  .option(
    "-m, --max-setups <number>",
    "Maximum number of setups to find per symbol",
    parseInt,
  )
  .option("-c, --code <code>", "Process a specific symbol code")
  .option("--no-charts", "Skip chart generation for faster processing")
  .action(async (options) => {
    const maxSetups = options.maxSetups || 0;
    if (maxSetups > 0) {
      console.log(`Limiting to ${maxSetups} setups per symbol`);
    }
    // Reset database
    const dbPath = process.env.DB_PATH || "./data.sqlite";

    if (fs.existsSync(dbPath)) {
      console.log(`Removing existing database file: ${dbPath}`);
      fs.unlinkSync(dbPath);
      console.log("Database file removed.");
    }

    // Check for and remove any SQLite journal files
    const dbDir = path.dirname(dbPath);
    const dbName = path.basename(dbPath);

    const shmPath = path.join(dbDir, `${dbName}-shm`);
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }

    const walPath = path.join(dbDir, `${dbName}-wal`);
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }

    // Create tables
    console.log("Creating tables...");
    console.time("createTables");
    createTables();
    console.timeEnd("createTables");

    // Seed data
    console.log("Seeding data...");
    console.time("seed data");

    if (options.code) {
      console.log(`Seeding data for specific symbol: ${options.code}`);
      await seed(options.code);
    } else {
      console.log("Seeding data for all symbols");
      await seed();
    }

    console.timeEnd("seed data");

    // Find setups
    console.log("Finding setups...");
    console.time("find setups");

    let codes: string[];
    let totalSetups = 0;
    let bar: any;
    if (options.code) {
      codes = [options.code];
      console.log(`Finding setups for specific symbol: ${options.code}`);
      const generateCharts = options.charts !== false;
      if (!generateCharts) {
        console.log("Chart generation disabled for faster processing");
      }
      try {
        const setupsFound = findSetups(options.code, maxSetups, generateCharts);
        totalSetups = setupsFound;
      } catch (e) {
        console.error(`Error processing ${options.code}:`, e);
      }
    } else {
      codes = getAllSymbolCodes();
      console.log(`Found ${codes.length} symbols to process`);

      // Create a progress bar
      bar = multibar.create(codes.length, 0, { task: "Finding setups" });

      totalSetups = 0;

      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        const generateCharts = options.charts !== false;
        try {
          const setupsFound = findSetups(code, maxSetups, generateCharts);
          totalSetups += setupsFound;
          bar.update(i + 1, {
            task: `Processed ${code} (${setupsFound} setups)`,
          });
        } catch (e) {
          console.error(`Error processing ${code}:`, e);
        }
        // wait 100ms between each code
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (!options.code) {
      bar.stop();
    }
    console.log(`Total setups found: ${totalSetups}`);
    console.timeEnd("find setups");

    // Create aggregate historical prices
    console.log("Creating aggregate historical prices...");
    console.time("create aggregate historical prices");
    createAggregateHistoricalPrices();
    console.timeEnd("create aggregate historical prices");

    // Calculate performance technicals
    console.log("Calculating performance technicals...");
    console.time("calculate all performance technicals");
    calculateAllPerformanceTechnicals();
    console.timeEnd("calculate all performance technicals");

    // Update trade metrics
    console.log("Updating trade metrics...");
    console.time("update trade metrics");
    const updatedCount = updateTradeMetrics();
    console.timeEnd("update trade metrics");
    console.log(`Updated ${updatedCount} trades with metrics successfully.`);

    // Populate BPR percentiles
    console.log("Populating BPR percentiles...");
    console.time("populate bpr percentiles");
    populateBprPercentiles();
    console.timeEnd("populate bpr percentiles");
    console.log("BPR percentiles populated successfully.");

    // Sync to PostgreSQL if POSTGRES_URL is set
    if (process.env.POSTGRES_URL) {
      console.log("Syncing symbols, stock_info, and trades to PostgreSQL...");
      console.time("sync to postgres");
      const syncResults = await syncToPostgres();
      console.timeEnd("sync to postgres");
      console.log(
        `Synced ${syncResults.total} records to PostgreSQL successfully.`,
      );
    } else {
      console.log("Skipping PostgreSQL sync (POSTGRES_URL not set)");
    }

    console.log("All processes completed successfully.");
  });

// Parse command line arguments
program.parse();

// If no arguments, show help
if (process.argv.length === 2) {
  program.help();
}
