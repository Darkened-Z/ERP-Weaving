import { createClient } from "@libsql/client";
import path from "node:path";

// Batch identity for yarn. A purchase line is one batch — it carries its own
// rate, brand and godown — and a sale line records which batch it took, the way
// a grey despatch records which than it took.
//
// Backfills a batch number onto every existing purchase line so nothing is left
// without an identity: <voucher v_no>/<A, B, C ...> by line order, matching the
// than-serial convention already used in daily production. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

for (const [table, label] of [
  ["ext_yarn_pur_voucher_line", "purchase"],
  ["ext_yarn_sal_voucher_line", "sale"],
]) {
  const info = await client.execute(`PRAGMA table_info(${table})`);
  if (info.rows.some((r) => r.name === "batch_no")) {
    console.log(`  = ${label}: batch_no already present`);
  } else {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN batch_no TEXT`);
    console.log(`  + ${label}: batch_no`);
  }
}

const letter = (i) => {
  let s = "";
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
};

const lines = await client.execute(`
  SELECT l.id, l.voucher_id, v.v_no
  FROM ext_yarn_pur_voucher_line l
  JOIN ext_yarn_pur_voucher v ON v.id = l.voucher_id
  WHERE l.batch_no IS NULL OR l.batch_no = ''
  ORDER BY l.voucher_id, l.id
`);

let idx = new Map();
let n = 0;
for (const r of lines.rows) {
  const k = String(r.voucher_id);
  const i = idx.get(k) ?? 0;
  idx.set(k, i + 1);
  const batch = `${r.v_no}/${letter(i)}`;
  await client.execute({
    sql: "UPDATE ext_yarn_pur_voucher_line SET batch_no = ? WHERE id = ?",
    args: [batch, r.id],
  });
  console.log(`  ~ line ${r.id} -> ${batch}`);
  n++;
}
console.log(`done — ${n} purchase line(s) given a batch number`);
process.exit(0);
