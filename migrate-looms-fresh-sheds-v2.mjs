#!/usr/bin/env node
/**
 * v2 plan (v1 partial): Shed B looms are referenced so cannot be deleted.
 * Rename them to shed 3 instead. Also cleans up the extras v1 inserted.
 *
 * Target:
 *   Shed 1: 24  (loom_no 1-24)   — no change
 *   Shed 2: 14  (loom_no 25, 50-62)  — 1 existing + 13 new
 *   Shed 3: 24  (loom_no 26-49)  — 17 renamed from B + 7 new
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

// --- Step A: remove v1's shed 3 inserts (loom_no 43-62, all unreferenced)
const del = await client.execute({
  sql: "DELETE FROM looms WHERE shed = '3' AND loom_no BETWEEN 43 AND 62",
  args: [],
});
console.log(`✗ Removed v1 shed-3 inserts: ${del.rowsAffected}`);

// --- Step B: rename shed B → shed 3
const ren = await client.execute({
  sql: "UPDATE looms SET shed = '3' WHERE shed = 'B'",
  args: [],
});
console.log(`✓ Renamed shed B → 3: ${ren.rowsAffected}`);

// --- Step C: fill shed 3 up to loom_no 49 (24 total: 26-49)
const s3 = await client.execute({ sql: "SELECT loom_no FROM looms WHERE shed = '3'", args: [] });
const s3Have = new Set(s3.rows.map((r) => r.loom_no));
for (let n = 26; n <= 49; n++) {
  if (s3Have.has(n)) continue;
  const clash = await client.execute({ sql: "SELECT id FROM looms WHERE loom_no = ? LIMIT 1", args: [n] });
  if (clash.rows.length) { console.log(`  ⚠ ${n} clash`); continue; }
  await client.execute({
    sql: "INSERT INTO looms (shed, loom_no, type, rpm, status) VALUES (?, ?, ?, ?, ?)",
    args: ["3", n, "SHUTTLE", 220, "A"],
  });
  console.log(`  + shed 3 loom_no ${n}`);
}

// --- Step D: shed 2 — 13 new (loom_no 50-62) so total = 14 with existing 25
const s2 = await client.execute({ sql: "SELECT loom_no FROM looms WHERE shed = '2'", args: [] });
const s2Have = new Set(s2.rows.map((r) => r.loom_no));
for (let n = 50; n <= 62; n++) {
  if (s2Have.has(n)) continue;
  const clash = await client.execute({ sql: "SELECT id FROM looms WHERE loom_no = ? LIMIT 1", args: [n] });
  if (clash.rows.length) { console.log(`  ⚠ ${n} clash`); continue; }
  await client.execute({
    sql: "INSERT INTO looms (shed, loom_no, type, rpm, status) VALUES (?, ?, ?, ?, ?)",
    args: ["2", n, "SHUTTLE", 220, "A"],
  });
  console.log(`  + shed 2 loom_no ${n}`);
}

// --- Final ---
const final = await client.execute("SELECT shed, COUNT(*) as n, GROUP_CONCAT(loom_no) as nos FROM looms GROUP BY shed ORDER BY shed");
console.log("\nFinal per shed:");
for (const r of final.rows) {
  const nums = String(r.nos).split(',').map(Number).sort((a,b)=>a-b);
  const range = nums.length ? `${nums[0]}-${nums[nums.length-1]}` : '';
  console.log(`  shed ${r.shed}: ${r.n} looms  (loom_no ${range})`);
}
const t = await client.execute("SELECT COUNT(*) as n FROM looms");
console.log(`Total: ${t.rows[0].n}`);
