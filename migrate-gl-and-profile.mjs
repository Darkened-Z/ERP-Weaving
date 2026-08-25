import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const ADD = [
  ["company_profile", "email", "TEXT"],
  ["company_profile", "ntn", "TEXT"],
  ["company_profile", "gst_no", "TEXT"],
  ["company_profile", "logo_data_url", "TEXT"],
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

await client.execute(`
  CREATE TABLE IF NOT EXISTS posting_accounts (
    key TEXT PRIMARY KEY,
    acc_code TEXT NOT NULL,
    label TEXT NOT NULL,
    vtype TEXT,
    updated_at TEXT
  )
`);

// Seed default posting accounts from Oracle SAVE_ACC blocks. Editable via
// /settings/posting-accounts once the page ships.
const DEFAULTS = [
  ["GREY_SALE_INCOME", "5.01.01.01.0001", "Grey Sale / Conversion Income", "GDP"],
  ["YARN_SALE_INCOME", "5.01.01.01.0005", "Yarn Sale Income", "YSV"],
  ["GREY_COMMISSION_INCOME", "5.01.01.01.0006", "Grey Commission Income", "GPV"],
  ["GST_OUTPUT", "5.01.01.05.0005", "GST Output (Sales Tax)", null],
  ["FURTHER_TAX", "5.01.01.01.0002", "Further Tax", null],
  ["FURTHER_ADJ", "5.01.01.01.0003", "Further Adj / Withholding", null],
  ["YARN_PURCHASE_STOCK", "7.05.01.01.0020", "Yarn Purchase / Stock", "YPV"],
  ["WARPING_SIZING_EXP", "7.05.01.01.0047", "Warping / Sizing Expense", "EXT"],
  ["PARTS_STOCK", "1.01.25.16.0001", "Parts Stock (Asset)", null],
  ["PARTS_CONSUMPTION", "7.01.07.01.0006", "Parts Consumption Expense", "SV"],
  ["PARTS_STOCK_EXP", "7.05.01.01.0053", "Parts Stock / Consumption", "PV"],
  ["ADJUSTMENT_LOSS", "7.05.01.01.0033", "Shrinkage / Adjustment Loss", "ADJ"],
  ["KNOTTING_EXP", "7.01.06.01.0001", "Knotting Expense", "KB"],
  ["SARNING_EXP", "7.01.06.01.0002", "Sarning Expense", "KB"],
  ["MAROORI_EXP", "7.01.06.01.0003", "Maroori Expense", "KB"],
  ["ADVANCE_CLEARING", "7.05.10.0001", "Advance Clearing", null],
  ["DEFAULT_DEBTOR", "1.01.25.01.0001", "Default Debtor Fallback", null],
];

for (const [key, code, label, vtype] of DEFAULTS) {
  await client.execute({
    sql: `INSERT INTO posting_accounts (key, acc_code, label, vtype, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(key) DO NOTHING`,
    args: [key, code, label, vtype],
  });
}

console.log("posting_accounts seeded (existing rows preserved)");
client.close();
