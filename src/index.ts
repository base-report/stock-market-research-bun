import { createTables } from "./db/setup";
import { seed } from "./db/seed";
import { findSetups } from "./db/findSetups";

// // Create tables
// console.time("createTables");
// createTables();
// console.timeEnd("createTables");
//
// // Seed data
// console.time("seed data");
// await seed();
// console.timeEnd("seed data");

// Find setups
console.time("find setups");
findSetups();
console.timeEnd("find setups");
