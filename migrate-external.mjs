import { createClient } from "@libsql/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, "data.db");
const client = createClient({ url: `file:${dbPath}` });

let created = 0;
let skipped = 0;
let errors = 0;

async function run(sql) {
  try {
    await client.execute(sql);
    console.log("OK:", sql.substring(0, 90));
    created++;
  } catch (e) {
    if (e.message?.includes("already exists") || e.message?.includes("duplicate")) {
      console.log("SKIP:", sql.substring(0, 90));
      skipped++;
    } else {
      console.log("ERR:", e.message);
      errors++;
    }
  }
}

// --- CONTRACTS ---

await run(`CREATE TABLE IF NOT EXISTS ext_yarn_pur_contract (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cont_no TEXT NOT NULL UNIQUE,
  l_cont_no INTEGER,
  cont_date TEXT NOT NULL,
  expd_date TEXT,
  refno TEXT,
  party_code TEXT,
  broker TEXT,
  age_percent REAL,
  brokage_per_bag REAL,
  count_code TEXT,
  ratio TEXT,
  brand TEXT,
  qty_bags REAL,
  rate_per_lbs REAL,
  amount REAL,
  days INTEGER,
  remarks TEXT,
  img TEXT,
  status TEXT NOT NULL DEFAULT 'R',
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_yarn_pur_contract_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  delivery_date TEXT,
  do_no TEXT,
  bags REAL,
  ycd_dlv_loc TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_yarn_sal_contract (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cont_no TEXT NOT NULL UNIQUE,
  l_cont_no INTEGER,
  cont_date TEXT NOT NULL,
  expd_date TEXT,
  refno TEXT,
  party_code TEXT,
  broker TEXT,
  brokage_percentage REAL,
  age_percent REAL,
  count_code TEXT,
  ratio TEXT,
  brand TEXT,
  qty_bags REAL,
  rate_per_lbs REAL,
  amount REAL,
  days INTEGER,
  remarks TEXT,
  img TEXT,
  status TEXT NOT NULL DEFAULT 'R',
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_yarn_sal_contract_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  delivery_date TEXT,
  bags REAL,
  ycd_dlv_loc TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_grey_pur_contract (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_no TEXT NOT NULL UNIQUE,
  l_cont_no INTEGER,
  contract_date TEXT NOT NULL,
  exp_date TEXT,
  party_ref_no TEXT,
  party TEXT,
  broker TEXT,
  brokag_percentage REAL,
  per_mtr REAL,
  grey_code TEXT,
  weave TEXT,
  salvage TEXT,
  quantity_mtr REAL,
  rate_per_mtr REAL,
  amount REAL,
  special_inst TEXT,
  payment_term TEXT,
  delivery_term TEXT,
  remarks TEXT,
  ext_mtr REAL,
  ext_date TEXT,
  gst_rate REAL,
  status TEXT NOT NULL DEFAULT 'R',
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_grey_pur_contract_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  delivery_date TEXT,
  meters REAL,
  location TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_grey_sal_contract (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_no TEXT NOT NULL UNIQUE,
  l_cont_no INTEGER,
  contract_date TEXT NOT NULL,
  exp_date TEXT,
  party_ref_no TEXT,
  party TEXT,
  broker TEXT,
  brokag_per_bag REAL,
  per_mtr REAL,
  grey_code TEXT,
  weave TEXT,
  salvage TEXT,
  quantity_mtr REAL,
  rate_per_mtr REAL,
  amount REAL,
  days INTEGER,
  special_inst TEXT,
  payment_term TEXT,
  delivery_term TEXT,
  remarks TEXT,
  ext_mtr REAL,
  ext_date TEXT,
  gst_rate REAL,
  img TEXT,
  status TEXT NOT NULL DEFAULT 'R',
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_grey_sal_contract_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  delivery_date TEXT,
  meters REAL,
  location TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_grey_conv_contract (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cont_no TEXT NOT NULL UNIQUE,
  l_cont_no INTEGER,
  cont_date TEXT NOT NULL,
  exp_date TEXT,
  status TEXT NOT NULL DEFAULT 'R',
  type TEXT NOT NULL DEFAULT 'CONV',
  party TEXT,
  weave_frame TEXT,
  selv_type TEXT,
  slv_name TEXT,
  qty_mtr REAL,
  cost_lakhai_border_mtr REAL,
  rate_per_pick REAL,
  rate_mtr REAL,
  loom_type TEXT,
  broker TEXT,
  rate_pick REAL,
  design_no TEXT,
  gray_qlty_code TEXT,
  img TEXT,
  wrp_wt_40 REAL,
  wft_wt_40 REAL,
  weight_40 REAL,
  remarks TEXT,
  read REAL,
  pick REAL,
  width REAL,
  find_design TEXT,
  gray_code TEXT,
  find_contract TEXT,
  warp_wt_per_mtr REAL,
  weft_wt_per_mtr REAL,
  wt_per_mtr REAL,
  warp_cost_per_mtr REAL,
  weft_cost_per_mtr REAL,
  cost_per_mtr REAL,
  rate_per_mtr_1 REAL,
  rate_per_mtr_2 REAL,
  product_name TEXT,
  product_quality TEXT,
  season_type TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_grey_conv_warp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  sr_no INTEGER NOT NULL,
  count TEXT,
  descr TEXT,
  brand TEXT,
  cal_count REAL,
  ends INTEGER,
  wt_per_mtr REAL,
  rate_per_lbs REAL,
  cost_per_mtr REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_grey_conv_weft (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL,
  sr_no INTEGER NOT NULL,
  count TEXT,
  descr TEXT,
  brand TEXT,
  cal_count REAL,
  ends INTEGER,
  wt_per_mtr REAL,
  rate_per_lbs REAL,
  cost_per_mtr REAL
)`);

