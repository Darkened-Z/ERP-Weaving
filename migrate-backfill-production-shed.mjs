import { createClient } from "@libsql/client";
import path from "node:path";

// Existing daily-production rows were saved before shed/loom were stamped from
// the beam, so shed_no and loom_no are NULL and the production reports cannot
// group by shed. Backfill both from the beam each set row names. Rows with no
// beam stay NULL - there is genuinely nothing to derive them from.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const q = async (sql, args = []) => (await client.execute({ sql, args })).rows;

// 1. Set rows: loom_no from the beam.
const setRows = await q(`
  SELECT s.id, s.beam_no, b.shed, b.loom_no
  FROM int_daily_production_set s
  JOIN beams b ON b.beam_no = s.beam_no
  WHERE s.beam_no IS NOT NULL AND s.loom_no IS NULL AND b.loom_no IS NOT NULL`);
for (const r of setRows) {
  await client.execute({ sql: `UPDATE int_daily_production_set SET loom_no=? WHERE id=?`, args: [r.loom_no, r.id] });
  console.log(`  set #${r.id} (${r.beam_no}) -> loom ${r.loom_no}`);
}
console.log(`  ${setRows.length} set row(s) given a loom`);

// 2. Headers: shed_no from the first beam on the voucher.
const heads = await q(`
  SELECT h.id, h.v_no, (
    SELECT b.shed FROM int_daily_production_set s
    JOIN beams b ON b.beam_no = s.beam_no
    WHERE s.production_id = h.id AND b.shed IS NOT NULL
    ORDER BY s.sr_no LIMIT 1
  ) AS shed
  FROM int_daily_production h
  WHERE h.shed_no IS NULL`);
for (const r of heads) {
  if (!r.shed) { console.log(`  ${r.v_no} - no beam with a shed, left NULL`); continue; }
  await client.execute({ sql: `UPDATE int_daily_production SET shed_no=? WHERE id=?`, args: [r.shed, r.id] });
  console.log(`  ${r.v_no} -> shed ${r.shed}`);
}

console.log("Done.");
client.close();
