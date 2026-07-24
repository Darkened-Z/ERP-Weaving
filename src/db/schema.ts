import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  login: text("login").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  roleName: text("role_name").notNull(),
  status: text("status").notNull().default("A"),
});

export const companyProfile = sqliteTable("company_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  phone: text("phone"),
  currentFy: text("current_fy").notNull(),
  fyStart: text("fy_start").notNull(),
  fyEnd: text("fy_end").notNull(),
});

export const fiscalYears = sqliteTable("fiscal_years", {
  code: text("code").primaryKey(),
  description: text("description").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("A"),
});

export const chartOfAccounts = sqliteTable("chart_of_accounts", {
  code: text("code").primaryKey(),
  codeHead: text("code_head").notNull(),
  codeAuto: text("code_auto").notNull().default("0"),
  level: integer("level").notNull(),
  description: text("description").notNull(),
  descShort: text("desc_short"),
  address: text("address"),
  city: text("city"),
  phone: text("phone"),
  mobile: text("mobile"),
  email: text("email"),
  gstNo: text("gst_no"),
  ntn: text("ntn"),
  creditLimit: real("credit_limit"),
  bsCode: integer("bs_code"),
  plCode: integer("pl_code"),
  status: text("status").notNull().default("R"),
});

export const costCenters = sqliteTable("cost_centers", {
  code: integer("code").primaryKey(),
  description: text("description").notNull(),
  level: integer("level").notNull().default(1),
  parentCode: integer("parent_code"),
});

export const voucherTypes = sqliteTable("voucher_types", {
  vtype: text("vtype").primaryKey(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const transMain = sqliteTable("trans_main", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fyCode: text("fy_code").notNull(),
  vtype: text("vtype").notNull(),
  vno: integer("vno").notNull(),
  vdate: text("vdate").notNull(),
  vdateModified: text("vdate_modified"),
  accCode: text("acc_code"),
  term: text("term"),
  utCode: integer("ut_code"),
  narration: text("narration"),
});

export const transDetail = sqliteTable("trans_detail", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fyCode: text("fy_code").notNull(),
  vtype: text("vtype").notNull(),
  vno: integer("vno").notNull(),
  srno: integer("srno").notNull(),
  accCode: text("acc_code").notNull(),
  partyCode: text("party_code"),
  ccCode: integer("cc_code"),
  narration: text("narration"),
  debit: real("debit").notNull().default(0),
  credit: real("credit").notNull().default(0),
  chqNo: text("chq_no"),
  chqDate: text("chq_date"),
});

export const yarnCounts = sqliteTable("yarn_counts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  countCode: text("count_code").notNull().unique(),
  description: text("description").notNull(),
  ply: integer("ply").notNull().default(1),
  type: text("type").notNull().default("COTTON"),
  denier: real("denier"),
  status: text("status").notNull().default("A"),
});

export const looms = sqliteTable("looms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  loomNo: integer("loom_no").notNull().unique(),
  shed: text("shed").notNull(),
  type: text("type").notNull(),
  make: text("make"),
  width: real("width"),
  rpm: integer("rpm"),
  status: text("status").notNull().default("RUNNING"),
  currentContract: text("current_contract"),
  currentProduct: text("current_product"),
  currentBeam: text("current_beam"),
});

export const greyConstruction = sqliteTable("grey_construction", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  description: text("description").notNull(),
  reed: real("reed"),
  pick: real("pick"),
  width: real("width"),
  warpCount: text("warp_count"),
  weftCount: text("weft_count"),
  weaveType: text("weave_type").notNull().default("PLAIN"),
  selvage: text("selvage"),
  gsm: real("gsm"),
  status: text("status").notNull().default("A"),
});

export const contracts = sqliteTable("contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contractNo: text("contract_no").notNull(),
  fyCode: text("fy_code").notNull(),
  type: text("type").notNull(),
  party: text("party").notNull(),
  broker: text("broker"),
  product: text("product"),
  quantity: real("quantity"),
  rate: real("rate"),
  amount: real("amount"),
  unit: text("unit"),
  contractDate: text("contract_date"),
  deliveryDate: text("delivery_date"),
  status: text("status").notNull().default("A"),
  remarks: text("remarks"),
});

export const dailyProduction = sqliteTable("daily_production", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productionDate: text("production_date").notNull(),
  shed: text("shed").notNull(),
  shift: text("shift").notNull(),
  loomNo: integer("loom_no").notNull(),
  contractNo: text("contract_no"),
  greyCode: text("grey_code"),
  meters: real("meters").notNull().default(0),
  picks: real("picks").notNull().default(0),
  gradeA: real("grade_a").notNull().default(0),
  gradeB: real("grade_b").notNull().default(0),
  gradeC: real("grade_c").notNull().default(0),
  rejection: real("rejection").notNull().default(0),
  rpm: integer("rpm"),
  efficiency: real("efficiency"),
  weaverName: text("weaver_name"),
});

