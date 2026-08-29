import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

for (const [name, sql] of [
  ["int_daily_production", "SELECT COUNT(*) as n, MIN(loom_no) as min, MAX(loom_no) as max FROM int_daily_production WHERE loom_no IS NOT NULL"],
  ["tickets",              "SELECT COUNT(*) as n, MIN(loom_no) as min, MAX(loom_no) as max FROM tickets WHERE loom_no IS NOT NULL"],
  ["beams",                "SELECT COUNT(*) as n, MIN(loom_no) as min, MAX(loom_no) as max FROM beams WHERE loom_no IS NOT NULL"],
  ["daily_production",     "SELECT COUNT(*) as n, MIN(loom_no) as min, MAX(loom_no) as max FROM daily_production WHERE loom_no IS NOT NULL"],
]) {
  try {
    const r = await client.execute(sql);
    console.log(`${name}:`, JSON.stringify(r.rows[0]));
  } catch (e) {
    console.log(`${name} skipped:`, e.message.split("\n")[0]);
  }
}

const q4 = await client.execute("SELECT shed, COUNT(*) as n, MIN(loom_no) as min, MAX(loom_no) as max FROM looms GROUP BY shed ORDER BY shed");
console.log("\nlooms per shed:");
q4.rows.forEach(r => console.log(`  shed ${r.shed}: ${r.n} looms  (loom_no ${r.min}-${r.max})`));
