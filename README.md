# Stock Market Research

A tool for analyzing stock market data, finding high-quality momentum breakout setups, and calculating performance metrics. The system focuses on identifying high tight flag patterns and other momentum consolidation breakouts using ADR-relative move detection and volatility contraction analysis.

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
   POSTGRES_URL=your_postgres_connection_string  # Optional: for PostgreSQL sync
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

# Seed data for a specific symbol (useful for fixing individual ticker errors)
bun run cli seed-data --code AAPL

# Find setups for all symbols
bun run cli find-setups

# Find setups for a specific symbol
bun run cli find-setups --code AAPL

# Find setups for a limited number of symbols
bun run cli find-setups --limit 10

# Limit the number of setups found per symbol (for testing)
bun run cli find-setups --max-setups 200

# Skip chart generation for faster processing
bun run cli find-setups --no-charts

# Use concurrent processing with 10 batches (default)
bun run cli find-setups --concurrent

# Use concurrent processing with custom number of batches
bun run cli find-setups --concurrent --batches 5

# Combine options
bun run cli find-setups --limit 50 --max-setups 10 --no-charts --concurrent

# Find setups using trend similarity to ideal pattern
bun run cli find-setups-by-trend

# Find trend similarity setups for a specific symbol
bun run cli find-setups-by-trend --code AAPL

# Find trend similarity setups for a limited number of symbols
bun run cli find-setups-by-trend --limit 10

# Limit the number of trend similarity setups found per symbol
bun run cli find-setups-by-trend --max-setups 200

# Skip chart generation for faster processing
bun run cli find-setups-by-trend --no-charts

# Use concurrent processing for trend similarity
bun run cli find-setups-by-trend --concurrent

# Combine trend similarity options
bun run cli find-setups-by-trend --limit 50 --max-setups 10 --no-charts --concurrent

# Create aggregate historical prices
bun run cli create-aggregate-prices

# Calculate performance technicals
bun run cli calculate-technicals

# Populate BPR percentiles
bun run cli populate-bpr-percentiles

# Sync data to PostgreSQL (requires POSTGRES_URL in .env)
bun run cli sync-to-postgres

# Clean up charts and clear trades table (preserves price data)
bun run cli cleanup

# Run the entire process (reset DB, create tables, seed data, find setups, etc.)
bun run cli run-all

# Run the entire process with a limit on setups per symbol
bun run cli run-all --max-setups 200

# Run the entire process with concurrent processing
bun run cli run-all --concurrent

# Run the entire process with concurrent processing and custom batch count
bun run cli run-all --concurrent --batches 5 --max-setups 200

# Run the entire process for a specific symbol only
bun run cli run-all --code AAPL

# Combine options
bun run cli run-all --code AAPL --max-setups 10
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

## Algorithm Overview

The system identifies high-quality momentum breakout setups using sophisticated multi-factor analysis designed to mimic discretionary swing trader decision-making:

### Prior Move Detection (ADR-Relative)

- **Significance Threshold**: Requires moves of at least **4x ADR** (Average Daily Range) instead of fixed percentages
  - Example: 3% ADR stock needs 12% move, 15% ADR stock needs 60% move
  - This ensures moves are significant relative to the stock's normal volatility
- **Lookback Period**: Maximum 30 days to search for prior moves (maintains recency)
- **Explosive Window**: Maximum 10 days for the actual move duration (ensures explosive momentum)
  - The move can occur anywhere within the 30-day lookback, but must complete within 10 days
  - Filters out slow, grinding moves in favor of sharp, explosive price action
- **Move Quality**: Minimum 60% directional efficiency (filters out choppy, back-and-forth moves)
- **Retracement Limit**: Maximum 50% retracement of the prior move during consolidation
  - Measured as percentage of total move, not percentage of high price
  - Ensures momentum is preserved during consolidation

### Consolidation Analysis

- **Duration**: 5-40 day consolidation periods (balances pattern development with momentum preservation)
- **Volatility Contraction**: Minimum 35% reduction in volatility during consolidation
- **Position Requirement**: Consolidation midpoint must be above prior move midpoint (maintains momentum bias)
- **Range Calculation**: Uses percentile-based bounds (10th-90th percentile) to capture "meat of the move"
- **Tightness**: Minimum 75% consolidation tightness threshold
- **Multi-Factor Quality Scoring**: Combines range quality, volatility contraction, density, volume pattern, and price action

### Volume and Liquidity Filters

- **Dollar Volume**: Minimum $1M daily dollar volume for tradeable liquidity
- **Volume Pattern**: Requires declining volume during consolidation (70% threshold)
- **Accumulation Signal**: Volume should decline as smart money accumulates

### Price Action Quality Filters

- **Gap Control**: Maximum 5% gaps during consolidation (filters erratic behavior)
- **Extension Limit**: Maximum 6% extension above prior high at entry
- **Price Action Score**: Minimum 65% clean price action (penalizes excessive wicks and gaps)
- **Overall Quality**: Minimum 60% combined quality score across all factors

### Breakout Confirmation

- **Entry Signal**: Breakout above consolidation upper bound (close or high > upper bound)
- **False Breakout Prevention**: Previous day must close within consolidation range
- **Timing**: Entry on first breakout day (no late entries after stock has already broken out)

### Exit Rules

- **Primary Exit**: Close below entry day's low (momentum failure)
- **Secondary Exit**: Close below 10-day SMA (trend deterioration)

## Process Flow

1. **Database Setup**: Create tables with unique constraints to prevent duplicates
2. **Data Seeding**:
   - Fetch exchange symbols and fundamentals
   - Download historical price data
3. **Setup Detection**:
   - Apply ADR-relative prior move detection
   - Identify high-quality consolidation patterns
   - Validate breakout conditions and generate entry signals
   - Create charts with consolidation range visualization
4. **Performance Analysis**:
   - Calculate technical indicators and BPR percentiles
   - Sync results to PostgreSQL for analysis
5. **Quality Control**: Duplicate prevention and data validation

---

This project was created using `bun init` in bun v1.0.30. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
