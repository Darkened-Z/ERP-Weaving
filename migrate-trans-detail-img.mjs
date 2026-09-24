import { createClient } from "@libsql/client";
import path from "node:path";

// A picture per voucher LINE. trans_main has carried one for the voucher as a
// whole; the mill attaches a slip to the individual entry, so the column moves
// down to the detail row. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
const info = await client.execute("PRAGMA table_info(trans_detail)");
if (info.rows.some((r) => r.name === "img")) {
  console.log("  = img already present");
} else {
  await client.execute("ALTER TABLE trans_detail ADD COLUMN img TEXT");
  console.log("  + img");
}
console.log("done");
process.exit(0);
