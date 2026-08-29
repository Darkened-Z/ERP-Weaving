#!/usr/bin/env node
/**
 * Client spec: Shed 2 should have 14 looms. Current DB has 11.
 * Add loom_no 12, 13, 14 to shed 2.
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

for (const n of [12, 13, 14]) {
  const exists = await client.execute({
    sql: "SELECT id FROM looms WHERE shed = '2' AND loom_no = ? LIMIT 1",
    args: [n],
  });
  if (exists.rows.length) { console.log(`  = shed 2 loom ${n} already exists`); continue; }
  await client.execute({
    sql: "INSERT INTO looms (shed, loom_no, type, rpm, status) VALUES (?, ?, ?, ?, ?)",
    args: ["2", n, "SHUTTLE", 220, "A"],
  });
  console.log(`  + shed 2 loom ${n} added`);
}

const final = await client.execute("SELECT shed, COUNT(*) as n, MIN(loom_no) as min, MAX(loom_no) as max FROM looms GROUP BY shed ORDER BY shed");
console.log("\nFinal per shed:");
for (const r of final.rows) console.log(`  shed ${r.shed}: ${r.n} looms  (loom_no ${r.min}-${r.max})`);
const total = await client.execute("SELECT COUNT(*) as n FROM looms");
console.log(`Total: ${total.rows[0].n}`);
