import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const exists = await c.execute("SELECT id FROM beam_statuses WHERE status = 'CLOSE'");
if (!exists.rows.length) {
  await c.execute({ sql: "INSERT INTO beam_statuses (status) VALUES (?)", args: ["CLOSE"] });
  console.log("+ CLOSE added");
}
const r = await c.execute("SELECT * FROM beam_statuses ORDER BY id");
console.log("Beam statuses:", r.rows.map(x => x.status).join(", "));
