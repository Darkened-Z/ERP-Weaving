import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
const info = await client.execute("PRAGMA table_info(beams)");
if (info.rows.some((r) => r.name === "set_no")) {
  console.log("  beams.set_no — exists");
} else {
  await client.execute("ALTER TABLE beams ADD COLUMN set_no TEXT");
  console.log("  + beams.set_no TEXT");
}
client.close();