// --- YARN TRANSACTIONS ---

await run(`CREATE TABLE IF NOT EXISTS ext_yarn_pur_voucher (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  v_date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'PUR',
  posting TEXT NOT NULL DEFAULT 'N',
  loom_type TEXT,
  bm_party TEXT,
  party TEXT,
  broker TEXT,
  term TEXT NOT NULL DEFAULT 'CASH',
  img TEXT,
  cont TEXT,
  pur REAL,
  bal REAL,
  sal_avg_rate REAL,
  pur_avg_rate REAL,
  percent REAL,
  per_bag REAL,
  rkd REAL,
  lot_no TEXT,
  pending_finance TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_yarn_pur_voucher_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NOT NULL,
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
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_yarn_sal_voucher (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  v_date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'SAL',
  posting TEXT NOT NULL DEFAULT 'N',
  loom_type TEXT,
  party TEXT,
  term TEXT NOT NULL DEFAULT 'CASH',
  img TEXT,
  cont TEXT,
  pur REAL,
  bal REAL,
  stock_bag REAL,
  stock_con REAL,
  stock_lbs REAL,
  rate_pv REAL,
  amt_pv REAL,
  pl REAL,
  avg_rate REAL,
  remarks TEXT,
  pending_finance TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_yarn_sal_voucher_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NOT NULL,
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
)`);

// --- GREY TRANSACTIONS ---

await run(`CREATE TABLE IF NOT EXISTS ext_godown_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  v_date TEXT NOT NULL,
  kp_no TEXT,
  type TEXT NOT NULL DEFAULT 'STOCK',
  purchase_party TEXT,
  gdn_party TEXT,
  cont_no TEXT,
  pur_cont_no TEXT,
  contact_quality TEXT,
  dsp_quality TEXT,
  than INTEGER,
  meter REAL,
  el_cumi_num INTEGER,
  el_cumi_den INTEGER,
  kami_mtr REAL,
  rate_conversion REAL,
  term TEXT,
  days INTEGER,
  rate_sal REAL,
  sal_cont_no TEXT,
  grey_sale_cont TEXT,
  kaat_percent REAL,
  el_meter REAL,
  el_meter_mode TEXT,
  net_meter REAL,
  checkery REAL,
  commission REAL,
  total REAL,
  balance REAL,
  printing_name TEXT,
  broker_name TEXT,
  remarks TEXT,
  img_hash TEXT,
  conv_grey_type TEXT,
  rate REAL,
  sal_avg_rate REAL,
  pending_finance TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_godown_stock_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id INTEGER NOT NULL,
  sr_no INTEGER NOT NULL,
  than INTEGER,
  mtr REAL,
  status TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_godown_stock_count (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id INTEGER NOT NULL,
  code TEXT,
  type TEXT,
  cal_count REAL,
  ends INTEGER,
  rate_per_lbs REAL,
  wt_per_mtr REAL,
  cost_per_mtr REAL,
  tot_lbs REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_grey_transfer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  v_date TEXT NOT NULL,
  grey_type TEXT NOT NULL DEFAULT 'FRS',
  party_from TEXT,
  quality_from TEXT,
  than INTEGER,
  meters REAL,
  stock_than INTEGER,
  stock_mtr REAL,
  party_to TEXT,
  quality_to TEXT,
  remarks TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_kachi_parchi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  v_date TEXT NOT NULL,
  kp_no TEXT,
  type TEXT NOT NULL DEFAULT 'STOCK',
  purchase_party TEXT,
  cont_no TEXT,
  sal_date TEXT,
  sale_party TEXT,
  dsp_quality TEXT,
  quality_print TEXT,
  than INTEGER,
  meter REAL,
  conv_rate REAL,
  grey_rate REAL,
  stock_than INTEGER,
  stock_mtr REAL,
  avg REAL,
  rate_pur REAL,
  rate_sal REAL,
  el_cumi_num INTEGER,
  el_cumi_den INTEGER,
  bad_cumi_num INTEGER,
  bad_cumi_den INTEGER,
  el_meter REAL,
  baad_meter REAL,
  total_el_bad_mtrs REAL,
  printing_name TEXT,
  broker_name TEXT,
  remarks TEXT,
  term TEXT,
  img_no TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_kachi_parchi_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parchi_id INTEGER NOT NULL,
  sr_no INTEGER NOT NULL,
  than INTEGER,
  mtr REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_kachi_parchi_count (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parchi_id INTEGER NOT NULL,
  code TEXT,
  type TEXT,
  cal_count REAL,
  ends INTEGER,
  rate_per_lbs REAL,
  wt_per_mtr REAL,
  cost_per_mtr REAL,
  tot_lbs REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_packi_parchi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_no TEXT NOT NULL UNIQUE,
  v_date TEXT NOT NULL,
  purchase_party TEXT,
  kp_no TEXT,
  kp_all TEXT,
  pp_no TEXT,
  pp_date TEXT,
  quality TEXT,
  quality_print TEXT,
  meter_re REAL,
  meter_kam REAL,
  meter_net REAL,
  than INTEGER,
  kp_meter REAL,
  broker_name TEXT,
  broker_percent REAL,
  meter_fine_num INTEGER,
  meter_fine_den INTEGER,
  grey_rate REAL,
  wokc REAL,
  wkc_brk REAL,
  el_cumi_num INTEGER,
  el_cumi_den INTEGER,
  el_meter REAL,
  el_meter_mode TEXT,
  type TEXT,
  kaat_percent REAL,
  checkery REAL,
  commission REAL,
  conv_cont_no TEXT,
  sale_party TEXT,
  conv_cont_no_sale TEXT,
  commission_sale REAL,
  grey_rate_kp REAL,
  kaat_percent_sale REAL,
  checkery_sale REAL,
  broker_name_sale TEXT,
  broker_percent_sale REAL,
  remarks TEXT,
  sal_amt_diff REAL,
  woc REAL,
  wc REAL,
  wck REAL,
  printing_name TEXT,
  commission_total REAL,
  diff REAL,
  term_sal TEXT,
  type_rej TEXT,
  pending_finance TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_packi_parchi_bag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parchi_id INTEGER NOT NULL,
  section TEXT NOT NULL,
  quality TEXT,
  wt_per_meter REAL,
  bags REAL,
  rate REAL,
  amount REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS ext_packi_parchi_count (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parchi_id INTEGER NOT NULL,
  code TEXT,
  type TEXT,
  cal_count REAL,
  ends INTEGER,
  rate_per_lbs REAL,
  wt_per_mtr REAL,
  cost_per_mtr REAL,
  tot_lbs REAL
)`);

