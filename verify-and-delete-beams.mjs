#!/usr/bin/env node
/**
 * Verify + delete all beams.
 *   1. List every beam with key columns
 *   2. Report FK-adjacent tables that reference beams (by beam_no / loom_no)
 *   3. Delete everything (beams + their dependent rows in known child tables)
 *   4. Confirm empty
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

console.log("=== BEAMS SNAPSHOT ===");
const b = await c.execute("SELECT id, beam_no, shed, loom_no, party_trade, code_conv, status_wrk, status_loc, type FROM beams ORDER BY id");
console.log(`Total beams: ${b.rows.length}`);
b.rows.forEach(r =>
  console.log(`  id=${r.id}  ${r.beam_no}  shed=${r.shed ?? "-"} loom=${r.loom_no ?? "-"} type=${r.type} statusWrk=${r.status_wrk} statusLoc=${r.status_loc ?? "-"}  party=${r.party_trade ?? "-"}`)
);

console.log("\n=== REFERENCE TABLES (rows that will be orphaned / blocked) ===");
const beamNos = b.rows.map(r => r.beam_no).filter(Boolean);
const q = beamNos.length ? `(${beamNos.map(x => `'${x}'`).join(",")})` : "('__none__')";

async function ref(table, col, extraSql = "") {
  try {
    const r = await c.execute(`SELECT COUNT(*) as n FROM ${table} WHERE ${col} IN ${q} ${extraSql}`);
    return r.rows[0].n;
  } catch (e) { return `SKIP (${e.message.split("\n")[0].slice(0, 60)})`; }
}

const checks = [
  ["int_daily_production_set", "beam_no"],
  ["ext_grey_conv_set_beams", "beam_no"],
  ["int_grey_conversion_beams", "beam_no"],
  ["ext_grey_transfer_lines", "beam_no"],
  ["ext_grey_kachi_parchi_lines", "beam_no"],
  ["ext_grey_packi_parchi_lines", "beam_no"],
  ["int_warped_beam_line", "beam_no"],
  ["int_knotting_line", "beam_no"],
  ["tickets", "beam_no"],
];
const impact = {};
for (const [t, col] of checks) {
  impact[t] = await ref(t, col);
  console.log(`  ${t}.${col}: ${impact[t]}`);
}

// Also looms.current_beam
const loomBeamRef = await c.execute(`SELECT COUNT(*) as n FROM looms WHERE current_beam IN ${q}`);
console.log(`  looms.current_beam: ${loomBeamRef.rows[0].n}`);

console.log("\n=== DELETING ===");

// Clear looms.current_beam so the loom row itself stays but loses its beam pointer
await c.execute(`UPDATE looms SET current_beam = NULL, current_contract = NULL, current_product = NULL, status_wrk = 'F' WHERE current_beam IN ${q}`);
console.log(`  ✓ Cleared current_beam on ${loomBeamRef.rows[0].n} looms (marked those looms Free)`);

// Delete dependents that would otherwise orphan
for (const [t, col] of checks) {
  if (typeof impact[t] !== "number" || impact[t] === 0) continue;
  try {
    const r = await c.execute(`DELETE FROM ${t} WHERE ${col} IN ${q}`);
    console.log(`  ✗ ${t}: ${r.rowsAffected} rows`);
  } catch (e) {
    console.log(`  ⚠ ${t}: ${e.message.split("\n")[0]}`);
  }
}

// Delete beams
const del = await c.execute("DELETE FROM beams");
console.log(`  ✗ beams: ${del.rowsAffected} rows`);

// Verify
const after = await c.execute("SELECT COUNT(*) as n FROM beams");
console.log(`\n=== AFTER ===`);
console.log(`beams: ${after.rows[0].n} rows`);
const loomsAfter = await c.execute("SELECT COUNT(*) as n, SUM(CASE WHEN current_beam IS NULL THEN 1 ELSE 0 END) as free FROM looms");
console.log(`looms: ${loomsAfter.rows[0].n} total, ${loomsAfter.rows[0].free} without a mounted beam`);
