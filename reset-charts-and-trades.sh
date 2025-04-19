#!/bin/bash

# Print header
echo "====================================="
echo "Resetting Charts and Trades Database"
echo "====================================="

# Create charts directory if it doesn't exist
mkdir -p charts

# Delete all files in the charts directory
echo "Deleting all chart files..."
rm -f charts/*.png
echo "✓ All chart files deleted"

# Clear the trades table using SQLite
echo "Clearing trades table from database..."
sqlite3 data.sqlite "DELETE FROM trades;"
echo "✓ Trades table cleared"

echo "Reset complete!"
