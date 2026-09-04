import { createClient } from "@libsql/client";
import path from "node:path";

// Beam lifecycle statuses: LOADED (warped-beam receiving) → KNOTTING (knotting
// bill mounts the beam) → PRODUCTION (daily production). Adds the two new
// statuses to the beam_statuses master so the daily-production grid can apply them.
const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");
for (const status of ["KNOTTING", "PRODUCTION"]) {
  await client.execute({ sql: "INSERT OR IGNORE INTO beam_statuses (status) VALUES (?)", args: [status] });
}
const { rows } = await client.execute("SELECT status FROM beam_statuses ORDER BY id");
console.log("beam_statuses:", rows.map((r) => r.status).join(", "));
client.close();
