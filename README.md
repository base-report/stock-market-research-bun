# Stock Market Research

A tool for analyzing stock market data, finding setups, and calculating performance metrics.

## Setup

1. Make sure you have [Bun](https://bun.sh/) installed
2. Install dependencies:
   ```bash
   bun install
   ```
3. Create a `.env` file with the following variables:
   ```
   DB_PATH='./data.sqlite'
   EODHD_API_BASE_URL=https://eodhd.com/api
   EODHD_API_TOKEN=your_api_token
   ```

## CLI Usage

The application provides a CLI for various operations:

```bash
# Show help
bun run cli

# Reset the database (delete existing database file)
bun run cli reset-db

# Create database tables
bun run cli create-tables

# Seed the database with data
bun run cli seed-data

# Find setups for all symbols
bun run cli find-setups

# Find setups for a specific symbol
bun run cli find-setups --code AAPL

# Find setups for a limited number of symbols
bun run cli find-setups --limit 10

# Create aggregate historical prices
bun run cli create-aggregate-prices

# Calculate performance technicals
bun run cli calculate-technicals

# Run the entire process (reset DB, create tables, seed data, find setups, etc.)
bun run cli run-all
```

You can also use the npm scripts:

```bash
# Run the CLI
bun run cli

# Reset the database and run the entire process
bun run reset-db
```

## Development

```bash
# Run the application
bun run dev

# Run tests
bun run test
```

## Database Structure

The application uses SQLite for data storage. The database contains the following tables:

- `symbols`: Stock symbols and basic information
- `stock_info`: Detailed information about stocks
- `historical_prices`: Historical price data for each symbol
- `aggregate_historical_prices`: Aggregated historical price data
- `trades`: Trade setups identified by the application
- `performance_technicals`: Technical indicators for performance analysis
- `bpr_percentiles`: BPR (Bull Power Rating) percentiles

## Process Flow

1. Create database tables
2. Seed data:
   - Fetch exchange symbols
   - Fetch stock fundamentals
   - Fetch historical prices
3. Find setups for each symbol
4. Create aggregate historical prices
5. Calculate performance technicals

---

This project was created using `bun init` in bun v1.0.30. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
