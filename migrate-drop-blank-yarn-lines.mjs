import { createClient } from "@libsql/client";
import path from "node:path";

// Remove the blank yarn voucher lines that were saved because the godown
// auto-fills on every row of the grid.
//
// A line with no count, no quantity and no rate carries nothing; it exists only
// because the row had a despatch party in it, and each save added another
// batch letter to the pile. One voucher had grown to ten lines with one real
// one among them.
//
// Only lines that are blank AND have never been sold against are removed, so a
// batch a sale points at can never be taken out from under it. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

for (const [table, qtyCol] of [
  ["ext_yarn_pur_voucher_line", "lbs"],
  ["ext_yarn_sal_voucher_line", "lbs"],
]) {
  const blank = await client.execute(
    `SELECT id, batch_no FROM ${table}
     WHERE (count IS NULL OR TRIM(count) = '')
       AND COALESCE(${qtyCol}, 0) = 0
       AND COALESCE(rate, 0) = 0`,
  );
  if (blank.rows.length === 0) {
    console.log(`  = ${table}: nothing blank`);
    continue;
  }
  const sold = new Set(
    (
      await client.execute(
        "SELECT DISTINCT batch_no FROM ext_yarn_sal_voucher_line WHERE batch_no IS NOT NULL AND COALESCE(lbs,0) > 0",
      )
    ).rows.map((r) => String(r.batch_no)),
  );
  const removable = blank.rows.filter((r) => !sold.has(String(r.batch_no ?? "")));
  for (const r of removable) {
    await client.execute({ sql: `DELETE FROM ${table} WHERE id = ?`, args: [r.id] });
  }
  console.log(
    `  - ${table}: ${removable.length} blank line(s) removed` +
      (removable.length < blank.rows.length
        ? `, ${blank.rows.length - removable.length} kept (sold against)`
        : ""),
  );
}

const left = await client.execute(
  "SELECT batch_no, count, lbs, rate FROM ext_yarn_pur_voucher_line ORDER BY id",
);
console.log(`\npurchase lines now: ${left.rows.length}`);
for (const r of left.rows) console.log(`  ${r.batch_no}  cnt ${r.count}  lbs ${r.lbs}  rate ${r.rate}`);
process.exit(0);
