import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const TABLES = [
  `CREATE TABLE IF NOT EXISTS end_of_day_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    img_date TEXT NOT NULL,
    category TEXT,
    img TEXT NOT NULL,
    remarks TEXT,
    uploaded_by INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ix_eod_img_date ON end_of_day_images(img_date)`,
  `CREATE TABLE IF NOT EXISTS store_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adj_no INTEGER NOT NULL,
    fy_code TEXT NOT NULL,
    adj_date TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'ADJ',
    remarks TEXT,
    item_count INTEGER,
    total_value REAL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_store_adj_fy_no ON store_adjustments(fy_code, adj_no)`,
  `CREATE TABLE IF NOT EXISTS store_adjustment_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adj_id INTEGER NOT NULL REFERENCES store_adjustments(id) ON DELETE CASCADE,
    sr_no INTEGER NOT NULL,
    part_code TEXT NOT NULL,
    qty REAL NOT NULL,
    rate REAL NOT NULL,
    amount REAL NOT NULL,
    reason TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS ix_store_adj_detail_adj ON store_adjustment_detail(adj_id)`,
  `CREATE INDEX IF NOT EXISTS ix_store_adj_detail_part ON store_adjustment_detail(part_code)`,
  `CREATE TABLE IF NOT EXISTS period_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fy_code TEXT NOT NULL,
    module TEXT NOT NULL,
    locked_through TEXT NOT NULL,
    locked_by INTEGER,
    locked_at TEXT NOT NULL,
    remarks TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ux_period_locks_fy_module ON period_locks(fy_code, module)`,
];

for (const sqlStmt of TABLES) {
  await client.execute(sqlStmt);
}
console.log("all tables ensured");
client.close();
