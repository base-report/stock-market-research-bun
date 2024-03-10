import { createTables } from "./db/setup";
import { seed } from "./db/seed";

// Create tables
console.time("createTables");
createTables();
console.timeEnd("createTables");

// Seed data
console.time("seed data");
await seed();
console.timeEnd("seed data");
