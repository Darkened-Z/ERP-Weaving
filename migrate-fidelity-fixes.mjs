import { createClient } from "@libsql/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "data.db");
const client = createClient({ url: `file:${dbPath}` });

let ok = 0;
let skipped = 0;
let errors = 0;

async function run(sql) {
  try {
    await client.execute(sql);
    console.log("OK:", sql.substring(0, 100));
    ok++;
  } catch (e) {
    if (e.message?.includes("duplicate column") || e.message?.includes("already exists")) {
      console.log("SKIP:", sql.substring(0, 100));
      skipped++;
    } else {
      console.log("ERR:", e.message);
      errors++;
    }
  }
}

await client.execute("PRAGMA foreign_keys = ON");

const alters = [
  "ALTER TABLE int_warped_beam_receiving ADD COLUMN bags_qty REAL",
  "ALTER TABLE int_warped_beam_receiving ADD COLUMN bags_weight REAL",
  "ALTER TABLE int_warped_beam_receiving ADD COLUMN cones_qty REAL",
  "ALTER TABLE int_warped_beam_receiving ADD COLUMN cones_weight REAL",
  "ALTER TABLE int_warped_beam_receiving ADD COLUMN gulley_weight REAL",
  "ALTER TABLE int_warped_beam_receiving ADD COLUMN emt_bag_weight REAL",
  "ALTER TABLE int_warped_beam_receiving ADD COLUMN shoper_weight REAL",
  "ALTER TABLE int_warped_beam_receiving ADD COLUMN waste_weight REAL",
  "ALTER TABLE int_warped_beam_receiving ADD COLUMN gatta_weight REAL",

  "ALTER TABLE int_grey_despatch_line ADD COLUMN cp REAL",
  "ALTER TABLE int_grey_despatch_line ADD COLUMN rej REAL",

  "ALTER TABLE int_grey_despatch ADD COLUMN type TEXT NOT NULL DEFAULT 'FRS'",
  "ALTER TABLE int_grey_despatch ADD COLUMN age_percent REAL",

  "ALTER TABLE int_yarn_purchase_contract ADD COLUMN delivery_place TEXT",
  "ALTER TABLE int_yarn_purchase_contract ADD COLUMN qty_lbs REAL",
];

for (const sql of alters) {
  await run(sql);
}

const migrateData = [
  "UPDATE int_yarn_purchase_contract SET delivery_place = img WHERE delivery_place IS NULL AND img IS NOT NULL",
  "UPDATE int_yarn_purchase_contract SET qty_lbs = days WHERE qty_lbs IS NULL AND days IS NOT NULL",
];

for (const sql of migrateData) {
  await run(sql);
}

console.log(`\nFidelity-fix migration: ${ok} OK, ${skipped} skipped, ${errors} errors.`);
client.close();
