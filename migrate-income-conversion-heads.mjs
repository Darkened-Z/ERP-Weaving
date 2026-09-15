import { createClient } from "@libsql/client";
import path from "node:path";

// Chart Of Accounts (WVG) page 25 — the INCOME - CONVERSION branch under
// 5.01.01.01. None of these five leaves existed here, yet the grey despatch
// already credits 5.01.01.01.0001 and packi parchi credits ...0006, so those
// postings were landing on codes with no account row behind them.
//
// Oracle skips 0004 on this page; the gap is kept deliberately.
//
// Also corrects two posting keys that pointed at the wrong leaf:
//   GST_OUTPUT   5.01.01.05.0005 (SALES OF JACQURAD) -> 5.01.01.01.0002 IGST
//   FURTHER_TAX  5.01.01.01.0002 (that same GST acct) -> 5.01.01.01.0003 IFST
// Neither has a single GL row yet, so nothing has to be reversed.
//
// Idempotent: every write is guarded on what is already there.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const PARENT = "5.01.01.01";

const ACCOUNTS = [
  { code: "5.01.01.01.0001", short: "ICWA", desc: 'INCOME - CONVERSION WEAVING' },
  { code: "5.01.01.01.0002", short: "IGST", desc: 'INCOME - GENERAL SALES TAX "GST"' },
  { code: "5.01.01.01.0003", short: "IFST", desc: "INCOME - FURTHER SALES TAX" },
  { code: "5.01.01.01.0005", short: "INCY", desc: "INCOME YARN" },
  { code: "5.01.01.01.0006", short: "INVG", desc: "INCOME GREY" },
];

const REMAP = [
  { key: "GST_OUTPUT", from: "5.01.01.05.0005", to: "5.01.01.01.0002" },
  { key: "FURTHER_TAX", from: "5.01.01.01.0002", to: "5.01.01.01.0003" },
];

const parent = await client.execute({
  sql: "SELECT code, level, description FROM chart_of_accounts WHERE code = ?",
  args: [PARENT],
});
if (parent.rows.length === 0) {
  throw new Error(`Parent head ${PARENT} is missing — refusing to create orphan leaves.`);
}
console.log(`Parent ${PARENT} — ${parent.rows[0].description} (level ${parent.rows[0].level})`);

for (const a of ACCOUNTS) {
  const existing = await client.execute({
    sql: "SELECT code, description FROM chart_of_accounts WHERE code = ?",
    args: [a.code],
  });
  if (existing.rows.length) {
    console.log(`  = ${a.code}  already present (${existing.rows[0].description})`);
    continue;
  }
  await client.execute({
    sql: `INSERT INTO chart_of_accounts (code, code_head, code_auto, level, description, desc_short, status)
          VALUES (?, ?, '0', 5, ?, ?, 'R')`,
    args: [a.code, PARENT, a.desc, a.short],
  });
  console.log(`  + ${a.code}  ${a.short}  ${a.desc}`);
}

for (const r of REMAP) {
  const row = await client.execute({
    sql: "SELECT acc_code FROM posting_accounts WHERE key = ?",
    args: [r.key],
  });
  const current = row.rows[0]?.acc_code;
  if (current === r.to) {
    console.log(`  = ${r.key} already -> ${r.to}`);
    continue;
  }
  if (current !== r.from) {
    console.log(`  ! ${r.key} is ${current}, expected ${r.from} — left alone`);
    continue;
  }
  const used = await client.execute({
    sql: "SELECT COUNT(*) n FROM trans_detail WHERE acc_code = ?",
    args: [r.from],
  });
  if (Number(used.rows[0].n) > 0) {
    console.log(`  ! ${r.key}: ${r.from} already carries ${used.rows[0].n} GL rows — left alone`);
    continue;
  }
  await client.execute({
    sql: "UPDATE posting_accounts SET acc_code = ?, updated_at = datetime('now') WHERE key = ?",
    args: [r.to, r.key],
  });
  console.log(`  ~ ${r.key}  ${r.from} -> ${r.to}`);
}

console.log("done");
process.exit(0);
