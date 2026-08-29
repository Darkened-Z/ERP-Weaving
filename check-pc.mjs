import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const n = await c.execute("SELECT COUNT(*) as n FROM party_counts");
console.log("party_counts rows:", n.rows[0].n);
const s = await c.execute(`SELECT pc.party_code, pc.cal_count_warp, pc.cal_count_weft, pc.rate_per_lbs, yc.count_code, yc.description
  FROM party_counts pc LEFT JOIN yarn_counts yc ON pc.count_code = yc.id LIMIT 8`);
s.rows.forEach(r => console.log(`  party=${r.party_code} count=${r.count_code}(${r.description}) calW=${r.cal_count_warp} calWf=${r.cal_count_weft} rate=${r.rate_per_lbs}`));
