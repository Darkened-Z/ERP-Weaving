import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
const LOCAL_PATH = process.env.LOCAL_DB_PATH || path.resolve(__dirname, "data.db");

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("ERR: Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before running this script.");
  console.error("     TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node push-to-turso.mjs");
  process.exit(1);
}

if (!fs.existsSync(LOCAL_PATH)) {
  console.error("ERR: Local database not found at", LOCAL_PATH);
  process.exit(1);
}

const local = createClient({ url: `file:${LOCAL_PATH}` });
const remote = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

console.log("Source:", LOCAL_PATH);
console.log("Target:", TURSO_URL);
console.log("");

const { rows: tableRows } = await local.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name"
);
const tables = tableRows.map((r) => r.name);

console.log(`Found ${tables.length} tables to sync.`);

for (const table of tables) {
  process.stdout.write(`  ${table} ... `);

  const createRow = await local.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name = ?",
    args: [table],
  });
  const createSql = createRow.rows[0]?.sql;
  if (!createSql) {
    console.log("SKIP (no CREATE stmt)");
    continue;
  }

  try {
    await remote.execute(`DROP TABLE IF EXISTS ${table}`);
    await remote.execute(createSql);
  } catch (e) {
    console.log("ERR schema:", e.message);
    continue;
  }

  const { rows } = await local.execute(`SELECT * FROM ${table}`);
  if (rows.length === 0) {
    console.log("empty");
    continue;
  }

  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => "?").join(", ");
  const insertSql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`;

  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const statements = batch.map((row) => ({
      sql: insertSql,
      args: cols.map((c) => row[c]),
    }));
    try {
      await remote.batch(statements, "write");
      inserted += batch.length;
    } catch (e) {
      console.log(`\n    ERR at batch ${i}: ${e.message}`);
    }
  }
  console.log(`${inserted}/${rows.length} rows`);
}

const { rows: indexRows } = await local.execute(
  "SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
);
console.log(`\nCopying ${indexRows.length} indexes...`);
for (const r of indexRows) {
  try {
    await remote.execute(r.sql);
  } catch {
    // silently skip — index may already exist as part of CREATE TABLE
  }
}

console.log("\nDone. Verify at:", TURSO_URL.replace("libsql://", "https://"));
local.close();
remote.close();
