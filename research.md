# Breakout Setup Research

## Purpose

This research project aims to programmatically identify stock breakout setups and analyze their subsequent price action, with a specific focus on the follow-through of momentum breakout setups after entry. By systematically identifying and cataloging these setups, we can:

1. Analyze how stocks move after a breakout entry point
2. Quantify the follow-through performance metrics (maximum gain, time to maximum gain)
3. Identify patterns in post-breakout behavior to refine sell rules
4. Examine potential correlations between follow-through performance and market environment

The primary goal is to develop more effective exit strategies based on empirical data about how stocks typically behave after breaking out of consolidation patterns.

## Methodology

### Setup Identification

We use two different algorithms to identify potential breakout setups, each with its own approach and criteria:

#### Algorithm 1: Original Trendline Breakout Method (findSetups.ts)

This method identifies potential breakout setups using the following precise criteria:

1. **Prior Move Detection**: We look for stocks that have made a significant upward move (at least 30% or more) from a recent low to a high point.

2. **Consolidation Phase**: After the upward move, we identify periods where the stock consolidates in a relatively tight range. This consolidation is characterized by:

   - A defined upper and lower bound forming a channel
   - A duration ranging between 2 and 10 weeks (10-50 trading days)
   - Measurable volatility contraction (quantified in the database)
   - A quality score (0-100) based on how well the price action respects the consolidation boundaries

3. **Breakout Point**: We identify the point where the price breaks above the upper bound of the consolidation range, signaling a potential continuation of the prior uptrend.

4. **Entry Criteria**: We ensure the breakout is valid by checking that the breakout day's close exceeds the upper bound or the high exceeds it by at least 1%

#### Algorithm 2: Momentum Breakout Method (findSetupsByAuggie.ts)

This alternative approach focuses on identifying high-quality momentum breakout setups using volatility-adjusted criteria and strict consolidation quality filters:

1. **Prior Move Detection**:

   - Searches for explosive upward moves within a concentrated timeframe
   - Requires moves to be at least 5x the stock's Average Daily Range (ADR) to ensure significance relative to the stock's normal volatility
   - Looks back up to 60 days to find qualifying moves, prioritizing the strongest move found

2. **Base Building Analysis**:

   - Identifies consolidation periods between 5-20 trading days following the prior move
   - Limits retracement to maximum 50% of the prior move's range to maintain momentum characteristics
   - Applies strict sideways movement validation using multiple quality metrics:
     - **Net Movement Filter**: Rejects consolidations with more than 3% net directional movement from start to end
     - **Trend Consistency**: Ensures the first and second halves of the consolidation don't show excessive trending (max 3% difference)
     - **Flatness Score**: Requires minimum 87% flatness score based on price consistency around the average

3. **Breakout Validation**:

   - Requires breakout strength of at least 0.5x ADR (volatility-adjusted minimum move)
   - Validates that price breaks above the consolidation's upper bound
   - Limits extension to maximum 3.0x ADR above resistance to avoid late entries while allowing for stronger momentum moves
   - No volume requirements - focuses purely on price action and momentum

4. **Quality Filters**:
   - Minimum $10M daily dollar volume for liquidity
   - Maximum 30% ADR to avoid overly erratic stocks
   - No minimum price filter due to split-adjusted historical data

**Key Advantages of This Method**:

- **Volatility-Adjusted**: All criteria scale with each stock's normal volatility patterns
- **Quality-Focused**: Strict consolidation filters ensure true sideways movement rather than trending patterns
- **Momentum-Preserved**: Base building requirements maintain the explosive character of the prior move
- **Concentrated Power**: Emphasis on moves that happen within shorter timeframes for maximum impact

### Performance Tracking

For each identified setup, we track the following metrics with a focus on post-breakout behavior:

1. **Entry Details**: Price, date, and market conditions at entry
2. **Maximum Gain Data**:
   - Highest price reached after entry
   - Date when the highest price occurred
   - Number of trading days from entry to highest price
