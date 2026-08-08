import { createClient } from "@libsql/client";

const client = createClient({ url: "file:data.db" });

const statements = [
  // Grey construction - warp repeating rows
  "ALTER TABLE grey_construction ADD COLUMN warp_2 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN warp_3 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN warp_4 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN warp_5 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN warp_6 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN warp_7 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN warp_8 TEXT",
  // Grey construction - weft repeating rows
  "ALTER TABLE grey_construction ADD COLUMN weft_2 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN weft_3 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN weft_4 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN weft_5 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN weft_6 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN weft_7 TEXT",
  "ALTER TABLE grey_construction ADD COLUMN weft_8 TEXT",
  // Grey construction - blend
  "ALTER TABLE grey_construction ADD COLUMN blend TEXT",
  // Inventory opening - yarn fields
  "ALTER TABLE inventory_opening ADD COLUMN voucher_no TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN do_date TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN pur_cont_no TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN opn_party TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN conv_cont_no TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN ratio TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN qty_warp REAL",
  "ALTER TABLE inventory_opening ADD COLUMN qty_weft REAL",
  "ALTER TABLE inventory_opening ADD COLUMN qty_bags REAL",
  "ALTER TABLE inventory_opening ADD COLUMN brand TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN remarks TEXT",
  // Inventory opening - grey fields
  "ALTER TABLE inventory_opening ADD COLUMN gray_width REAL",
  "ALTER TABLE inventory_opening ADD COLUMN weave TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN design_no TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN loom_type TEXT",
  // Inventory opening - beam fields
  "ALTER TABLE inventory_opening ADD COLUMN lv_no TEXT",
  // Inventory opening - shared
  "ALTER TABLE inventory_opening ADD COLUMN gray_construction TEXT",
  "ALTER TABLE inventory_opening ADD COLUMN product_name TEXT",
];

for (const sql of statements) {
  try {
    await client.execute(sql);
    console.log("OK:", sql.substring(0, 60));
  } catch (e) {
    if (e.message?.includes("duplicate column")) {
      console.log("SKIP (exists):", sql.substring(0, 60));
    } else {
      console.log("ERR:", e.message, sql.substring(0, 60));
    }
  }
}

console.log("\nMigration complete.");
client.close();