// --- INDEXES ---

const indexes = [
  "CREATE INDEX IF NOT EXISTS ix_ext_ypc_party ON ext_yarn_pur_contract(party_code)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ypc_status ON ext_yarn_pur_contract(status)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ypcd_contract ON ext_yarn_pur_contract_delivery(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ysc_party ON ext_yarn_sal_contract(party_code)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ysc_status ON ext_yarn_sal_contract(status)",
  "CREATE INDEX IF NOT EXISTS ix_ext_yscd_contract ON ext_yarn_sal_contract_delivery(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gpc_party ON ext_grey_pur_contract(party)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gpc_status ON ext_grey_pur_contract(status)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gpcd_contract ON ext_grey_pur_contract_delivery(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gsc_party ON ext_grey_sal_contract(party)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gsc_status ON ext_grey_sal_contract(status)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gscd_contract ON ext_grey_sal_contract_delivery(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gcc_party ON ext_grey_conv_contract(party)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gcc_status ON ext_grey_conv_contract(status)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gcw_contract ON ext_grey_conv_warp(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gcwft_contract ON ext_grey_conv_weft(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ypv_party ON ext_yarn_pur_voucher(party)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ypv_date ON ext_yarn_pur_voucher(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ypvl_voucher ON ext_yarn_pur_voucher_line(voucher_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ysv_party ON ext_yarn_sal_voucher(party)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ysv_date ON ext_yarn_sal_voucher(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ysvl_voucher ON ext_yarn_sal_voucher_line(voucher_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gs_party ON ext_godown_stock(purchase_party)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gs_date ON ext_godown_stock(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gsl_stock ON ext_godown_stock_line(stock_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gsc_stock ON ext_godown_stock_count(stock_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gt_date ON ext_grey_transfer(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gt_from ON ext_grey_transfer(party_from)",
  "CREATE INDEX IF NOT EXISTS ix_ext_gt_to ON ext_grey_transfer(party_to)",
  "CREATE INDEX IF NOT EXISTS ix_ext_kp_party ON ext_kachi_parchi(purchase_party)",
  "CREATE INDEX IF NOT EXISTS ix_ext_kp_date ON ext_kachi_parchi(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_ext_kpl_parchi ON ext_kachi_parchi_line(parchi_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_kpc_parchi ON ext_kachi_parchi_count(parchi_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_pp_party ON ext_packi_parchi(purchase_party)",
  "CREATE INDEX IF NOT EXISTS ix_ext_pp_date ON ext_packi_parchi(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_ext_pp_kpno ON ext_packi_parchi(kp_no)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ppb_parchi ON ext_packi_parchi_bag(parchi_id)",
  "CREATE INDEX IF NOT EXISTS ix_ext_ppc_parchi ON ext_packi_parchi_count(parchi_id)",
];

for (const sql of indexes) {
  await run(sql);
}

console.log(`\nInventory External migration: ${created} OK, ${skipped} skipped, ${errors} errors.`);
client.close();
