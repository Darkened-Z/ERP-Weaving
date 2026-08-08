import { createClient } from "@libsql/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "data.db");
const client = createClient({ url: `file:${dbPath}` });

// --- TABLE SPECS ---

const tables = [
  {
    table: "ext_yarn_pur_contract_delivery",
    fk: "contract_id",
    parent: "ext_yarn_pur_contract",
    create: `CREATE TABLE ext_yarn_pur_contract_delivery_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES ext_yarn_pur_contract(id) ON DELETE CASCADE,
  delivery_date TEXT,
  do_no TEXT,
  bags REAL,
  ycd_dlv_loc TEXT
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_ypcd_contract ON ext_yarn_pur_contract_delivery(contract_id)",
    ],
  },
  {
    table: "ext_yarn_sal_contract_delivery",
    fk: "contract_id",
    parent: "ext_yarn_sal_contract",
    create: `CREATE TABLE ext_yarn_sal_contract_delivery_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES ext_yarn_sal_contract(id) ON DELETE CASCADE,
  delivery_date TEXT,
  bags REAL,
  ycd_dlv_loc TEXT
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_yscd_contract ON ext_yarn_sal_contract_delivery(contract_id)",
    ],
  },
  {
    table: "ext_grey_pur_contract_delivery",
    fk: "contract_id",
    parent: "ext_grey_pur_contract",
    create: `CREATE TABLE ext_grey_pur_contract_delivery_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES ext_grey_pur_contract(id) ON DELETE CASCADE,
  delivery_date TEXT,
  meters REAL,
  location TEXT
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_gpcd_contract ON ext_grey_pur_contract_delivery(contract_id)",
    ],
  },
  {
    table: "ext_grey_sal_contract_delivery",
    fk: "contract_id",
    parent: "ext_grey_sal_contract",
    create: `CREATE TABLE ext_grey_sal_contract_delivery_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES ext_grey_sal_contract(id) ON DELETE CASCADE,
  delivery_date TEXT,
  meters REAL,
  location TEXT
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_gscd_contract ON ext_grey_sal_contract_delivery(contract_id)",
    ],
  },
  {
    table: "ext_grey_conv_warp",
    fk: "contract_id",
    parent: "ext_grey_conv_contract",
    create: `CREATE TABLE ext_grey_conv_warp_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES ext_grey_conv_contract(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  count TEXT,
  descr TEXT,
  brand TEXT,
  cal_count REAL,
  ends INTEGER,
  wt_per_mtr REAL,
  rate_per_lbs REAL,
  cost_per_mtr REAL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_gcw_contract ON ext_grey_conv_warp(contract_id)",
    ],
  },
  {
    table: "ext_grey_conv_weft",
    fk: "contract_id",
    parent: "ext_grey_conv_contract",
    create: `CREATE TABLE ext_grey_conv_weft_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES ext_grey_conv_contract(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  count TEXT,
  descr TEXT,
  brand TEXT,
  cal_count REAL,
  ends INTEGER,
  wt_per_mtr REAL,
  rate_per_lbs REAL,
  cost_per_mtr REAL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_gcwft_contract ON ext_grey_conv_weft(contract_id)",
    ],
  },
  {
    table: "ext_yarn_pur_voucher_line",
    fk: "voucher_id",
    parent: "ext_yarn_pur_voucher",
    create: `CREATE TABLE ext_yarn_pur_voucher_line_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NOT NULL REFERENCES ext_yarn_pur_voucher(id) ON DELETE CASCADE,
  cont_no TEXT,
  count TEXT,
  party_count TEXT,
  bld TEXT,
  pack TEXT,
  brand TEXT,
  do_no TEXT,
  qty REAL,
  bag REAL,
  con REAL,
  lbs REAL,
  unit TEXT,
  despatch_party TEXT,
  rate REAL,
  rate_sv REAL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_ypvl_voucher ON ext_yarn_pur_voucher_line(voucher_id)",
    ],
  },
  {
    table: "ext_yarn_sal_voucher_line",
    fk: "voucher_id",
    parent: "ext_yarn_sal_voucher",
    create: `CREATE TABLE ext_yarn_sal_voucher_line_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NOT NULL REFERENCES ext_yarn_sal_voucher(id) ON DELETE CASCADE,
  cont_no TEXT,
  count TEXT,
  bld TEXT,
  pack TEXT,
  brand TEXT,
  do_no TEXT,
  qty REAL,
  bag REAL,
  cons REAL,
  lbs REAL,
  unit TEXT,
  despatch_party TEXT,
  rate REAL,
  amt REAL,
  remarks TEXT
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_ysvl_voucher ON ext_yarn_sal_voucher_line(voucher_id)",
    ],
  },
  {
    table: "ext_godown_stock_line",
    fk: "stock_id",
    parent: "ext_godown_stock",
    create: `CREATE TABLE ext_godown_stock_line_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id INTEGER NOT NULL REFERENCES ext_godown_stock(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  than INTEGER,
  mtr REAL,
  status TEXT
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_gsl_stock ON ext_godown_stock_line(stock_id)",
    ],
  },
  {
    table: "ext_godown_stock_count",
    fk: "stock_id",
    parent: "ext_godown_stock",
    create: `CREATE TABLE ext_godown_stock_count_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id INTEGER NOT NULL REFERENCES ext_godown_stock(id) ON DELETE CASCADE,
  code TEXT,
  type TEXT,
  cal_count REAL,
  ends INTEGER,
  rate_per_lbs REAL,
  wt_per_mtr REAL,
  cost_per_mtr REAL,
  tot_lbs REAL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_gsc_stock ON ext_godown_stock_count(stock_id)",
    ],
  },
  {
    table: "ext_kachi_parchi_line",
    fk: "parchi_id",
    parent: "ext_kachi_parchi",
    create: `CREATE TABLE ext_kachi_parchi_line_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parchi_id INTEGER NOT NULL REFERENCES ext_kachi_parchi(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  than INTEGER,
  mtr REAL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_kpl_parchi ON ext_kachi_parchi_line(parchi_id)",
    ],
  },
  {
    table: "ext_kachi_parchi_count",
    fk: "parchi_id",
    parent: "ext_kachi_parchi",
    create: `CREATE TABLE ext_kachi_parchi_count_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parchi_id INTEGER NOT NULL REFERENCES ext_kachi_parchi(id) ON DELETE CASCADE,
  code TEXT,
  type TEXT,
  cal_count REAL,
  ends INTEGER,
  rate_per_lbs REAL,
  wt_per_mtr REAL,
  cost_per_mtr REAL,
  tot_lbs REAL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_kpc_parchi ON ext_kachi_parchi_count(parchi_id)",
    ],
  },
  {
    table: "ext_packi_parchi_bag",
    fk: "parchi_id",
    parent: "ext_packi_parchi",
    create: `CREATE TABLE ext_packi_parchi_bag_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parchi_id INTEGER NOT NULL REFERENCES ext_packi_parchi(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  quality TEXT,
  wt_per_meter REAL,
  bags REAL,
  rate REAL,
  amount REAL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_ppb_parchi ON ext_packi_parchi_bag(parchi_id)",
    ],
  },
  {
    table: "ext_packi_parchi_count",
    fk: "parchi_id",
    parent: "ext_packi_parchi",
    create: `CREATE TABLE ext_packi_parchi_count_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parchi_id INTEGER NOT NULL REFERENCES ext_packi_parchi(id) ON DELETE CASCADE,
  code TEXT,
  type TEXT,
  cal_count REAL,
  ends INTEGER,
  rate_per_lbs REAL,
  wt_per_mtr REAL,
  cost_per_mtr REAL,
  tot_lbs REAL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ext_ppc_parchi ON ext_packi_parchi_count(parchi_id)",
    ],
  },
  {
    table: "ticket_comments",
    fk: "ticket_id",
    parent: "tickets",
    create: `CREATE TABLE ticket_comments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ticket_comments_ticket ON ticket_comments(ticket_id)",
    ],
  },
  {
    table: "ticket_history",
    fk: "ticket_id",
    parent: "tickets",
    create: `CREATE TABLE ticket_history_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  created_at TEXT NOT NULL
)`,
    indexes: [
      "CREATE INDEX IF NOT EXISTS ix_ticket_history_ticket ON ticket_history(ticket_id)",
    ],
  },
];

// --- ORPHAN CLEANUP + REBUILD ---

await client.execute("PRAGMA foreign_keys=OFF");

let rebuilt = 0;
let totalOrphans = 0;
let errors = 0;

for (const t of tables) {
  try {
    const del = await client.execute(
      `DELETE FROM ${t.table} WHERE ${t.fk} NOT IN (SELECT id FROM ${t.parent})`
    );
    totalOrphans += del.rowsAffected;
    console.log(`ORPHANS ${t.table}: ${del.rowsAffected} deleted`);

    await client.batch(
      [
        t.create,
        `INSERT INTO ${t.table}_new SELECT * FROM ${t.table}`,
        `DROP TABLE ${t.table}`,
        `ALTER TABLE ${t.table}_new RENAME TO ${t.table}`,
      ],
      "write"
    );
    for (const ix of t.indexes) {
      await client.execute(ix);
    }
    rebuilt++;
    console.log(`REBUILT ${t.table}: ${t.fk} -> ${t.parent}(id) ON DELETE CASCADE`);
  } catch (e) {
    errors++;
    console.log(`ERR ${t.table}: ${e.message}`);
  }
}

// --- VERIFY ---

await client.execute("PRAGMA foreign_keys=ON");
const check = await client.execute("PRAGMA foreign_key_check");
if (check.rows.length === 0) {
  console.log("\nforeign_key_check: clean (0 violations)");
} else {
  console.log(`\nforeign_key_check: ${check.rows.length} VIOLATIONS`);
  for (const row of check.rows) console.log(JSON.stringify(row));
}

console.log(`\nFK migration: ${rebuilt}/${tables.length} tables rebuilt, ${totalOrphans} orphan rows deleted, ${errors} errors.`);
client.close();
