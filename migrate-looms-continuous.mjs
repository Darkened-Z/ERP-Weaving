#!/usr/bin/env node
/**
 * Make loom_no continuous per shed:
 *   Shed 1: 1-24    (no change)
 *   Shed 2: 25-38   (14 continuous — was 25, 50-62 with a gap)
 *   Shed 3: 39-62   (24 continuous — was 26-49)
 *
 * loom_no is UNIQUE globally, so shed 3 must move first (out of the way)
 * before shed 2 can claim 26-38. Uses a temp +10000 offset for phase 1
 * to avoid uniqueness conflicts mid-migration.
 *
 * daily_production.loom_no is kept in sync (it references the value, not a FK).
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

async function step(sql, args = []) {
  const r = await client.execute({ sql, args });
  return r.rowsAffected;
}

console.log("\n--- Phase 1: park shed 3 looms at +10000 (temporary) ---");
console.log(`  looms UPDATE: ${await step("UPDATE looms SET loom_no = loom_no + 10000 WHERE shed = '3'")}`);
console.log(`  daily_production UPDATE: ${await step("UPDATE daily_production SET loom_no = loom_no + 10000 WHERE shed = '3' AND loom_no BETWEEN 26 AND 49")}`);

console.log("\n--- Phase 2: renumber shed 2 (50-62 → 26-38) ---");
console.log(`  looms UPDATE: ${await step("UPDATE looms SET loom_no = loom_no - 24 WHERE shed = '2' AND loom_no BETWEEN 50 AND 62")}`);
console.log(`  daily_production UPDATE: ${await step("UPDATE daily_production SET loom_no = loom_no - 24 WHERE shed = '2' AND loom_no BETWEEN 50 AND 62")}`);

console.log("\n--- Phase 3: bring shed 3 back (10026-10049 → 39-62, i.e. -9987) ---");
console.log(`  looms UPDATE: ${await step("UPDATE looms SET loom_no = loom_no - 9987 WHERE shed = '3' AND loom_no >= 10000")}`);
console.log(`  daily_production UPDATE: ${await step("UPDATE daily_production SET loom_no = loom_no - 9987 WHERE shed = '3' AND loom_no >= 10000")}`);

// --- Final verification
const final = await client.execute("SELECT shed, COUNT(*) as n, MIN(loom_no) as min, MAX(loom_no) as max, GROUP_CONCAT(loom_no ORDER BY loom_no) as nos FROM looms GROUP BY shed ORDER BY shed");
console.log("\n=== Final per shed ===");
for (const r of final.rows) {
  const nums = String(r.nos).split(',').map(Number).sort((a, b) => a - b);
  const isCont = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  console.log(`  shed ${r.shed}: ${r.n} looms, range ${r.min}-${r.max}, continuous: ${isCont ? '✓' : '✗'}`);
}
const t = await client.execute("SELECT COUNT(*) as n FROM looms");
console.log(`Total: ${t.rows[0].n}`);

// Also verify daily_production references still line up
const orphan = await client.execute(`
  SELECT dp.loom_no, dp.shed, COUNT(*) as n FROM daily_production dp
  LEFT JOIN looms l ON dp.loom_no = l.loom_no
  WHERE l.id IS NULL
  GROUP BY dp.loom_no, dp.shed
`);
if (orphan.rows.length) {
  console.log("\n⚠ Orphaned daily_production rows (loom_no missing in looms):");
  for (const o of orphan.rows) console.log(`  shed ${o.shed}  loom_no ${o.loom_no}  (${o.n} rows)`);
} else {
  console.log("\n✓ All daily_production loom_no values still resolve to a loom row.");
}
