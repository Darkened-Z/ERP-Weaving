#!/usr/bin/env node
/**
 * Backfill beams.shed from migration log — beams.loom_no is now per-shed
 * so shed is required to disambiguate loom_no=1 between sheds.
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// From migration log:  beam id → shed
const shedByBeamId = new Map([
  [1,  "1"], [2, "1"], [3, "1"], [4, "1"], [5, "1"],
  [6,  "2"], [7, "2"], [13, "1"], [14, "2"], [15, "2"],
]);

for (const [id, shed] of shedByBeamId) {
  await client.execute({ sql: "UPDATE beams SET shed = ? WHERE id = ?", args: [shed, id] });
}
console.log(`✓ Updated shed on ${shedByBeamId.size} beams`);

const r = await client.execute("SELECT id, shed, loom_no FROM beams WHERE loom_no IS NOT NULL ORDER BY id");
r.rows.forEach(b => console.log(`  beam id ${b.id}: shed=${b.shed} loom_no=${b.loom_no}`));
