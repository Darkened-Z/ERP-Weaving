import { createClient } from "@libsql/client";

const c = createClient({ url: "file:./data.db" });

const stmts = [
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN purchase_party TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN sale_party TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN sub_party TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN cont_no TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN sal_date TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN dsp_quality TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN dsp_quality_desc TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN width REAL",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN product TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN product_desc TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN rate REAL",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN rate_per REAL",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN rate_sal REAL",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN printing_name TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN printing_location TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN broker_name TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN term TEXT",
  "ALTER TABLE int_grey_despatch_dami ADD COLUMN posted_by TEXT",
  `CREATE TABLE IF NOT EXISTS int_grey_despatch_dami_line (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dami_id INTEGER NOT NULL REFERENCES int_grey_despatch_dami(id) ON DELETE CASCADE,
    sr_no INTEGER NOT NULL,
    than INTEGER NOT NULL DEFAULT 1,
    mtrs REAL
  )`,
  "CREATE INDEX IF NOT EXISTS ix_int_gddl_dami ON int_grey_despatch_dami_line(dami_id)",
];

for (const s of stmts) {
  try {
    await c.execute(s);
    console.log("OK:", s.slice(0, 60));
  } catch (e: unknown) {
    const msg = (e as { message?: string })?.message ?? String(e);
    console.log("SKIP:", msg.slice(0, 80));
  }
}
console.log("MIGRATION COMPLETE");
