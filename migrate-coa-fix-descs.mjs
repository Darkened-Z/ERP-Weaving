#!/usr/bin/env node
/**
 * Re-import COA heads (L1-L4) with clean descriptions from CHART_heads_v3.json.
 * - INSERT missing heads
 * - UPDATE existing heads' description + desc_short with the clean values
 * Only touches heads (rows already at level 1-4). Party rows (level 5) untouched.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEADS_JSON = resolve(__dirname, "..", "videos", "CHART_heads_v3.json");

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

const heads = JSON.parse(readFileSync(HEADS_JSON, "utf-8"));
console.log(`Reading ${heads.length} clean heads from ${HEADS_JSON}`);

const existing = await client.execute("SELECT code FROM chart_of_accounts");
const seen = new Set(existing.rows.map((r) => r.code));
console.log(`DB currently has ${seen.size} account codes.`);

let inserted = 0;
let updated = 0;
for (const h of heads) {
  const parts = h.code.split(".");
  const codeHead = parts.length > 1 ? parts.slice(0, -1).join(".") : "";
  const shortDesc = h.description.substring(0, 12);
  if (seen.has(h.code)) {
    // Update description + desc_short
    await client.execute({
      sql: `UPDATE chart_of_accounts SET description = ?, desc_short = ? WHERE code = ?`,
      args: [h.description, shortDesc, h.code],
    });
    updated++;
  } else {
    await client.execute({
      sql: `INSERT INTO chart_of_accounts (code, code_head, code_auto, level, description, desc_short, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [h.code, codeHead, "0", h.level, h.description, shortDesc, "A"],
    });
    inserted++;
  }
}

console.log(`\n✓ Inserted: ${inserted}`);
console.log(`✓ Updated:  ${updated}`);
console.log("Done.");
