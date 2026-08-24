import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const ADD = [
  ["ext_yarn_sal_voucher", "broker", "TEXT"],
  ["ext_yarn_sal_voucher", "due_date", "TEXT"],
  ["ext_yarn_sal_voucher", "status_ok", "TEXT"],
  ["ext_yarn_pur_voucher", "status_ok", "TEXT"],
  ["ext_yarn_pur_contract", "qty_lbs", "REAL"],
  ["ext_yarn_sal_contract", "qty_lbs", "REAL"],
  ["ext_godown_stock", "status_ok", "TEXT"],
  ["ext_godown_stock", "due_date", "TEXT"],
  ["ext_kachi_parchi", "due_date", "TEXT"],
  ["ext_kachi_parchi", "pp_vno", "TEXT"],
  ["ext_kachi_parchi_line", "gdn_line_id", "INTEGER"],
  ["ext_packi_parchi", "due_date", "TEXT"],
  ["ext_packi_parchi", "kp_id", "INTEGER"],
  ["ext_grey_conv_contract", "conv_rate_per_mtr", "REAL"],
  ["ext_grey_conv_contract", "gray_rate_per_mtr", "REAL"],
  ["int_grey_conversion_contract", "conv_rate_per_mtr", "REAL"],
  ["int_grey_conversion_contract", "gray_rate_per_mtr", "REAL"],
  ["looms", "forman", "TEXT"],
  ["trans_detail", "status_ok", "TEXT"],
  ["chart_parts", "location", "TEXT"],
  ["store_grn", "supplier_code", "TEXT"],
  ["int_daily_production_set", "dlv_status", "TEXT"],
  ["int_beam_contract_ext_ws", "converter_party", "TEXT"],
  ["int_beam_contract_ext_ws", "wrp_code", "TEXT"],
  ["int_beam_contract_ext_ws", "no_of_width", "REAL"],
  ["int_beam_contract_ext_ws", "prd_code", "TEXT"],
  ["int_beam_contract_ext_ws", "vtype", "TEXT"],
  ["int_beam_contract_ext_ws", "ends", "REAL"],
  ["int_beam_contract_ext_ws", "wt_per_mtr", "REAL"],
];

for (const [table, col, type] of ADD) {
  const { rows } = await client.execute(`PRAGMA table_info(${table})`);
  if (!rows.length) {
    console.log(`SKIP ${table} (table missing)`);
    continue;
  }
  if (!rows.some((r) => r.name === col)) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
    console.log(`added ${table}.${col}`);
  } else {
    console.log(`${table}.${col} ok`);
  }
}

const TABLES = [
  `CREATE TABLE IF NOT EXISTS store_grn_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grn_id INTEGER NOT NULL REFERENCES store_grn(id) ON DELETE CASCADE,
    sr_no INTEGER NOT NULL,
    part_code TEXT NOT NULL,
    qty REAL NOT NULL,
    rate_bill REAL,
    disc_per REAL,
    tax_per REAL,
    rate REAL NOT NULL,
    amount REAL NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ix_store_grn_detail_grn ON store_grn_detail(grn_id)`,
  `CREATE INDEX IF NOT EXISTS ix_store_grn_detail_part ON store_grn_detail(part_code)`,
  `CREATE TABLE IF NOT EXISTS store_demand_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    demand_id INTEGER NOT NULL REFERENCES store_demands(id) ON DELETE CASCADE,
    sr_no INTEGER NOT NULL,
    part_code TEXT NOT NULL,
    qty REAL NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL,
    cc_code TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS ix_store_demand_detail_demand ON store_demand_detail(demand_id)`,
  `CREATE INDEX IF NOT EXISTS ix_store_demand_detail_part ON store_demand_detail(part_code)`,
  `CREATE TABLE IF NOT EXISTS store_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_no INTEGER NOT NULL,
    fy_code TEXT NOT NULL,
    return_date TEXT NOT NULL,
    department TEXT NOT NULL,
    returned_by TEXT,
    item_count INTEGER,
    total_amount REAL,
    remarks TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_store_returns_fy_no ON store_returns(fy_code, return_no)`,
  `CREATE TABLE IF NOT EXISTS store_return_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL REFERENCES store_returns(id) ON DELETE CASCADE,
    sr_no INTEGER NOT NULL,
    part_code TEXT NOT NULL,
    qty REAL NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ix_store_return_detail_return ON store_return_detail(return_id)`,
  `CREATE INDEX IF NOT EXISTS ix_store_return_detail_part ON store_return_detail(part_code)`,
  `CREATE TABLE IF NOT EXISTS int_beam_contract_ext_ws_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL REFERENCES int_beam_contract_ext_ws(id) ON DELETE CASCADE,
    sr_no INTEGER NOT NULL,
    count_code TEXT,
    brand TEXT,
    cal_count REAL,
    ends REAL,
    wt_per_mtr REAL
  )`,
  `CREATE INDEX IF NOT EXISTS ix_int_bcewd_contract ON int_beam_contract_ext_ws_detail(contract_id)`,
];

for (const sqlStmt of TABLES) {
  await client.execute(sqlStmt);
}
console.log("store detail tables ensured");

client.close();
