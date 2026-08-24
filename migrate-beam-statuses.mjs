import { createClient } from "@libsql/client";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
for (const status of ["LOADED", "EMPTY"]) {
  await client.execute({ sql: "INSERT OR IGNORE INTO beam_statuses (status) VALUES (?)", args: [status] });
}
const { rows } = await client.execute("SELECT status FROM beam_statuses ORDER BY id");
console.log("beam_statuses:", rows.map((r) => r.status).join(", "));
client.close();