3. **Exit Details**: Price, date, and reason for exit
4. **Performance Metrics**:
   - Actual gain/loss percentage from entry to exit
   - Maximum potential gain percentage (from entry to highest price)
   - Unrealized gain percentage (difference between exit and highest price)

## Data Structure

### PostgreSQL Database

The research data is stored in a PostgreSQL database with the following key tables:

#### 1. `symbols`

Contains basic information about each stock symbol:

- `code`: Stock ticker symbol (primary key)
- `name`: Company name
- `exchange`: Stock exchange
- `isin`: International Securities Identification Number

#### 2. `stock_info`

Contains detailed information about each company:

- `code`: Stock ticker symbol (foreign key to symbols)
- `sector`, `industry`, `gic_sector`, etc.: Industry classification
- `description`: Company description
- `web_url`: Company website
- `ipo_date`: Initial public offering date
- Other company metadata

#### 3. `trades`

Contains detailed information about each identified breakout setup:

- `id`: Unique identifier for the trade
- `code`: Stock ticker symbol
- **Prior Move Data**:
  - `prior_move_low_date`: Date of the low point before the upward move
  - `prior_move_high_date`: Date of the high point after the upward move
  - `prior_move_pct`: Percentage increase from low to high
- **Consolidation Data**:
  - `consolidation_slope`: Slope of the consolidation trend
  - `consolidation_days`: Duration of the consolidation in trading days
  - `consolidation_start_date`: Start date of the consolidation
  - `consolidation_end_date`: End date of the consolidation
  - `volatility_contraction`: Measure of decreasing volatility during consolidation
  - `consolidation_quality`: Quality score of the consolidation pattern
- **Entry Data**:
  - `entry_price`: Price at entry
  - `entry_date`: Date of entry
  - `entry_trendline_break_price`: Price at which the trendline was broken
  - `entry_adr_pct`: Average daily range percentage at entry
  - `entry_dollar_volume`: Dollar volume at entry
- **Performance Data**:
  - `highest_price`: Highest price reached after entry
  - `highest_price_date`: Date of the highest price
  - `highest_price_days`: Days from entry to highest price
  - `exit_price`: Price at exit
  - `exit_date`: Date of exit
  - `exit_reason`: Reason for exit
  - `exit_days`: Days from entry to exit
- **Performance Metrics**:
  - `gain_pct`: Percentage gain/loss from entry to exit
  - `max_possible_gain_pct`: Maximum potential gain percentage
  - `unrealized_gain_pct_from_exit`: Percentage difference between exit and highest price

### Chart Images

For each identified setup, we generate a chart image that visualizes:

1. The prior upward move
2. The consolidation phase with upper and lower bounds
3. The breakout point and entry
4. The subsequent price action and exit

These charts are stored as PNG files with the naming convention:
`{symbol}-{entry_date}-{exit_date}.png`

## Analysis Focus

The primary focus of the analysis should be on understanding post-breakout behavior patterns to help refine exit strategies. Key areas to investigate include:

1. **Post-Breakout Price Movement Patterns**:

   - How quickly do stocks typically reach their maximum gain after breaking out?
   - Are there common patterns in the price action after breakout?

2. **Market Environment Correlation**:

   - Does the market environment at the time of breakout correlate with follow-through performance?
   - Are there differences in follow-through during different market conditions?

3. **Time-Based Patterns**:
   - Is there an optimal holding period for breakout trades based on the data?
   - Can we identify early warning signs that a breakout is failing or succeeding?

## Conclusion

This research aims to provide data-driven insights into how stocks behave after breaking out of consolidation patterns. By analyzing the follow-through performance metrics in the PostgreSQL database and examining the chart images, we hope to develop more effective exit strategies based on empirical evidence rather than subjective rules.

The ultimate goal is to understand the typical post-breakout behavior patterns and their relationship to market conditions, which will help refine our sell rules and potentially improve overall trading performance.
