import { createClient } from "@libsql/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "data.db");
const client = createClient({ url: `file:${dbPath}` });

async function run(sql, opts = {}) {
  try {
    await client.execute(sql);
    console.log("OK:", sql.substring(0, 80));
  } catch (e) {
    if (opts.ignoreExists && (e.message?.includes("already exists") || e.message?.includes("duplicate column"))) {
      console.log("SKIP:", sql.substring(0, 80));
    } else {
      console.log("ERR:", e.message);
      if (!opts.soft) throw e;
    }
  }
}

// 1. Add blend column to inventory_opening
await run("ALTER TABLE inventory_opening ADD COLUMN blend TEXT", { ignoreExists: true });

// 2. Indexes on hot columns
await run("CREATE INDEX IF NOT EXISTS ix_trans_detail_acc ON trans_detail(acc_code)");
await run("CREATE INDEX IF NOT EXISTS ix_contracts_type ON contracts(type)");
await run("CREATE INDEX IF NOT EXISTS ix_daily_prod_date ON daily_production(production_date)");
await run("CREATE INDEX IF NOT EXISTS ix_daily_prod_loom ON daily_production(loom_no)");
await run("CREATE INDEX IF NOT EXISTS ix_inv_opening_item_type ON inventory_opening(item_type)");
await run("CREATE INDEX IF NOT EXISTS ix_inv_opening_fy_code ON inventory_opening(fy_code)");
await run("CREATE INDEX IF NOT EXISTS ix_inv_opening_entry_date ON inventory_opening(entry_date)");

// 3. Missing UNIQUE constraints (as unique indexes — safe if no existing dupes)
await run("CREATE UNIQUE INDEX IF NOT EXISTS ux_trans_main_fy_vtype_vno ON trans_main(fy_code, vtype, vno)");
await run("CREATE UNIQUE INDEX IF NOT EXISTS ux_trans_detail_fy_vtype_vno_srno ON trans_detail(fy_code, vtype, vno, srno)");
await run("CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_prod_date_shed_shift_loom ON daily_production(production_date, shed, shift, loom_no)");
await run("CREATE UNIQUE INDEX IF NOT EXISTS ux_party_counts_party_count ON party_counts(party_code, count_code)");
await run("CREATE UNIQUE INDEX IF NOT EXISTS ux_contracts_no_fy ON contracts(contract_no, fy_code)");
await run("CREATE UNIQUE INDEX IF NOT EXISTS ux_production_staff_code ON production_staff(code)");

// 4. Rebuild locations to drop column-level UNIQUE on code and add composite (code, type)
console.log("\nRebuilding locations table...");
await client.execute("BEGIN");
try {
  await client.execute(`CREATE TABLE locations_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code INTEGER NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'GREY'
  )`);
  await client.execute("INSERT INTO locations_new (id, code, description, type) SELECT id, code, description, type FROM locations");
  await client.execute("DROP TABLE locations");
  await client.execute("ALTER TABLE locations_new RENAME TO locations");
  await client.execute("CREATE UNIQUE INDEX ux_locations_code_type ON locations(code, type)");
  await client.execute("COMMIT");
  console.log("OK: locations rebuilt with composite unique (code, type)");
} catch (e) {
  await client.execute("ROLLBACK");
  console.log("ERR rebuilding locations:", e.message);
  throw e;
}

console.log("\nMigration v2 complete.");
client.close();
