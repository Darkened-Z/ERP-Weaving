import { createClient } from "@libsql/client";
import path from "node:path";

// EDIT / FINAL on the grey despatch. FINAL (the default) locks the thans this
// voucher took back in daily production; EDIT releases them so production can be
// corrected, and the correction flows back into the despatch line. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const info = await client.execute("PRAGMA table_info(int_grey_despatch)");
if (info.rows.some((r) => r.name === "lock_state")) {
  console.log("  = lock_state already present");
} else {
  await client.execute("ALTER TABLE int_grey_despatch ADD COLUMN lock_state TEXT DEFAULT 'FINAL'");
  console.log("  + lock_state");
}
// Existing vouchers are finalised — their cloth has already gone.
const r = await client.execute("UPDATE int_grey_despatch SET lock_state = 'FINAL' WHERE lock_state IS NULL OR lock_state = ''");
console.log(`  ~ ${r.rowsAffected} existing voucher(s) set FINAL`);
console.log("done");
process.exit(0);
