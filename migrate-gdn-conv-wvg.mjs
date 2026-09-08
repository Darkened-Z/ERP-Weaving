import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
const { rows } = await client.execute("PRAGMA table_info(ext_godown_stock)");
const cols = rows.map((r) => r.name);
if (!cols.includes("conv_cont_wvg")) {
  await client.execute("ALTER TABLE ext_godown_stock ADD COLUMN conv_cont_wvg TEXT");
  console.log("added conv_cont_wvg");
} else {
  console.log("conv_cont_wvg already present");
}
client.close();
