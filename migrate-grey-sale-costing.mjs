import { createClient } from "@libsql/client";
import path from "node:path";

// Costing chain on the Grey SALE contract: the woven construction (read/pick/
// width), the two grid cost subtotals, the conversion and selvage rates, and
// the total cost rate they add up to. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

async function addCol(table, col, type) {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  if (info.rows.some((r) => r.name === col)) {
    console.log(`  ${table}.${col} — exists`);
    return;
  }
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  console.log(`  + ${table}.${col} ${type}`);
}

const T = "ext_grey_sal_contract";
for (const [c, t] of [
  ["construction", "TEXT"],
  ["read", "INTEGER"],
  ["pick", "INTEGER"],
  ["width", "REAL"],
  ["warp_cost_per_mtr", "REAL"],
  ["weft_cost_per_mtr", "REAL"],
  ["conv_calculate", "REAL"],
  ["selvage_rate", "REAL"],
  ["total_cost_rate", "REAL"],
]) await addCol(T, c, t);

console.log("Done.");
client.close();
