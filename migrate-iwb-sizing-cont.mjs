import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
const { rows } = await client.execute("PRAGMA table_info(int_warped_beam_receiving)");
const cols = rows.map((r) => r.name);
if (!cols.includes("sizing_cont_no")) {
  await client.execute("ALTER TABLE int_warped_beam_receiving ADD COLUMN sizing_cont_no TEXT");
  console.log("added sizing_cont_no");
} else {
  console.log("sizing_cont_no already present");
}
client.close();
