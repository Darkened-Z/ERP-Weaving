#!/usr/bin/env node
/**
 * One-shot import of client's Chart of Accounts heads (levels 1-4) from the
 * parsed PDF (video-frames/CHART_heads.json). Skips codes that already exist.
 * Runs on whatever DB the current TURSO_* env vars point at.
 *
 *   node migrate-coa-heads.mjs
 *
 * Client instruction: they will add level-5 (parties) themselves via /accounts.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEADS_JSON = resolve(__dirname, "..", "videos", "CHART_heads.json");

const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
console.log(`DB: ${url}`);
const client = createClient({ url, authToken });

const heads = JSON.parse(readFileSync(HEADS_JSON, "utf-8"));
console.log(`Reading ${heads.length} heads from ${HEADS_JSON}`);

const existing = await client.execute("SELECT code FROM chart_of_accounts");
const seen = new Set(existing.rows.map((r) => r.code));
console.log(`DB currently has ${seen.size} account codes.`);

let inserted = 0;
let skipped = 0;
for (const h of heads) {
  if (seen.has(h.code)) {
    skipped++;
    continue;
  }
  // Compute parent code (all parts except last); root-level heads (Level 1) have code_head = ""
  const parts = h.code.split(".");
  const codeHead = parts.length > 1 ? parts.slice(0, -1).join(".") : "";
  await client.execute({
    sql: `INSERT INTO chart_of_accounts (code, code_head, code_auto, level, description, desc_short, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      h.code,
      codeHead,
      "0",
      h.level,
      h.description,
      h.description.substring(0, 12),
      "A",
    ],
  });
  inserted++;
}

console.log(`\n✓ Inserted: ${inserted}`);
console.log(`↺ Skipped (already exist): ${skipped}`);
console.log("Done.");
