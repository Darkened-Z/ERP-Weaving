import { createClient } from "@libsql/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "data.db");
const client = createClient({ url: `file:${dbPath}` });

let created = 0;
let skipped = 0;
let errors = 0;

async function run(sql) {
  try {
    await client.execute(sql);
    console.log("OK:", sql.substring(0, 90));
    created++;
  } catch (e) {
    if (e.message?.includes("already exists") || e.message?.includes("duplicate column")) {
      console.log("SKIP:", sql.substring(0, 90));
      skipped++;
    } else {
      console.log("ERR:", e.message);
      errors++;
    }
  }
}

await client.execute("PRAGMA foreign_keys = ON");

await run(`CREATE TABLE IF NOT EXISTS int_daily_production (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_date TEXT NOT NULL,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  time TEXT,
  shed_no TEXT,
  folding_stock REAL,
  design_no TEXT,
  set_no TEXT,
  lot_no TEXT,
  tor_own TEXT,
  grade TEXT,
  remarks TEXT,
  prod_code TEXT,
  no_of_widths INTEGER,
  conv_cont_party TEXT,
  beam_cont_party TEXT,
  szg_party TEXT,
  product_quality TEXT,
  product_brand TEXT,
  product_slvag TEXT,
  shift_incharge_tm TEXT,
  shift_incharge_pm TEXT,
  shift_incharge_a TEXT,
  shift_incharge_b TEXT,
  shift_incharge_c TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_daily_production_set (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_id INTEGER NOT NULL REFERENCES int_daily_production(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  set_hash TEXT,
  mm_than_sr_no TEXT,
  a_count REAL,
  b_count REAL,
  c_count REAL,
  ppc_count REAL,
  total_count REAL,
  rej_count REAL,
  beam_set_no TEXT,
  k_s_m_type TEXT,
  k_s_m_date TEXT,
  beam_status TEXT,
  wast_wt_kg REAL,
  beam_no TEXT,
  ends INTEGER,
  b_length REAL,
  rcvd_mtr REAL,
  diff REAL,
  shrinkage REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS int_daily_production_detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  production_id INTEGER NOT NULL REFERENCES int_daily_production(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  detail_date TEXT,
  a_prod REAL,
  b_prod REAL,
  c_prod REAL,
  total_prod REAL,
  prod_cnt REAL,
  prod_diff REAL,
  prod_add_factor REAL
)`);

const indexes = [
  "CREATE INDEX IF NOT EXISTS ix_int_dp_date ON int_daily_production(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_dp_shed ON int_daily_production(shed_no)",
  "CREATE INDEX IF NOT EXISTS ix_int_dps_production ON int_daily_production_set(production_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_dpd_production ON int_daily_production_detail(production_id)",
];

for (const sql of indexes) {
  await run(sql);
}

console.log(`\nDaily Production migration: ${created} OK, ${skipped} skipped, ${errors} errors.`);
client.close();