export const chartParts = sqliteTable("chart_parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  description: text("description").notNull(),
  category: text("category"),
  unit: text("unit").notNull().default("PCS"),
  minStock: real("min_stock").notNull().default(0),
  currentStock: real("current_stock").notNull().default(0),
  avgCost: real("avg_cost").notNull().default(0),
  lastPurchaseDate: text("last_purchase_date"),
  status: text("status").notNull().default("A"),
});

export const beams = sqliteTable("beams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  beamNo: text("beam_no").notNull().unique(),
  type: text("type").notNull(),
  contractNo: text("contract_no"),
  product: text("product"),
  yarnCount: text("yarn_count"),
  ends: integer("ends"),
  length: real("length"),
  weight: real("weight"),
  status: text("status").notNull().default("RUNNING"),
  loomNo: integer("loom_no"),
  receivedDate: text("received_date"),
});

export const systemLocking = sqliteTable("system_locking", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  module: text("module").notNull().unique(),
  description: text("description").notNull(),
  lockDate: text("lock_date"),
  lockedBy: text("locked_by"),
});

export const cities = sqliteTable("cities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const companyUnits = sqliteTable("company_units", {
  code: text("code").primaryKey(),
  srno: integer("srno"),
  description: text("description").notNull(),
});

export const beamStatuses = sqliteTable("beam_statuses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull().unique(),
});

export const weavers = sqliteTable("weavers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: integer("code").notNull().unique(),
  name: text("name").notNull(),
  nameShort: text("name_short"),
  address: text("address"),
  cell: text("cell"),
  phone: text("phone"),
});

export const yarnBlends = sqliteTable("yarn_blends", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  description: text("description").notNull().unique(),
});

export const yarnBrands = sqliteTable("yarn_brands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const yarnFibers = sqliteTable("yarn_fibers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: integer("code").notNull().unique(),
  type: text("type"),
  description: text("description").notNull(),
  denier: text("denier"),
  length: text("length"),
});

export const greyDspChart = sqliteTable("grey_dsp_chart", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: integer("code").notNull().unique(),
  name: text("name").notNull(),
  nameShort: text("name_short"),
  cell: text("cell"),
  phone: text("phone"),
});

export const doPartyChart = sqliteTable("do_party_chart", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: integer("code").notNull().unique(),
  name: text("name").notNull(),
  nameShort: text("name_short"),
  cell: text("cell"),
  phone: text("phone"),
});

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: integer("code").notNull().unique(),
  description: text("description").notNull(),
  type: text("type").notNull().default("GREY"),
});

export const productionStaff = sqliteTable("production_staff", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: integer("code").notNull(),
  level: integer("level").notNull().default(1),
  name: text("name").notNull(),
  nameShort: text("name_short"),
  cell: text("cell"),
  phone: text("phone"),
  shed: integer("shed"),
  shift: text("shift"),
  status: text("status").notNull().default("A"),
});

export const partyCounts = sqliteTable("party_counts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partyCode: text("party_code").notNull(),
  countCode: integer("count_code").notNull(),
  ratePerLbs: real("rate_per_lbs"),
  calCountWeft: real("cal_count_weft"),
  calCountWarp: real("cal_count_warp"),
  status: text("status"),
  trnType: text("trn_type"),
  countGroup: text("count_group"),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: integer("code").notNull().unique(),
  description: text("description").notNull(),
  mainDesc: text("main_desc"),
  subDesc: text("sub_desc"),
  mainCode: integer("main_code"),
  subCode: integer("sub_code"),
});

export const productsMain = sqliteTable("products_main", {
  code: integer("code").primaryKey(),
  description: text("description").notNull(),
});

export const productsSub = sqliteTable("products_sub", {
  code: integer("code").primaryKey(),
  description: text("description").notNull(),
});

export const chartDefine = sqliteTable("chart_define", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: integer("code").notNull().unique(),
  description: text("description").notNull(),
  srno: integer("srno"),
});

export const yarnTransactions = sqliteTable("yarn_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transType: text("trans_type").notNull(),
  transDate: text("trans_date").notNull(),
  transNo: integer("trans_no").notNull(),
  fyCode: text("fy_code").notNull(),
  party: text("party"),
  yarnCount: text("yarn_count"),
  bags: integer("bags"),
  weightKg: real("weight_kg"),
  rate: real("rate"),
  amount: real("amount"),
  vehicleNo: text("vehicle_no"),
  biltyNo: text("bilty_no"),
  fromLocation: text("from_location"),
  toLocation: text("to_location"),
  remarks: text("remarks"),
  status: text("status").notNull().default("A"),
});

