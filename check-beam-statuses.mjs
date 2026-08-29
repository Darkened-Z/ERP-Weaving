import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
console.log("Current beam_statuses rows:");
const r = await c.execute("SELECT * FROM beam_statuses");
r.rows.forEach(x => console.log(" ", JSON.stringify(x)));
console.log("\nCurrent beams.status_wrk distribution:");
const s = await c.execute("SELECT status_wrk, COUNT(*) as n FROM beams GROUP BY status_wrk");
s.rows.forEach(x => console.log(" ", JSON.stringify(x)));
