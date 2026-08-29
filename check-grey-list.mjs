import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const r = await c.execute("SELECT code, description, reed, pick, width FROM grey_construction WHERE status='A' ORDER BY code LIMIT 20");
console.log(`Grey constructions (first 20 of ${r.rows.length}):`);
r.rows.forEach(x => console.log(`  ${x.code}  R${x.reed} P${x.pick}  ${x.width}"  ${x.description}`));