export const beamTransactions = sqliteTable("beam_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transType: text("trans_type").notNull(),
  transDate: text("trans_date").notNull(),
  transNo: integer("trans_no").notNull(),
  fyCode: text("fy_code").notNull(),
  beamNo: text("beam_no"),
  party: text("party"),
  yarnCount: text("yarn_count"),
  ends: integer("ends"),
  length: real("length"),
  weight: real("weight"),
  fromLocation: text("from_location"),
  toLocation: text("to_location"),
  status: text("status").notNull().default("A"),
});

export const knottingTransactions = sqliteTable("knotting_transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transDate: text("trans_date").notNull(),
  transNo: integer("trans_no").notNull(),
  fyCode: text("fy_code").notNull(),
  contractNo: text("contract_no"),
  beamNo: text("beam_no"),
  transType: text("trans_type").notNull(),
  weaver: text("weaver"),
  loomNo: integer("loom_no"),
  rate: real("rate"),
  amount: real("amount"),
  status: text("status").notNull().default("A"),
});

export const productionHours = sqliteTable("production_hours", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scheduleDate: text("schedule_date").notNull(),
  shed: text("shed").notNull(),
  shift: text("shift").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  hours: real("hours").notNull(),
  loomsRunning: integer("looms_running"),
  remarks: text("remarks"),
});

export const greyDespatch = sqliteTable("grey_despatch", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  despatchNo: integer("despatch_no").notNull(),
  fyCode: text("fy_code").notNull(),
  despatchDate: text("despatch_date").notNull(),
  party: text("party").notNull(),
  partyCode: integer("party_code"),
  product: text("product"),
  meters: real("meters"),
  rolls: integer("rolls"),
  vehicleNo: text("vehicle_no"),
  biltyNo: text("bilty_no"),
  gatePassNo: text("gate_pass_no"),
  status: text("status").notNull().default("A"),
});

export const storeDemands = sqliteTable("store_demands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  demandNo: integer("demand_no").notNull(),
  fyCode: text("fy_code").notNull(),
  demandDate: text("demand_date").notNull(),
  department: text("department").notNull(),
  requestedBy: text("requested_by"),
  itemCount: integer("item_count"),
  totalAmount: real("total_amount"),
  status: text("status").notNull().default("P"),
  remarks: text("remarks"),
});

export const storeGrn = sqliteTable("store_grn", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  grnNo: integer("grn_no").notNull(),
  fyCode: text("fy_code").notNull(),
  grnDate: text("grn_date").notNull(),
  supplier: text("supplier").notNull(),
  invoiceNo: text("invoice_no"),
  itemCount: integer("item_count"),
  totalAmount: real("total_amount"),
  status: text("status").notNull().default("A"),
});

export const storeGatepass = sqliteTable("store_gatepass", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gatepassNo: integer("gatepass_no").notNull(),
  fyCode: text("fy_code").notNull(),
  gatepassDate: text("gatepass_date").notNull(),
  gatepassType: text("gatepass_type").notNull(),
  party: text("party").notNull(),
  vehicleNo: text("vehicle_no"),
  purpose: text("purpose"),
  itemCount: integer("item_count"),
  status: text("status").notNull().default("A"),
});

export const inventoryOpening = sqliteTable("inventory_opening", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fyCode: text("fy_code").notNull(),
  itemType: text("item_type").notNull(),
  itemCode: text("item_code").notNull(),
  description: text("description").notNull(),
  openingQty: real("opening_qty").notNull().default(0),
  openingRate: real("opening_rate").notNull().default(0),
  openingAmount: real("opening_amount").notNull().default(0),
  unit: text("unit").notNull().default("KG"),
  location: text("location"),
  entryDate: text("entry_date"),
  status: text("status").notNull().default("A"),
});

export const branchOpening = sqliteTable("branch_opening", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  branchCode: text("branch_code").notNull().unique(),
  branchName: text("branch_name").notNull(),
  address: text("address"),
  city: text("city"),
  phone: text("phone"),
  fyCode: text("fy_code").notNull(),
  openingDate: text("opening_date").notNull(),
  status: text("status").notNull().default("A"),
});

export const greyPakiParchi = sqliteTable("grey_paki_parchi", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ppNo: integer("pp_no").notNull(),
  fyCode: text("fy_code").notNull(),
  ppDate: text("pp_date").notNull(),
  party: text("party").notNull(),
  partyCode: text("party_code"),
  greyCode: integer("grey_code"),
  loomType: text("loom_type"),
  qtyThan: integer("qty_than"),
  qtyMtrs: real("qty_mtrs"),
  qtyMtrsNet: real("qty_mtrs_net"),
  greyPick: integer("grey_pick"),
  greyWidth: real("grey_width"),
  rate: real("rate"),
  amount: real("amount"),
  contractNo: text("contract_no"),
  remarks: text("remarks"),
  status: text("status").notNull().default("A"),
});
