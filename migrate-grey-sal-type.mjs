import { createClient } from "@libsql/client";
import path from "node:path";

// Grey sale contracts are INT (internal) or EXT (external). Every contract so
// far is internal, which is the default. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
const info = await client.execute("PRAGMA table_info(ext_grey_sal_contract)");
if (info.rows.some((r) => r.name === "contract_type")) {
  console.log("  = contract_type already present");
} else {
  await client.execute("ALTER TABLE ext_grey_sal_contract ADD COLUMN contract_type TEXT NOT NULL DEFAULT 'INT'");
  console.log("  + contract_type (default INT)");
}
console.log("done");
process.exit(0);
