import { createClient } from "@libsql/client";
import path from "node:path";

// Conversion billing rate on the packi parchi. The mill agrees a conv rate per
// metre for a conversion contract and nudges it per parchi; the amount is
// always conv_rate x meter_net and is never hand-typed. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const info = await client.execute("PRAGMA table_info(ext_packi_parchi)");
const have = new Set(info.rows.map((r) => r.name));

for (const col of ["conv_rate", "conv_amount"]) {
  if (have.has(col)) {
    console.log(`  = ${col} already present`);
    continue;
  }
  await client.execute(`ALTER TABLE ext_packi_parchi ADD COLUMN ${col} REAL`);
  console.log(`  + ${col}`);
}
console.log("done");
process.exit(0);
