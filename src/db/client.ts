import { Database } from "bun:sqlite";

const db = new Database(process.env.DB_PATH);

export { db };
