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
    if (e.message?.includes("already exists") || e.message?.includes("duplicate column")) {
      console.log("SKIP:", sql.substring(0, 90));
      skipped++;
    } else {
      console.log("ERR:", e.message);
      errors++;
    }
  }
}

await client.execute("PRAGMA foreign_keys = ON");

// --- CONTRACTS ---

await run(`CREATE TABLE IF NOT EXISTS int_yarn_contract (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cont_no TEXT NOT NULL UNIQUE,
  cont_date TEXT NOT NULL,
  expd_date TEXT,
  ref_no TEXT,
  party TEXT,
  broker TEXT,
  brokage_per_bag REAL,
  age_percent REAL,
  count_code TEXT,
  ratio TEXT,
  brand TEXT,
  qty_bags REAL,
  qty_lbs REAL,
  rate_per_lbs REAL,
  delivery_place TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'R',
  l_cont_no INTEGER,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_yarn_contract_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES int_yarn_contract(id) ON DELETE CASCADE,
  delivery_date TEXT,
  bags REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS int_yarn_purchase_contract (
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

await run(`CREATE TABLE IF NOT EXISTS int_yarn_purchase_contract_delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES int_yarn_purchase_contract(id) ON DELETE CASCADE,
  delivery_date TEXT,
  do_no TEXT,
  bags REAL,
  ycd_dlv_loc TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_grey_conversion_contract (
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

await run(`CREATE TABLE IF NOT EXISTS int_grey_conversion_warp (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES int_grey_conversion_contract(id) ON DELETE CASCADE,
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

await run(`CREATE TABLE IF NOT EXISTS int_grey_conversion_weft (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES int_grey_conversion_contract(id) ON DELETE CASCADE,
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

await run(`CREATE TABLE IF NOT EXISTS int_beam_contract_ext_ws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cont_no TEXT NOT NULL UNIQUE,
  cont_date TEXT NOT NULL,
  exp_date TEXT,
  party TEXT,
  sizing_party TEXT,
  warping_party TEXT,
  rate_per_beam REAL,
  terms TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'R',
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_knotting_contract (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cont_no TEXT NOT NULL UNIQUE,
  cont_date TEXT NOT NULL,
  exp_date TEXT,
  party TEXT,
  type TEXT,
  rate_per_ends REAL,
  rate_per_beam REAL,
  terms TEXT,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'R',
  posted_date TEXT,
  modified_date TEXT
)`);

// --- YARN RECEIPT / TRANSFER ---

await run(`CREATE TABLE IF NOT EXISTS int_yarn_receipt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_date TEXT NOT NULL,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  time TEXT,
  book_do_bilty_no TEXT,
  do_date TEXT,
  lgp_no TEXT,
  gp_date TEXT,
  party TEXT,
  trn_type TEXT,
  condition TEXT NOT NULL DEFAULT 'FRS',
  conv_cont_no TEXT,
  pur_cont_no TEXT,
  yarn_party_to TEXT,
  time_to TEXT,
  rate_per_lbs_to REAL,
  amount REAL,
  location_from TEXT,
  img_block TEXT,
  stock_bag REAL,
  stock_lbs REAL,
  count_code TEXT,
  warp TEXT,
  weft TEXT,
  bags REAL,
  qty_lbs REAL,
  rate_per_lbs REAL,
  brand TEXT,
  yarn_lot_no TEXT,
  set_no TEXT,
  ratio_text TEXT,
  remarks TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_yarn_receipt_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES int_yarn_receipt(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  carton_no TEXT,
  gross_kgs REAL,
  net_kgs REAL,
  net_lbs REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS int_yarn_transfer (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_date TEXT NOT NULL,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  type TEXT,
  condition TEXT NOT NULL DEFAULT 'FRS',
  time TEXT,
  transfer_from_party TEXT,
  location_from TEXT,
  transfer_to_party TEXT,
  location_to TEXT,
  stock_bag REAL,
  stock_lbs REAL,
  count_code TEXT,
  qty_bags REAL,
  qty_lbs REAL,
  amount REAL,
  rate_per_lbs REAL,
  brand TEXT,
  yarn_lot_no TEXT,
  set_no TEXT,
  img_block TEXT,
  remarks TEXT,
  rkd REAL,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_yarn_transfer_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL REFERENCES int_yarn_transfer(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  carton_no TEXT,
  gross_kgs REAL,
  net_kgs REAL,
  net_lbs REAL
)`);

// --- EMPTY BEAM ISSUE / RETURN ---

await run(`CREATE TABLE IF NOT EXISTS int_empty_beam_issue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_date TEXT NOT NULL,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  trn_type TEXT,
  status_type TEXT,
  szg_wrp_party TEXT,
  conv_party TEXT,
  slip_no TEXT,
  desp_loc TEXT,
  gp_no TEXT,
  veh_reg_no TEXT,
  driver_name TEXT,
  remarks TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_empty_beam_issue_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL REFERENCES int_empty_beam_issue(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  beam_hash TEXT,
  company_name TEXT,
  empty_b_weight REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS int_empty_beam_return (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_date TEXT NOT NULL,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  trn_type TEXT NOT NULL DEFAULT 'SZG',
  status_type TEXT NOT NULL DEFAULT 'EXT',
  szg_wrp_party TEXT,
  conv_party TEXT,
  slip_no TEXT,
  desp_loc TEXT,
  gp_no TEXT,
  veh_reg_no TEXT,
  driver_name TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_empty_beam_return_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES int_empty_beam_return(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  beam_hash TEXT,
  company_name TEXT,
  empty_b_weight REAL
)`);

// --- WARPED BEAM RECEIVING ---

await run(`CREATE TABLE IF NOT EXISTS int_warped_beam_receiving (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_date TEXT NOT NULL,
  time TEXT,
  v_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'SZG',
  gp_no TEXT,
  lv_no INTEGER,
  freight_charges REAL,
  total_amount REAL,
  un_posted_bills TEXT,
  del_bill TEXT,
  bill_no TEXT,
  bill_date TEXT,
  billing_status TEXT,
  beam_receiving_from TEXT,
  beam_stock_loaded TEXT,
  remarks_destination TEXT,
  sizing_gp_no TEXT,
  gp_date TEXT,
  result_count_szg TEXT,
  bm_sale_party TEXT,
  gulley REAL,
  emt_bag REAL,
  shoper REAL,
  waste REAL,
  gatta REAL,
  head_cone_qty REAL,
  head_cone_kgs REAL,
  total_amount_final REAL,
  gst_ftx REAL,
  net_weight_rate REAL,
  amt_tot REAL,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_warped_beam_receiving_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receiving_id INTEGER NOT NULL REFERENCES int_warped_beam_receiving(id) ON DELETE CASCADE,
  r_date TEXT,
  yarn_lot_no TEXT,
  yarn_brand TEXT,
  set_no TEXT,
  beam_set_no TEXT,
  beam_no TEXT,
  beam_status TEXT,
  beam_loaded_hnk REAL,
  empty_kg REAL,
  yarn_bms_net_lbs REAL,
  beam_length REAL,
  warping_cnt_no TEXT,
  wt REAL,
  width REAL,
  ends INTEGER,
  rate REAL,
  length REAL,
  conv REAL,
  amount REAL,
  gp_no_line TEXT
)`);

// --- KNOTTING / SARNING BILL ---

await run(`CREATE TABLE IF NOT EXISTS int_knotting_sarning (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_date TEXT NOT NULL,
  party TEXT,
  type TEXT,
  rate_per_ends REAL,
  rate_per_beam REAL,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  warp_cont_noyy TEXT,
  find_date TEXT,
  un_posted_bills TEXT,
  del_bill TEXT,
  billing_status TEXT,
  bill_no TEXT,
  bill_date TEXT,
  billing_allowed TEXT,
  warp_contnoyy TEXT,
  rem TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_knotting_sarning_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  knotting_id INTEGER NOT NULL REFERENCES int_knotting_sarning(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  beam_set_no TEXT,
  no_of_beam_hash INTEGER,
  beam_length REAL,
  issue_date TEXT,
  k_date TEXT,
  shd_hash TEXT,
  lm_hash TEXT,
  ext_shr_age REAL,
  dsp_type TEXT,
  kn_cont_no TEXT,
  ends INTEGER,
  amount REAL,
  extra_charger REAL,
  ext_amt REAL,
  net_amt REAL,
  wt REAL,
  mtr REAL,
  l_hash TEXT,
  k_and_l TEXT
)`);

// --- GREY CLOTH DESPATCH ---

await run(`CREATE TABLE IF NOT EXISTS int_grey_despatch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_date TEXT NOT NULL,
  time TEXT,
  v_no TEXT NOT NULL UNIQUE,
  l_no INTEGER,
  do_v_no_from TEXT,
  do_v_no_to TEXT,
  set_hash_all_than_prd_hash_set_hash TEXT,
  despatch_to TEXT,
  despatch_location TEXT,
  despatch_from TEXT,
  conv_cont_no TEXT,
  post_lot_no TEXT,
  shed_no TEXT,
  party TEXT,
  do_party TEXT,
  than_qty REAL,
  conv_rate REAL,
  amnt REAL,
  gst REAL,
  further REAL,
  gp_no TEXT,
  gp_date TEXT,
  date_from TEXT,
  date_to TEXT,
  amt_tot REAL,
  ft_weave TEXT,
  design_no TEXT,
  enc_code TEXT,
  supervisor TEXT,
  vehicle_no TEXT,
  trans_adda TEXT,
  silvag_quality TEXT,
  brkg_per_mtr REAL,
  comm REAL,
  product_brand TEXT,
  loom_type TEXT,
  blend TEXT,
  grey_code TEXT,
  width REAL,
  remarks TEXT,
  update_count_block TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_grey_despatch_line (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  despatch_id INTEGER NOT NULL REFERENCES int_grey_despatch(id) ON DELETE CASCADE,
  sr_no INTEGER NOT NULL,
  t_sr_no INTEGER,
  a REAL,
  b REAL,
  c REAL,
  cp_rej REAL,
  length_mtrs REAL
)`);

await run(`CREATE TABLE IF NOT EXISTS int_grey_despatch_update_count (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  despatch_id INTEGER NOT NULL REFERENCES int_grey_despatch(id) ON DELETE CASCADE,
  count_code TEXT,
  count_description TEXT,
  type TEXT,
  cal_count REAL,
  ends INTEGER,
  rate_per_lbs REAL,
  wt_per_mtr REAL,
  tot_lbs REAL,
  amount REAL,
  type_rej TEXT
)`);

await run(`CREATE TABLE IF NOT EXISTS int_grey_despatch_dami (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  v_date TEXT NOT NULL,
  v_no TEXT NOT NULL UNIQUE,
  lv_no INTEGER,
  original_despatch_id INTEGER REFERENCES int_grey_despatch(id) ON DELETE CASCADE,
  party TEXT,
  do_party TEXT,
  than INTEGER,
  mtrs REAL,
  remarks TEXT,
  printed_at TEXT,
  posted_date TEXT,
  modified_date TEXT
)`);

// --- EXTEND EXISTING TABLES ---
// daily_production — Oracle field additions

const alterDailyProduction = [
  "ALTER TABLE daily_production ADD COLUMN folding_stock REAL",
  "ALTER TABLE daily_production ADD COLUMN set_no TEXT",
  "ALTER TABLE daily_production ADD COLUMN looms INTEGER",
  "ALTER TABLE daily_production ADD COLUMN grade TEXT",
  "ALTER TABLE daily_production ADD COLUMN remarks TEXT",
  "ALTER TABLE daily_production ADD COLUMN lv_no INTEGER",
  "ALTER TABLE daily_production ADD COLUMN mm_than_sr_no TEXT",
  "ALTER TABLE daily_production ADD COLUMN a_count REAL",
  "ALTER TABLE daily_production ADD COLUMN b_count REAL",
  "ALTER TABLE daily_production ADD COLUMN c_count REAL",
  "ALTER TABLE daily_production ADD COLUMN ppc REAL",
  "ALTER TABLE daily_production ADD COLUMN total_count REAL",
  "ALTER TABLE daily_production ADD COLUMN rej REAL",
  "ALTER TABLE daily_production ADD COLUMN beam_set_no TEXT",
  "ALTER TABLE daily_production ADD COLUMN wast_wt_kg REAL",
  "ALTER TABLE daily_production ADD COLUMN beam_no TEXT",
  "ALTER TABLE daily_production ADD COLUMN ends INTEGER",
  "ALTER TABLE daily_production ADD COLUMN b_length REAL",
  "ALTER TABLE daily_production ADD COLUMN rcvd_mtr REAL",
  "ALTER TABLE daily_production ADD COLUMN diff REAL",
  "ALTER TABLE daily_production ADD COLUMN shrinkage REAL",
  "ALTER TABLE daily_production ADD COLUMN prod_diff REAL",
  "ALTER TABLE daily_production ADD COLUMN product_quality TEXT",
  "ALTER TABLE daily_production ADD COLUMN product_brand TEXT",
  "ALTER TABLE daily_production ADD COLUMN salvage TEXT",
  "ALTER TABLE daily_production ADD COLUMN conv_cont_party TEXT",
  "ALTER TABLE daily_production ADD COLUMN beam_cont_party TEXT",
  "ALTER TABLE daily_production ADD COLUMN szg_party TEXT",
  "ALTER TABLE daily_production ADD COLUMN shift_incharge TEXT",
  "ALTER TABLE daily_production ADD COLUMN tm REAL",
  "ALTER TABLE daily_production ADD COLUMN pm REAL",
  "ALTER TABLE daily_production ADD COLUMN a_shift REAL",
  "ALTER TABLE daily_production ADD COLUMN b_shift REAL",
  "ALTER TABLE daily_production ADD COLUMN c_shift REAL",
  "ALTER TABLE daily_production ADD COLUMN shift_1 REAL",
  "ALTER TABLE daily_production ADD COLUMN shift_2 REAL",
  "ALTER TABLE daily_production ADD COLUMN shift_3 REAL",
  "ALTER TABLE daily_production ADD COLUMN no_of_widths INTEGER",
  "ALTER TABLE daily_production ADD COLUMN prd_code TEXT",
  "ALTER TABLE daily_production ADD COLUMN lot_no TEXT",
  "ALTER TABLE daily_production ADD COLUMN tor_own TEXT",
  "ALTER TABLE daily_production ADD COLUMN posted_date TEXT",
  "ALTER TABLE daily_production ADD COLUMN modified_date TEXT",
];

for (const sql of alterDailyProduction) {
  await run(sql);
}

// --- INDEXES ---

const indexes = [
  "CREATE INDEX IF NOT EXISTS ix_int_yc_party ON int_yarn_contract(party)",
  "CREATE INDEX IF NOT EXISTS ix_int_yc_status ON int_yarn_contract(status)",
  "CREATE INDEX IF NOT EXISTS ix_int_yc_date ON int_yarn_contract(cont_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_ycd_contract ON int_yarn_contract_delivery(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_ypc_party ON int_yarn_purchase_contract(party_code)",
  "CREATE INDEX IF NOT EXISTS ix_int_ypc_status ON int_yarn_purchase_contract(status)",
  "CREATE INDEX IF NOT EXISTS ix_int_ypcd_contract ON int_yarn_purchase_contract_delivery(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_gcc_party ON int_grey_conversion_contract(party)",
  "CREATE INDEX IF NOT EXISTS ix_int_gcc_status ON int_grey_conversion_contract(status)",
  "CREATE INDEX IF NOT EXISTS ix_int_gcw_contract ON int_grey_conversion_warp(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_gcwft_contract ON int_grey_conversion_weft(contract_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_bcew_party ON int_beam_contract_ext_ws(party)",
  "CREATE INDEX IF NOT EXISTS ix_int_bcew_status ON int_beam_contract_ext_ws(status)",
  "CREATE INDEX IF NOT EXISTS ix_int_kc_party ON int_knotting_contract(party)",
  "CREATE INDEX IF NOT EXISTS ix_int_kc_status ON int_knotting_contract(status)",
  "CREATE INDEX IF NOT EXISTS ix_int_yr_party ON int_yarn_receipt(party)",
  "CREATE INDEX IF NOT EXISTS ix_int_yr_date ON int_yarn_receipt(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_yrl_receipt ON int_yarn_receipt_line(receipt_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_yt_date ON int_yarn_transfer(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_yt_from ON int_yarn_transfer(transfer_from_party)",
  "CREATE INDEX IF NOT EXISTS ix_int_yt_to ON int_yarn_transfer(transfer_to_party)",
  "CREATE INDEX IF NOT EXISTS ix_int_ytl_transfer ON int_yarn_transfer_line(transfer_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_ebi_date ON int_empty_beam_issue(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_ebi_party ON int_empty_beam_issue(szg_wrp_party)",
  "CREATE INDEX IF NOT EXISTS ix_int_ebil_issue ON int_empty_beam_issue_line(issue_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_ebr_date ON int_empty_beam_return(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_ebr_party ON int_empty_beam_return(szg_wrp_party)",
  "CREATE INDEX IF NOT EXISTS ix_int_ebrl_return ON int_empty_beam_return_line(return_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_wbr_date ON int_warped_beam_receiving(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_wbr_party ON int_warped_beam_receiving(beam_receiving_from)",
  "CREATE INDEX IF NOT EXISTS ix_int_wbrl_receiving ON int_warped_beam_receiving_line(receiving_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_ks_date ON int_knotting_sarning(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_ks_party ON int_knotting_sarning(party)",
  "CREATE INDEX IF NOT EXISTS ix_int_ksl_knotting ON int_knotting_sarning_line(knotting_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_gd_date ON int_grey_despatch(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_gd_party ON int_grey_despatch(party)",
  "CREATE INDEX IF NOT EXISTS ix_int_gdl_despatch ON int_grey_despatch_line(despatch_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_gduc_despatch ON int_grey_despatch_update_count(despatch_id)",
  "CREATE INDEX IF NOT EXISTS ix_int_gdd_date ON int_grey_despatch_dami(v_date)",
  "CREATE INDEX IF NOT EXISTS ix_int_gdd_original ON int_grey_despatch_dami(original_despatch_id)",
];

for (const sql of indexes) {
  await run(sql);
}

console.log(`\nInventory Internal migration: ${created} OK, ${skipped} skipped, ${errors} errors.`);
client.close();
