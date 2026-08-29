import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const r = await c.execute("SELECT code, description, level FROM chart_of_accounts WHERE code='1.01.01.19.0001'");
r.rows.forEach(x => console.log(`code=${x.code} level=${x.level} desc="${x.description}"`));
// Also what value does the party_counts.party_code hold vs the account code
const pc = await c.execute("SELECT party_code FROM party_counts");
pc.rows.forEach(x => console.log(`party_counts.party_code="${x.party_code}"`));
