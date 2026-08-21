import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

async function addCol(table, col, type) {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  if (info.rows.some((r) => r.name === col)) {
    console.log(`  ${table}.${col} — exists`);
    return;
  }
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
  console.log(`  + ${table}.${col} ${type}`);
}

// Columns added for 1:1 Oracle fidelity fixes
const cols = [
  ["int_daily_production_set", "cp_count", "REAL"],
  ["int_grey_despatch", "lb_mtr", "REAL"],
  ["int_grey_despatch", "driver", "TEXT"],
  ["int_grey_despatch_update_count", "cost_per_mtr", "REAL"],
  ["int_knotting_sarning_line", "set_no", "TEXT"],
  ["int_knotting_sarning_line", "beam_no", "TEXT"],
  ["inventory_opening", "than", "REAL"],
  ["inventory_opening", "rejection", "REAL"],
  ["inventory_opening", "net_mtr", "REAL"],
  ["inventory_opening", "set_no", "TEXT"],
  ["inventory_opening", "beam_set_no", "TEXT"],
  ["inventory_opening", "beam_no", "TEXT"],
  ["inventory_opening", "wrp_cont", "TEXT"],
  ["inventory_opening", "warp_sizing_party", "TEXT"],
  ["inventory_opening", "conv_party", "TEXT"],
];

console.log(url ? "Target: TURSO" : "Target: local data.db");
for (const [t, c, ty] of cols) await addCol(t, c, ty);
console.log("Done.");
client.close();
