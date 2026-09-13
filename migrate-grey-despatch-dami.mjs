import { createClient } from "@libsql/client";
import path from "node:path";

// Backfills the columns and the line table for the Grey Cloth Despatch Dami
// page. The live DB was still on the original 13-column skeleton — the page
// query includes twenty extra columns (parties, contract, quality, rates,
// broker/term/printing) and the piece-level line table, so opening the page
// blew up with `no such column: pakki_parchi_id`. Idempotent: each column is
// added only if missing, and the line table is CREATE IF NOT EXISTS.

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

const cols = [
  ["int_grey_despatch_dami", "pakki_parchi_id", "INTEGER"],
  ["int_grey_despatch_dami", "purchase_party", "TEXT"],
  ["int_grey_despatch_dami", "sale_party", "TEXT"],
  ["int_grey_despatch_dami", "sub_party", "TEXT"],
  ["int_grey_despatch_dami", "cont_no", "TEXT"],
  ["int_grey_despatch_dami", "sal_date", "TEXT"],
  ["int_grey_despatch_dami", "dsp_quality", "TEXT"],
  ["int_grey_despatch_dami", "dsp_quality_desc", "TEXT"],
  ["int_grey_despatch_dami", "width", "REAL"],
  ["int_grey_despatch_dami", "product", "TEXT"],
  ["int_grey_despatch_dami", "product_desc", "TEXT"],
  ["int_grey_despatch_dami", "rate", "REAL"],
  ["int_grey_despatch_dami", "rate_per", "REAL"],
  ["int_grey_despatch_dami", "rate_sal", "REAL"],
  ["int_grey_despatch_dami", "printing_name", "TEXT"],
  ["int_grey_despatch_dami", "printing_location", "TEXT"],
  ["int_grey_despatch_dami", "broker_name", "TEXT"],
  ["int_grey_despatch_dami", "term", "TEXT"],
  ["int_grey_despatch_dami", "posted_by", "TEXT"],
];

for (const [t, c, ty] of cols) await addCol(t, c, ty);

await client.execute(`
  CREATE TABLE IF NOT EXISTS int_grey_despatch_dami_line (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dami_id INTEGER NOT NULL REFERENCES int_grey_despatch_dami(id) ON DELETE CASCADE,
    sr_no INTEGER NOT NULL,
    than INTEGER NOT NULL DEFAULT 1,
    mtrs REAL
  )
`);
await client.execute(`CREATE INDEX IF NOT EXISTS ix_int_gddl_dami ON int_grey_despatch_dami_line(dami_id)`);
console.log("  * int_grey_despatch_dami_line ensured");

await client.execute(`CREATE INDEX IF NOT EXISTS ix_int_gdd_date ON int_grey_despatch_dami(v_date)`);
await client.execute(`CREATE INDEX IF NOT EXISTS ix_int_gdd_original ON int_grey_despatch_dami(original_despatch_id)`);
console.log("  * indexes ensured");

console.log("Done.");
client.close();
