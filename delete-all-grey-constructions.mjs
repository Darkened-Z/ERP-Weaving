#!/usr/bin/env node
/**
 * Verify + delete all grey_construction rows so client can add fresh.
 * Also checks references in downstream tables so nothing orphans silently.
 */
import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

console.log("=== BEFORE ===");
const b = await c.execute("SELECT code, description, reed, pick, width FROM grey_construction ORDER BY code");
console.log(`Total: ${b.rows.length}`);
b.rows.forEach(r => console.log(`  ${r.code}  R${r.reed} P${r.pick}  ${r.width}"  ${r.description}`));

const codes = b.rows.map(r => `'${r.code}'`).join(",") || "'__none__'";

console.log("\n=== REFERENCES ===");
async function ref(table, col) {
  try {
    const r = await c.execute(`SELECT COUNT(*) as n FROM ${table} WHERE ${col} IN (${codes})`);
    return r.rows[0].n;
  } catch (e) { return `SKIP (${e.message.split("\n")[0].slice(0, 50)})`; }
}
const targets = [
  ["ext_grey_conv_contract", "gray_qlty_code"],
  ["ext_grey_conv_contract", "gray_code"],
  ["ext_grey_pur_contract", "gray_qlty_code"],
  ["ext_grey_sal_contract", "gray_qlty_code"],
  ["int_grey_conversion_contract", "gray_qlty_code"],
  ["int_beam_ext_ws_contract", "gray_qlty_code"],
  ["ext_grey_transfer_lines", "gray_qlty_code"],
  ["daily_production", "grey_code"],
  ["int_daily_production", "grey_code"],
  ["beams", "code_conv"],
];
for (const [t, col] of targets) console.log(`  ${t}.${col}: ${await ref(t, col)}`);

console.log("\n=== DELETING ===");
const del = await c.execute("DELETE FROM grey_construction");
console.log(`  ✗ grey_construction: ${del.rowsAffected} rows`);

const after = await c.execute("SELECT COUNT(*) as n FROM grey_construction");
console.log(`\n=== AFTER ===`);
console.log(`grey_construction: ${after.rows[0].n} rows`);
