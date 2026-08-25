import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const TABLES = ["store_grn", "store_demands", "store_returns", "store_adjustments"];

const COLUMNS = [
  ["approval_status", "TEXT NOT NULL DEFAULT 'STORE'"],
  ["audited_by", "INTEGER"],
  ["audited_at", "TEXT"],
  ["posted_by", "INTEGER"],
  ["posted_at", "TEXT"],
];

for (const table of TABLES) {
  const { rows } = await client.execute(`PRAGMA table_info(${table})`);
  if (!rows.length) {
    console.log(`SKIP ${table} (table missing)`);
    continue;
  }
  for (const [col, def] of COLUMNS) {
    if (!rows.some((r) => r.name === col)) {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`added ${table}.${col}`);
    } else {
      console.log(`${table}.${col} ok`);
    }
  }
}

client.close();
