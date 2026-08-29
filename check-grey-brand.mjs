import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
for (const t of ["ext_grey_conv_warp","ext_grey_conv_weft","int_grey_conversion_warp","int_grey_conversion_weft"]) {
  try {
    const r = await c.execute(`SELECT COUNT(*) as n, SUM(CASE WHEN brand IS NOT NULL AND brand<>'' THEN 1 ELSE 0 END) as withBrand FROM ${t}`);
    const sample = await c.execute(`SELECT DISTINCT brand FROM ${t} WHERE brand IS NOT NULL AND brand<>'' LIMIT 6`);
    console.log(`${t}: ${r.rows[0].n} rows, ${r.rows[0].withBrand} with brand. samples: ${sample.rows.map(x=>x.brand).join(" | ")}`);
  } catch(e){ console.log(`${t}: ${e.message.split("\n")[0]}`); }
}
