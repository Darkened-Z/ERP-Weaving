#!/usr/bin/env node
/**
 * Drop the old test daily_production records that reference shed 'A' / 'B'
 * (the shed labels that predate the client's actual shed 1/2/3 layout).
 * Also handles the intDailyProduction siblings and daily-production sets
 * that reference the same date+shift+shed combos.
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

// --- Before counts
const before = await client.execute("SELECT shed, COUNT(*) as n FROM daily_production GROUP BY shed ORDER BY shed");
console.log("Before:");
before.rows.forEach(r => console.log(`  shed ${r.shed}: ${r.n} entries`));

// --- Delete
const del = await client.execute({ sql: "DELETE FROM daily_production WHERE shed IN ('A', 'B')", args: [] });
console.log(`\n✗ Deleted daily_production shed A + B: ${del.rowsAffected} rows`);

// Also check int_daily_production if it exists and has similar
try {
  const idpBefore = await client.execute("SELECT shed, COUNT(*) as n FROM int_daily_production GROUP BY shed");
  console.log("\nint_daily_production before:");
  idpBefore.rows.forEach(r => console.log(`  shed ${r.shed}: ${r.n}`));
  const idpDel = await client.execute({ sql: "DELETE FROM int_daily_production WHERE shed IN ('A', 'B')", args: [] });
  console.log(`✗ Deleted int_daily_production shed A + B: ${idpDel.rowsAffected} rows`);
} catch (e) {
  console.log(`(int_daily_production skipped: ${e.message?.split('\n')[0]})`);
}

// --- After counts
const after = await client.execute("SELECT shed, COUNT(*) as n FROM daily_production GROUP BY shed ORDER BY shed");
console.log("\nAfter:");
if (after.rows.length === 0) console.log("  (no production records)");
else after.rows.forEach(r => console.log(`  shed ${r.shed}: ${r.n} entries`));

const t = await client.execute("SELECT COUNT(*) as n FROM daily_production");
console.log(`\nTotal daily_production rows now: ${t.rows[0].n}`);
