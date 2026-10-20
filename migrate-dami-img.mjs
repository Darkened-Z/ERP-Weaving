import { createClient } from "@libsql/client";
import path from "node:path";

// The Dami slip carries the receipt (wasooli) photo of the goods sent out.
// Same column as every other image field: a data URL, or a JSON array of them.
// Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
const info = await client.execute("PRAGMA table_info(int_grey_despatch_dami)");
if (info.rows.some((r) => r.name === "img")) {
  console.log("  = img already present");
} else {
  await client.execute("ALTER TABLE int_grey_despatch_dami ADD COLUMN img TEXT");
  console.log("  + img");
}
console.log("done");
process.exit(0);
