import { createClient } from "@libsql/client";
import path from "node:path";

// Warp/weft settings for the Grey SALE contract — the sale contract carries the
// same woven construction the conversion contract does, so it gets the same two
// child tables. Idempotent: CREATE TABLE IF NOT EXISTS.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const cols = `
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES ext_grey_sal_contract(id) ON DELETE CASCADE,
    sr_no INTEGER NOT NULL,
    count TEXT,
    descr TEXT,
    brand TEXT,
    cal_count REAL,
    ends INTEGER,
    wt_per_mtr REAL,
    rate_per_lbs REAL,
    cost_per_mtr REAL`;

for (const [table, ix] of [
  ["ext_grey_sal_contract_warp", "ix_ext_gscw_contract"],
  ["ext_grey_sal_contract_weft", "ix_ext_gscf_contract"],
]) {
  await client.execute(`CREATE TABLE IF NOT EXISTS ${table} (${cols})`);
  await client.execute(`CREATE INDEX IF NOT EXISTS ${ix} ON ${table}(contract_id)`);
  console.log(`  * ${table} ensured`);
}

console.log("Done.");
client.close();
