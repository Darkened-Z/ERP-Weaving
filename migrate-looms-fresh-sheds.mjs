#!/usr/bin/env node
/**
 * Reset shed 2 & shed 3 to what the client asked for:
 *   Shed 1: keep (24 looms, loom_no 1-24)
 *   Shed 2: 14 looms total (loom_no 25-38)  — existing loom 25 kept, add 26-38
 *   Shed 3: 24 fresh looms (loom_no 39-62)
 *
 * Also removes the 17 shed-B leftovers (loom_no 26-42).
 * Skips deletion of any loom that is still referenced (beam / production).
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

// --- 1. Delete shed 'B' rows (if unreferenced) ---
const sB = await client.execute({ sql: "SELECT id, loom_no FROM looms WHERE shed = 'B'", args: [] });
console.log(`Shed B looms found: ${sB.rows.length}`);
let deleted = 0, skipped = 0;
for (const r of sB.rows) {
  // Check references — beams table (if present) + dailyProduction (loomNo)
  const beamRef = await client.execute({
    sql: "SELECT id FROM beams WHERE loom_no = ? LIMIT 1",
    args: [r.loom_no],
  }).catch(() => ({ rows: [] }));
  const prodRef = await client.execute({
    sql: "SELECT id FROM daily_production WHERE loom_no = ? LIMIT 1",
    args: [r.loom_no],
  }).catch(() => ({ rows: [] }));
  if (beamRef.rows.length + prodRef.rows.length > 0) {
    console.log(`  ⚠ id ${r.id} loom_no ${r.loom_no} — referenced, skipped`);
    skipped++;
    continue;
  }
  await client.execute({ sql: "DELETE FROM looms WHERE id = ?", args: [r.id] });
  deleted++;
}
console.log(`  ✓ Shed B: deleted ${deleted}, skipped ${skipped}`);

// --- 2. Add shed 2: loom_no 26-38 (13 more, existing loom 25 already in shed 2)
const shed2Existing = await client.execute({ sql: "SELECT loom_no FROM looms WHERE shed = '2'", args: [] });
const shed2Have = new Set(shed2Existing.rows.map((r) => r.loom_no));
console.log(`Shed 2 currently: ${[...shed2Have].sort((a,b)=>a-b).join(',')}`);
for (let n = 26; n <= 38; n++) {
  if (shed2Have.has(n)) continue;
  // Also check global uniqueness
  const clash = await client.execute({ sql: "SELECT id FROM looms WHERE loom_no = ? LIMIT 1", args: [n] });
  if (clash.rows.length) {
    console.log(`  ⚠ loom_no ${n} clash — skipped`);
    continue;
  }
  await client.execute({
    sql: `INSERT INTO looms (shed, loom_no, type, rpm, status) VALUES (?, ?, ?, ?, ?)`,
    args: ["2", n, "SHUTTLE", 220, "A"],
  });
  console.log(`  + shed 2 loom_no ${n}`);
}

// --- 3. Add shed 3: loom_no 39-62 (24 fresh)
for (let n = 39; n <= 62; n++) {
  const clash = await client.execute({ sql: "SELECT id FROM looms WHERE loom_no = ? LIMIT 1", args: [n] });
  if (clash.rows.length) {
    console.log(`  ⚠ loom_no ${n} clash — skipped`);
    continue;
  }
  await client.execute({
    sql: `INSERT INTO looms (shed, loom_no, type, rpm, status) VALUES (?, ?, ?, ?, ?)`,
    args: ["3", n, "SHUTTLE", 220, "A"],
  });
  console.log(`  + shed 3 loom_no ${n}`);
}

// --- Final counts ---
const final = await client.execute("SELECT shed, COUNT(*) as n FROM looms GROUP BY shed ORDER BY shed");
console.log("\nFinal per shed:");
for (const r of final.rows) console.log(`  shed ${r.shed}: ${r.n}`);
const t = await client.execute("SELECT COUNT(*) as n FROM looms");
console.log(`Total looms: ${t.rows[0].n}`);
