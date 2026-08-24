import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
const { rows } = await client.execute("PRAGMA table_info(ext_yarn_pur_voucher)");
const cols = rows.map((r) => r.name);
if (!cols.includes("due_date")) {
  await client.execute("ALTER TABLE ext_yarn_pur_voucher ADD COLUMN due_date TEXT");
  console.log("added due_date");
} else {
  console.log("due_date already present");
}
client.close();
