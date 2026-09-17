import { createClient } from "@libsql/client";
import path from "node:path";

// EDIT / FINAL on the yarn sale voucher, mirroring the grey despatch. FINAL
// locks the purchase batches this sale consumed; EDIT releases them so the
// purchase can be corrected. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const info = await client.execute("PRAGMA table_info(ext_yarn_sal_voucher)");
if (info.rows.some((r) => r.name === "lock_state")) {
  console.log("  = lock_state already present");
} else {
  await client.execute("ALTER TABLE ext_yarn_sal_voucher ADD COLUMN lock_state TEXT DEFAULT 'FINAL'");
  console.log("  + lock_state");
}
const r = await client.execute(
  "UPDATE ext_yarn_sal_voucher SET lock_state = 'FINAL' WHERE lock_state IS NULL OR lock_state = ''",
);
console.log(`  ~ ${r.rowsAffected} existing sale voucher(s) set FINAL`);
console.log("done");
process.exit(0);
