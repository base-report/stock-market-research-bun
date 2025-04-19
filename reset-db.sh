#!/bin/bash

# Script to reset the database and run the seeding process

# Make the CLI executable
chmod +x src/cli.ts

# Run the CLI with the run-all command
echo "Running the full database reset and seeding process..."
bun run src/cli.ts run-all

echo "Database reset and seeding process completed."
