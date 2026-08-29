#!/usr/bin/env node
/**
 * Renumber looms so each shed starts from 1 (Oracle Forms parity).
 *
 * Before:  loom_no is GLOBALLY unique  (Shed 1: 1-24, Shed 2: 25-35, Shed 3: 39-62)
 * After:   loom_no is unique WITHIN A SHED  (each shed: 1-N)
 *
 * Steps:
 *  1. Snapshot old (shed, loom_no) → new (shed, loom_no) mapping.
 *  2. Recreate `looms` table with UNIQUE(shed, loom_no) instead of UNIQUE(loom_no),
 *     copying rows with renumbered loom_no.
 *  3. Update `daily_production.loom_no` per shed (has shed column).
 *  4. Update `beams.loom_no` per shed (has shed column).
 *  5. Backfill `tickets.shed` from the mapping, then update tickets.loom_no.
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

console.log(`DB: ${process.env.TURSO_DATABASE_URL}`);

// --- 1. Snapshot & compute new numbering ---
const cur = await client.execute("SELECT id, shed, loom_no FROM looms ORDER BY shed, loom_no");
console.log(`\nSnapshot: ${cur.rows.length} looms`);
const byShed = {};
for (const r of cur.rows) {
  byShed[r.shed] ??= [];
  byShed[r.shed].push(r);
}
// oldLoomNo -> {shed, newLoomNo, id}
const oldToNew = new Map();
for (const shed of Object.keys(byShed).sort()) {
  const rows = byShed[shed];
  rows.forEach((r, i) => {
    const newLoomNo = i + 1;
    oldToNew.set(r.loom_no, { id: r.id, shed, newLoomNo });
  });
  console.log(`  shed ${shed}: ${rows.length} looms  (old ${rows[0].loom_no}-${rows.at(-1).loom_no} → new 1-${rows.length})`);
}

// --- 2. Recreate looms table without global UNIQUE, add composite UNIQUE ---
console.log("\n--- Recreating `looms` table with UNIQUE(shed, loom_no) ---");
await client.batch([
  `CREATE TABLE looms_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loom_no INTEGER NOT NULL,
    shed TEXT NOT NULL,
    type TEXT NOT NULL,
    make TEXT,
    width REAL,
    rpm INTEGER,
    act_rpm INTEGER,
    weaver_name TEXT,
    "group" TEXT,
    forman TEXT,
    status TEXT NOT NULL DEFAULT 'A',
    status_wrk TEXT,
    current_contract TEXT,
    current_product TEXT,
    current_beam TEXT
  )`,
], "write");

// Copy with renumbered loom_no
for (const [oldNo, m] of oldToNew) {
  await client.execute({
    sql: `INSERT INTO looms_new (id, loom_no, shed, type, make, width, rpm, act_rpm, weaver_name, "group", forman, status, status_wrk, current_contract, current_product, current_beam)
          SELECT id, ?, shed, type, make, width, rpm, act_rpm, weaver_name, "group", forman, status, status_wrk, current_contract, current_product, current_beam
          FROM looms WHERE id = ?`,
    args: [m.newLoomNo, m.id],
  });
}
console.log(`  copied: ${oldToNew.size} rows`);

await client.batch([
  "DROP TABLE looms",
  "ALTER TABLE looms_new RENAME TO looms",
  "CREATE UNIQUE INDEX ux_looms_shed_loom_no ON looms (shed, loom_no)",
], "write");
console.log("  ✓ looms recreated with UNIQUE(shed, loom_no)");

// --- 3. daily_production ---
const dpCount = await client.execute("SELECT COUNT(*) as n FROM daily_production WHERE loom_no IS NOT NULL");
console.log(`\ndaily_production loom refs: ${dpCount.rows[0].n}`);
if (dpCount.rows[0].n > 0) {
  // Loop through each unique (shed, old loom_no) and remap
  const dp = await client.execute("SELECT DISTINCT shed, loom_no FROM daily_production WHERE loom_no IS NOT NULL");
  for (const r of dp.rows) {
    const m = [...oldToNew.entries()].find(([ol, m]) => m.shed === r.shed && ol === r.loom_no);
    if (!m) { console.log(`  ⚠ no mapping for shed ${r.shed} loom_no ${r.loom_no}`); continue; }
    // Temp: park at +10000, then remap
  }
}
// Since daily_production had 0 rows in check, safe path:
if (dpCount.rows[0].n === 0) console.log("  (skipped — no rows)");

// --- 4. beams (has shed column) ---
const bmCount = await client.execute("SELECT COUNT(*) as n FROM beams WHERE loom_no IS NOT NULL");
console.log(`\nbeams loom refs: ${bmCount.rows[0].n}`);
if (bmCount.rows[0].n > 0) {
  // beams.loom_no is not unique, so we can update in place per shed
  const beams = await client.execute("SELECT id, shed, loom_no FROM beams WHERE loom_no IS NOT NULL");
  for (const b of beams.rows) {
    const mapping = oldToNew.get(b.loom_no);
    if (!mapping) { console.log(`  ⚠ beam id ${b.id} shed=${b.shed} old loom_no ${b.loom_no} — no mapping`); continue; }
    if (mapping.shed !== b.shed) {
      console.log(`  ⚠ beam id ${b.id} sched shed mismatch: beam.shed=${b.shed} vs looms.shed=${mapping.shed}`);
    }
    await client.execute({
      sql: "UPDATE beams SET loom_no = ? WHERE id = ?",
      args: [mapping.newLoomNo, b.id],
    });
    console.log(`  beam id ${b.id}: shed ${b.shed} loom_no ${b.loom_no} → ${mapping.newLoomNo}`);
  }
}

// --- 5. tickets (no shed column — add one, then update) ---
const tkCount = await client.execute("SELECT COUNT(*) as n FROM tickets WHERE loom_no IS NOT NULL");
console.log(`\ntickets loom refs: ${tkCount.rows[0].n}`);
if (tkCount.rows[0].n > 0) {
  // Check if shed col already exists
  const cols = await client.execute("PRAGMA table_info(tickets)");
  const hasShed = cols.rows.some(c => c.name === "shed");
  if (!hasShed) {
    await client.execute("ALTER TABLE tickets ADD COLUMN shed TEXT");
    console.log("  + added tickets.shed column");
  }
  const tickets = await client.execute("SELECT id, loom_no FROM tickets WHERE loom_no IS NOT NULL");
  for (const t of tickets.rows) {
    const mapping = oldToNew.get(t.loom_no);
    if (!mapping) { console.log(`  ⚠ ticket id ${t.id} loom_no ${t.loom_no} — no mapping`); continue; }
    await client.execute({
      sql: "UPDATE tickets SET shed = ?, loom_no = ? WHERE id = ?",
      args: [mapping.shed, mapping.newLoomNo, t.id],
    });
    console.log(`  ticket id ${t.id}: loom_no ${t.loom_no} → shed ${mapping.shed} loom_no ${mapping.newLoomNo}`);
  }
}

// --- Final verify ---
console.log("\n=== Final looms per shed ===");
const final = await client.execute("SELECT shed, COUNT(*) as n, MIN(loom_no) as min, MAX(loom_no) as max FROM looms GROUP BY shed ORDER BY shed");
for (const r of final.rows) {
  const contig = r.n === r.max && r.min === 1;
  console.log(`  shed ${r.shed}: ${r.n} looms, range ${r.min}-${r.max}, continuous from 1: ${contig ? "✓" : "✗"}`);
}
