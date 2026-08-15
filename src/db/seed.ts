import { createClient } from "@libsql/client";
import path from "path";

const isLocal = !process.env.TURSO_DATABASE_URL;
const client = createClient(
  isLocal
    ? { url: `file:${path.join(process.cwd(), "data.db")}` }
    : { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }
);

async function seed() {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS grey_paki_parchi;
    DROP TABLE IF EXISTS branch_opening;
    DROP TABLE IF EXISTS inventory_opening;
    DROP TABLE IF EXISTS store_gatepass;
    DROP TABLE IF EXISTS store_grn;
    DROP TABLE IF EXISTS store_demands;
    DROP TABLE IF EXISTS grey_despatch;
    DROP TABLE IF EXISTS production_hours;
    DROP TABLE IF EXISTS knotting_transactions;
    DROP TABLE IF EXISTS beam_transactions;
    DROP TABLE IF EXISTS yarn_transactions;
    DROP TABLE IF EXISTS chart_define;
    DROP TABLE IF EXISTS products_sub;
    DROP TABLE IF EXISTS products_main;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS party_counts;
    DROP TABLE IF EXISTS production_staff;
    DROP TABLE IF EXISTS locations;
    DROP TABLE IF EXISTS do_party_chart;
    DROP TABLE IF EXISTS grey_dsp_chart;
    DROP TABLE IF EXISTS yarn_fibers;
    DROP TABLE IF EXISTS yarn_brands;
    DROP TABLE IF EXISTS yarn_blends;
    DROP TABLE IF EXISTS weavers;
    DROP TABLE IF EXISTS beam_statuses;
    DROP TABLE IF EXISTS company_units;
    DROP TABLE IF EXISTS cities;
    DROP TABLE IF EXISTS system_locking;
    DROP TABLE IF EXISTS beams;
    DROP TABLE IF EXISTS chart_parts;
    DROP TABLE IF EXISTS daily_production;
    DROP TABLE IF EXISTS contracts;
    DROP TABLE IF EXISTS grey_construction;
    DROP TABLE IF EXISTS looms;
    DROP TABLE IF EXISTS yarn_counts;
    DROP TABLE IF EXISTS trans_detail;
    DROP TABLE IF EXISTS trans_main;
    DROP TABLE IF EXISTS voucher_types;
    DROP TABLE IF EXISTS cost_centers;
    DROP TABLE IF EXISTS chart_of_accounts;
    DROP TABLE IF EXISTS fiscal_years;
    DROP TABLE IF EXISTS company_profile;
    DROP TABLE IF EXISTS users;

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE company_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      phone TEXT,
      current_fy TEXT NOT NULL,
      fy_start TEXT NOT NULL,
      fy_end TEXT NOT NULL
    );

    CREATE TABLE fiscal_years (
      code TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE chart_of_accounts (
      code TEXT PRIMARY KEY,
      code_head TEXT NOT NULL,
      code_auto TEXT NOT NULL DEFAULT '0',
      level INTEGER NOT NULL,
      description TEXT NOT NULL,
      desc_short TEXT,
      address TEXT,
      city TEXT,
      phone TEXT,
      mobile TEXT,
      email TEXT,
      gst_no TEXT,
      ntn TEXT,
      credit_limit REAL,
      bs_code INTEGER,
      pl_code INTEGER,
      status TEXT NOT NULL DEFAULT 'R'
    );

    CREATE TABLE cost_centers (
      code INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      parent_code INTEGER
    );

    CREATE TABLE voucher_types (
      vtype TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE trans_main (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fy_code TEXT NOT NULL,
      vtype TEXT NOT NULL,
      vno INTEGER NOT NULL,
      vdate TEXT NOT NULL,
      vdate_modified TEXT,
      acc_code TEXT,
      term TEXT,
      ut_code INTEGER,
      narration TEXT
    );

    CREATE TABLE trans_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fy_code TEXT NOT NULL,
      vtype TEXT NOT NULL,
      vno INTEGER NOT NULL,
      srno INTEGER NOT NULL,
      acc_code TEXT NOT NULL,
      party_code TEXT,
      cc_code INTEGER,
      narration TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      chq_no TEXT,
      chq_date TEXT
    );

    CREATE TABLE yarn_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      count_code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      ply INTEGER NOT NULL DEFAULT 1,
      type TEXT NOT NULL DEFAULT 'COTTON',
      denier REAL,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE looms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      loom_no INTEGER NOT NULL UNIQUE,
      shed TEXT NOT NULL,
      type TEXT NOT NULL,
      make TEXT,
      width REAL,
      rpm INTEGER,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      current_contract TEXT,
      current_product TEXT,
      current_beam TEXT
    );

    CREATE TABLE grey_construction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      reed REAL,
      pick REAL,
      width REAL,
      warp_count TEXT,
      weft_count TEXT,
      weave_type TEXT NOT NULL DEFAULT 'PLAIN',
      selvage TEXT,
      gsm REAL,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_no TEXT NOT NULL,
      fy_code TEXT NOT NULL,
      type TEXT NOT NULL,
      party TEXT NOT NULL,
      broker TEXT,
      product TEXT,
      quantity REAL,
      rate REAL,
      amount REAL,
      unit TEXT,
      contract_date TEXT,
      delivery_date TEXT,
      status TEXT NOT NULL DEFAULT 'A',
      remarks TEXT
    );

    CREATE TABLE daily_production (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      production_date TEXT NOT NULL,
      shed TEXT NOT NULL,
      shift TEXT NOT NULL,
      loom_no INTEGER NOT NULL,
      contract_no TEXT,
      grey_code TEXT,
      meters REAL NOT NULL DEFAULT 0,
      picks REAL NOT NULL DEFAULT 0,
      grade_a REAL NOT NULL DEFAULT 0,
      grade_b REAL NOT NULL DEFAULT 0,
      grade_c REAL NOT NULL DEFAULT 0,
      rejection REAL NOT NULL DEFAULT 0,
      rpm INTEGER,
      efficiency REAL,
      weaver_name TEXT
    );

    CREATE TABLE chart_parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      category TEXT,
      unit TEXT NOT NULL DEFAULT 'PCS',
      min_stock REAL NOT NULL DEFAULT 0,
      current_stock REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      last_purchase_date TEXT,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE beams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      beam_no TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      contract_no TEXT,
      product TEXT,
      yarn_count TEXT,
      ends INTEGER,
      length REAL,
      weight REAL,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      loom_no INTEGER,
      received_date TEXT
    );

    CREATE TABLE system_locking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      lock_date TEXT,
      locked_by TEXT
    );

    CREATE TABLE cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE company_units (
      code TEXT PRIMARY KEY,
      srno INTEGER,
      description TEXT NOT NULL
    );

    CREATE TABLE beam_statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL UNIQUE
    );

    CREATE TABLE weavers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_short TEXT,
      address TEXT,
      cell TEXT,
      phone TEXT
    );

    CREATE TABLE yarn_blends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL UNIQUE
    );

    CREATE TABLE yarn_brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE yarn_fibers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code INTEGER NOT NULL UNIQUE,
      type TEXT,
      description TEXT NOT NULL,
      denier TEXT,
      length TEXT
    );

    CREATE TABLE grey_dsp_chart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_short TEXT,
      cell TEXT,
      phone TEXT
    );

    CREATE TABLE do_party_chart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_short TEXT,
      cell TEXT,
      phone TEXT
    );

    CREATE TABLE locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code INTEGER NOT NULL UNIQUE,
      description TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'GREY'
    );

    CREATE TABLE production_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code INTEGER NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      name_short TEXT,
      cell TEXT,
      phone TEXT,
      shed INTEGER,
      shift TEXT,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE party_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      party_code TEXT NOT NULL,
      count_code INTEGER NOT NULL,
      rate_per_lbs REAL,
      cal_count_weft REAL,
      cal_count_warp REAL,
      status TEXT,
      trn_type TEXT,
      count_group TEXT
    );

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code INTEGER NOT NULL UNIQUE,
      description TEXT NOT NULL,
      main_desc TEXT,
      sub_desc TEXT,
      main_code INTEGER,
      sub_code INTEGER
    );

    CREATE TABLE products_main (
      code INTEGER PRIMARY KEY,
      description TEXT NOT NULL
    );

    CREATE TABLE products_sub (
      code INTEGER PRIMARY KEY,
      description TEXT NOT NULL
    );

    CREATE TABLE chart_define (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code INTEGER NOT NULL UNIQUE,
      description TEXT NOT NULL,
      srno INTEGER
    );

    CREATE TABLE yarn_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trans_type TEXT NOT NULL,
      trans_date TEXT NOT NULL,
      trans_no INTEGER NOT NULL,
      fy_code TEXT NOT NULL,
      party TEXT,
      yarn_count TEXT,
      bags INTEGER,
      weight_kg REAL,
      rate REAL,
      amount REAL,
      vehicle_no TEXT,
      bilty_no TEXT,
      from_location TEXT,
      to_location TEXT,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE beam_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trans_type TEXT NOT NULL,
      trans_date TEXT NOT NULL,
      trans_no INTEGER NOT NULL,
      fy_code TEXT NOT NULL,
      beam_no TEXT,
      party TEXT,
      yarn_count TEXT,
      ends INTEGER,
      length REAL,
      weight REAL,
      from_location TEXT,
      to_location TEXT,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE knotting_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trans_date TEXT NOT NULL,
      trans_no INTEGER NOT NULL,
      fy_code TEXT NOT NULL,
      contract_no TEXT,
      beam_no TEXT,
      trans_type TEXT NOT NULL,
      weaver TEXT,
      loom_no INTEGER,
      rate REAL,
      amount REAL,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE production_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_date TEXT NOT NULL,
      shed TEXT NOT NULL,
      shift TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      hours REAL NOT NULL,
      looms_running INTEGER,
      remarks TEXT
    );

    CREATE TABLE grey_despatch (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      despatch_no INTEGER NOT NULL,
      fy_code TEXT NOT NULL,
      despatch_date TEXT NOT NULL,
      party TEXT NOT NULL,
      party_code INTEGER,
      product TEXT,
      meters REAL,
      rolls INTEGER,
      vehicle_no TEXT,
      bilty_no TEXT,
      gate_pass_no TEXT,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE store_demands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      demand_no INTEGER NOT NULL,
      fy_code TEXT NOT NULL,
      demand_date TEXT NOT NULL,
      department TEXT NOT NULL,
      requested_by TEXT,
      item_count INTEGER,
      total_amount REAL,
      status TEXT NOT NULL DEFAULT 'P',
      remarks TEXT
    );

    CREATE TABLE store_grn (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_no INTEGER NOT NULL,
      fy_code TEXT NOT NULL,
      grn_date TEXT NOT NULL,
      supplier TEXT NOT NULL,
      invoice_no TEXT,
      item_count INTEGER,
      total_amount REAL,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE store_gatepass (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gatepass_no INTEGER NOT NULL,
      fy_code TEXT NOT NULL,
      gatepass_date TEXT NOT NULL,
      gatepass_type TEXT NOT NULL,
      party TEXT NOT NULL,
      vehicle_no TEXT,
      purpose TEXT,
      item_count INTEGER,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE inventory_opening (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fy_code TEXT NOT NULL,
      item_type TEXT NOT NULL,
      item_code TEXT NOT NULL,
      description TEXT NOT NULL,
      opening_qty REAL NOT NULL DEFAULT 0,
      opening_rate REAL NOT NULL DEFAULT 0,
      opening_amount REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'KG',
      location TEXT,
      entry_date TEXT,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE branch_opening (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_code TEXT NOT NULL UNIQUE,
      branch_name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      phone TEXT,
      fy_code TEXT NOT NULL,
      opening_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'A'
    );

    CREATE TABLE grey_paki_parchi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pp_no INTEGER NOT NULL,
      fy_code TEXT NOT NULL,
      pp_date TEXT NOT NULL,
      party TEXT NOT NULL,
      party_code TEXT,
      grey_code INTEGER,
      loom_type TEXT,
      qty_than INTEGER,
      qty_mtrs REAL,
      qty_mtrs_net REAL,
      grey_pick INTEGER,
      grey_width REAL,
      rate REAL,
      amount REAL,
      contract_no TEXT,
      remarks TEXT,
      status TEXT NOT NULL DEFAULT 'A'
    );
  `);

  // Users — 16 roles from original system
  const users: [string, string, string, string][] = [
    ["admin", "admin123", "System Administrator", "ADMIN"],
    ["shahid", "shahid1", "Malik Shahid Karin", "GM"],
    ["manager", "manager123", "Tariq Mehmood", "MANAGER"],
    ["accountant", "acc123", "Aslam Pervez", "FINANCE"],
    ["production", "prod123", "Zafar Iqbal", "PRODUCTION"],
    ["store", "store123", "Nasir Ahmed", "STORE"],
    ["folding", "fold123", "Rashid Ali", "FOLDING"],
    ["weaver", "weave123", "Akram Khan", "TM"],
    ["audit", "audit123", "Imran Shah", "AUDIT"],
    ["clerk", "clerk123", "Sajid Hussain", "CLERK"],
    ["ppc", "ppc123", "Farhan Malik", "PPC"],
    ["it", "it123", "Waqas Ali", "IT"],
  ];
  for (const [login, pw, name, role] of users) {
    await client.execute({ sql: "INSERT INTO users (login, password, full_name, role_name) VALUES (?, ?, ?, ?)", args: [login, pw, name, role] });
  }

  // Company
  await client.execute({ sql: "INSERT INTO company_profile (id, name, address, city, phone, current_fy, fy_start, fy_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: [1, "SK Weaving Mills (Pvt) Ltd", "P-224, Industrial Estate, Faisalabad", "Faisalabad", "041-8780001", "2022", "2022-07-01", "2023-06-30"] });

  // Fiscal Years
  for (const [code, desc, start, end, status] of [
    ["2019", "July 2019 - June 2020", "2019-07-01", "2020-06-30", "C"],
    ["2020", "July 2020 - June 2021", "2020-07-01", "2021-06-30", "C"],
    ["2021", "July 2021 - June 2022", "2021-07-01", "2022-06-30", "C"],
    ["2022", "July 2022 - June 2023", "2022-07-01", "2023-06-30", "A"],
  ] as const) {
    await client.execute({ sql: "INSERT INTO fiscal_years (code, description, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)", args: [code, desc, start, end, status] });
  }

  // Chart of Accounts — expanded
  const accounts: [string, string, number, string, string][] = [
    ["1", "1", 1, "ASSETS", "AST"],
    ["3", "3", 1, "CAPITAL AND LIABILITIES", "C&L"],
    ["5", "5", 1, "REVENUE", "REV"],
    ["7", "7", 1, "EXPENSES", "EXP"],
    ["1.01", "1", 2, "CURRENT ASSETS", "CA"],
    ["1.02", "1", 2, "FIXED ASSETS", "FA"],
    ["1.03", "1", 2, "BANK ACCOUNTS", "BANK"],
    ["1.04", "1", 2, "YARN STOCK", "Y-STK"],
    ["1.05", "1", 2, "GREY STOCK", "G-STK"],
    ["3.01", "3", 2, "CAPITAL", "CAP"],
    ["3.02", "3", 2, "LONG TERM LIABILITIES", "LTL"],
    ["3.03", "3", 2, "CURRENT LIABILITIES", "CL"],
    ["3.04", "3", 2, "CREDITORS", "CRED"],
    ["3.05", "3", 2, "DEBTORS", "DEB"],
    ["5.01", "5", 2, "SALES REVENUE", "SALE"],
    ["5.02", "5", 2, "OTHER INCOME", "OTH"],
    ["7.01", "7", 2, "MANUFACTURING EXPENSES", "MFG"],
    ["7.02", "7", 2, "ADMINISTRATIVE EXPENSES", "ADM"],
    ["7.03", "7", 2, "SELLING EXPENSES", "SEL"],
    ["7.04", "7", 2, "FINANCIAL CHARGES", "FIN"],
    ["1.01.01", "1", 3, "CASH IN HAND", "CASH"],
    ["1.01.02", "1", 3, "STOCK IN TRADE", "STOCK"],
    ["1.01.03", "1", 3, "ADVANCE & DEPOSITS", "ADV"],
    ["1.01.04", "1", 3, "PREPAID EXPENSES", "PREP"],
    ["1.02.01", "1", 3, "LAND & BUILDING", "LAND"],
    ["1.02.02", "1", 3, "PLANT & MACHINERY", "PLANT"],
    ["1.02.03", "1", 3, "VEHICLES", "VEH"],
    ["1.02.04", "1", 3, "FURNITURE & FIXTURES", "FURN"],
    ["1.02.05", "1", 3, "ELECTRICAL EQUIPMENT", "ELEC"],
    ["1.03.01", "1", 3, "HABIB BANK LTD", "HBL"],
    ["1.03.02", "1", 3, "MCB BANK LTD", "MCB"],
    ["1.03.03", "1", 3, "ALLIED BANK LTD", "ABL"],
    ["1.03.04", "1", 3, "MEEZAN BANK LTD", "MBL"],
    ["1.04.01", "1", 3, "YARN IN GODOWN", "Y-GOD"],
    ["1.04.02", "1", 3, "YARN IN TRANSIT", "Y-TRN"],
    ["1.04.03", "1", 3, "YARN WITH WEAVER", "Y-WVR"],
    ["1.05.01", "1", 3, "GREY IN FOLDING", "G-FLD"],
    ["1.05.02", "1", 3, "GREY IN GODOWN", "G-GOD"],
    ["3.01.01", "3", 3, "PARTNERS CAPITAL", "CAP"],
    ["3.02.01", "3", 3, "BANK LOAN - HBL", "HBL-L"],
    ["3.03.01", "3", 3, "ACCOUNTS PAYABLE", "AP"],
    ["3.03.02", "3", 3, "SALARIES PAYABLE", "SAL-P"],
    ["3.03.03", "3", 3, "EOBI PAYABLE", "EOBI"],
    ["3.03.04", "3", 3, "WITHHOLDING TAX", "WHT"],
    ["3.04.01", "3", 3, "YARN SUPPLIERS", "Y-SUP"],
    ["3.05.01", "3", 3, "GREY CLOTH BUYERS", "G-BUY"],
    ["5.01.01", "5", 3, "GREY CLOTH SALES", "GC-SAL"],
    ["5.01.02", "5", 3, "YARN SALES", "YN-SAL"],
    ["5.02.01", "5", 3, "BANK PROFIT", "BK-PRF"],
    ["5.02.02", "5", 3, "SCRAP SALES", "SCRAP"],
    ["5.02.03", "5", 3, "COMMISSION EARNED", "COMM"],
    ["7.01.01", "7", 3, "RAW MATERIAL - YARN", "YARN"],
    ["7.01.02", "7", 3, "WAGES & LABOUR", "WAGES"],
    ["7.01.03", "7", 3, "POWER & FUEL", "POWER"],
    ["7.01.04", "7", 3, "STORE & SPARES", "STORE"],
    ["7.01.05", "7", 3, "SIZING MATERIAL", "SIZE"],
    ["7.01.06", "7", 3, "DEPRECIATION - PLANT", "DEP-P"],
    ["7.01.07", "7", 3, "WARPING CHARGES", "WARP"],
    ["7.01.08", "7", 3, "KNOTTING CHARGES", "KNOT"],
    ["7.02.01", "7", 3, "OFFICE SALARIES", "O-SAL"],
    ["7.02.02", "7", 3, "RENT & RATES", "RENT"],
    ["7.02.03", "7", 3, "UTILITIES", "UTIL"],
    ["7.02.04", "7", 3, "TELEPHONE & INTERNET", "TEL"],
    ["7.02.05", "7", 3, "TRAVELLING", "TRVL"],
    ["7.02.06", "7", 3, "PRINTING & STATIONERY", "PRNT"],
    ["7.02.07", "7", 3, "REPAIR & MAINTENANCE", "RPR"],
    ["7.03.01", "7", 3, "FREIGHT & CARRIAGE", "FRT"],
    ["7.03.02", "7", 3, "BROKERAGE & COMMISSION", "BRK"],
    ["7.04.01", "7", 3, "BANK CHARGES", "B-CHG"],
    ["7.04.02", "7", 3, "MARKUP ON LOAN", "MKUP"],
    ["3.04.01.0001", "3", 4, "AL-HAMD YARN TRADERS", "ALHAM"],
    ["3.04.01.0002", "3", 4, "CRESCENT TEXTILE MILLS", "CRESC"],
    ["3.04.01.0003", "3", 4, "DIAMOND FIBRE LTD", "DIAMD"],
    ["3.04.01.0004", "3", 4, "FAZAL COTTON MILLS", "FAZAL"],
    ["3.04.01.0005", "3", 4, "GOHAR TEXTILES", "GOHAR"],
    ["3.05.01.0001", "3", 4, "NISHAT CHUNIAN LTD", "NISHT"],
    ["3.05.01.0002", "3", 4, "SAPPHIRE TEXTILE MILLS", "SAPHR"],
    ["3.05.01.0003", "3", 4, "MASOOD TEXTILE MILLS", "MASOD"],
    ["3.05.01.0004", "3", 4, "GUL AHMED TEXTILE MILLS", "GULAH"],
    ["3.05.01.0005", "3", 4, "KOHINOOR TEXTILE MILLS", "KOHNR"],
  ];
  for (const [code, head, level, desc, short] of accounts) {
    await client.execute({ sql: "INSERT INTO chart_of_accounts (code, code_head, level, description, desc_short, status) VALUES (?, ?, ?, ?, ?, 'R')", args: [code, head, level, desc, short] });
  }

  // Cost Centers — 5-level hierarchy
  const ccs: [number, string, number, number | null][] = [
    [1, "HEAD OFFICE", 1, null],
    [2, "WEAVING SHED-A", 1, null],
    [3, "WEAVING SHED-B", 1, null],
    [4, "WARPING DEPARTMENT", 1, null],
    [5, "SIZING DEPARTMENT", 1, null],
    [6, "FOLDING & INSPECTION", 1, null],
    [7, "YARN GODOWN", 1, null],
    [8, "GREY GODOWN", 1, null],
    [9, "STORE / SPARE PARTS", 1, null],
    [10, "KNOTTING SECTION", 1, null],
    [11, "DRAWING SECTION", 1, null],
    [12, "ELECTRICAL WORKSHOP", 2, 9],
    [13, "MECHANICAL WORKSHOP", 2, 9],
  ];
  for (const [code, desc, level, parent] of ccs) {
    await client.execute({ sql: "INSERT INTO cost_centers (code, description, level, parent_code) VALUES (?, ?, ?, ?)", args: [code, desc, level, parent] });
  }

  // Voucher Types — full set
  const vtypes: [string, string, number][] = [
    ["OPN","OPENING BALANCE",0],["JV","JOURNAL VOUCHER",1],["CR","CASH RECEIPT",2],["BR","BANK RECEIPT",3],
    ["TI","TRANSFER IN",4],["PC","PETTY CASH PAYMENT",5],["SP","STORE PURCHASE",6],["PR","PETTY CASH RECEIPT",7],
    ["CP","CASH PAYMENT",21],["BP","BANK PAYMENT",22],["TO","TRANSFER OUT",23],["AAP","AUTO POSTING",24],
    ["SV","STORE ISSUE",26],["SR","STORE ISSUE RETURN",27],["SAL","STORE SALES",28],
    ["GPP","GREY PURCHASE",35],["GPV","GREY SALES",36],["GDP","GREY DESPATCH",37],
    ["BRV","BROKER VOUCHER",38],["INT","INTEREST VOUCHER",39],["EXT","EXTERNAL VOUCHER",40],
    ["KB","KNOTTING BILL",41],["PVY","PURCHASE VOUCHER YARN",42],["YSV","YARN SALE VOUCHER",43],["PV","PURCHASE VOUCHER",44],
  ];
  for (const [vtype, desc, order] of vtypes) {
    await client.execute({ sql: "INSERT INTO voucher_types (vtype, description, sort_order) VALUES (?, ?, ?)", args: [vtype, desc, order] });
  }

  // Yarn Counts — real Pakistani textile counts
  const yarns: [string, string, number, string][] = [
    ["6/1","6s Single Cotton",1,"COTTON"],["7/1","7s Single Cotton",1,"COTTON"],
    ["10/1","10s Single Cotton",1,"COTTON"],["12/1","12s Single Cotton",1,"COTTON"],
    ["16/1","16s Single Cotton",1,"COTTON"],["17/1","17s Single Cotton",1,"COTTON"],
    ["20/1","20s Single Cotton",1,"COTTON"],["21/1","21s Single Cotton",1,"COTTON"],
    ["24/1","24s Single Cotton",1,"COTTON"],["30/1","30s Single Cotton",1,"COTTON"],
    ["32/1","32s Single Cotton",1,"COTTON"],["40/1","40s Single Cotton",1,"COTTON"],
    ["50/1","50s Single Cotton",1,"COTTON"],["60/1","60s Single Cotton",1,"COTTON"],
    ["80/1","80s Single Cotton",1,"COTTON"],
    ["20/2","20s Two-Ply Cotton",2,"COTTON"],["30/2","30s Two-Ply Cotton",2,"COTTON"],
    ["40/2","40s Two-Ply Cotton",2,"COTTON"],
    ["20/1-PC","20s PC Blend 65/35",1,"PC BLEND"],["30/1-PC","30s PC Blend 65/35",1,"PC BLEND"],
    ["20/1-CVC","20s CVC Blend 60/40",1,"CVC BLEND"],["30/1-CVC","30s CVC Blend 60/40",1,"CVC BLEND"],
    ["150D","150 Denier Polyester",1,"POLYESTER"],["250D","250 Denier Polyester",1,"POLYESTER"],
    ["75D","75 Denier Polyester",1,"POLYESTER"],
  ];
  for (const [code, desc, ply, type] of yarns) {
    await client.execute({ sql: "INSERT INTO yarn_counts (count_code, description, ply, type) VALUES (?, ?, ?, ?)", args: [code, desc, ply, type] });
  }

  // Looms — 42 looms across 2 sheds
  const loomData: [number, string, string, string, number, number, string, string | null, string | null][] = [];
  const loomTypes = ["SHUTTLE", "RAPIER", "RAPIER", "AIRJET"];
  const makes = ["TOYOTA", "PICANOL", "SULZER", "TSUDAKOMA"];
  const statuses = ["RUNNING", "RUNNING", "RUNNING", "RUNNING", "RUNNING", "IDLE", "MAINTENANCE", "RUNNING"];
  const products = ["GC-001", "GC-002", "GC-003", "GC-004", "GC-005", "GC-006", null];
  for (let i = 1; i <= 42; i++) {
    const shed = i <= 22 ? "A" : "B";
    const typeIdx = i <= 10 ? 0 : i <= 22 ? 1 : i <= 34 ? 2 : 3;
    const status = statuses[(i * 3) % statuses.length];
    const product = status === "RUNNING" ? products[i % products.length] : null;
    const contract = product ? `00${(i % 8) + 1}22` : null;
    loomData.push([i, shed, loomTypes[typeIdx], makes[typeIdx], typeIdx === 3 ? 190 : typeIdx === 0 ? 120 : 150, typeIdx === 3 ? 800 : typeIdx === 0 ? 220 : 450, status, contract, product]);
  }
  for (const [no, shed, type, make, width, rpm, status, contract, product] of loomData) {
    await client.execute({ sql: "INSERT INTO looms (loom_no, shed, type, make, width, rpm, status, current_contract, current_product) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [no, shed, type, make, width, rpm, status, contract, product] });
  }

  // Grey Construction — product specs
  const greys: [string, string, number, number, number, string, string, string, number][] = [
    ["GC-001", "63\" Grey Sheeting 20x20", 63, 60, 63, "20/1", "20/1", "PLAIN", 130],
    ["GC-002", "72\" Grey Sheeting 20x16", 72, 56, 72, "20/1", "16/1", "PLAIN", 145],
    ["GC-003", "44\" Grey Poplin 40x40", 132, 72, 44, "40/1", "40/1", "PLAIN", 110],
    ["GC-004", "63\" Grey Twill 2/1 30x20", 76, 52, 63, "30/1", "20/1", "TWILL", 155],
    ["GC-005", "58\" Grey Canvas 7x7", 46, 32, 58, "7/1", "7/1", "PLAIN", 340],
    ["GC-006", "72\" Grey Percale 60x60", 100, 88, 72, "60/1", "60/1", "PLAIN", 92],
    ["GC-007", "44\" Grey Drill 32x16", 72, 48, 44, "32/1", "16/1", "TWILL", 180],
    ["GC-008", "63\" Grey Lawn 80x80", 96, 88, 63, "80/1", "80/1", "PLAIN", 68],
    ["GC-009", "58\" Grey Satin 5/1 40x30", 116, 76, 58, "40/1", "30/1", "SATIN", 125],
    ["GC-010", "72\" Grey PC Sheeting 20x20", 63, 56, 72, "20/1-PC", "20/1-PC", "PLAIN", 120],
    ["GC-011", "44\" Grey CVC Poplin 30x30", 108, 68, 44, "30/1-CVC", "30/1-CVC", "PLAIN", 105],
    ["GC-012", "63\" Grey Dobby 40x40", 128, 80, 63, "40/1", "40/1", "DOBBY", 115],
  ];
  for (const [code, desc, reed, pick, width, warp, weft, weave, gsm] of greys) {
    await client.execute({ sql: "INSERT INTO grey_construction (code, description, reed, pick, width, warp_count, weft_count, weave_type, gsm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [code, desc, reed, pick, width, warp, weft, weave, gsm] });
  }

  // Contracts — mix of types
  const contractData: [string, string, string, string, string | null, string | null, number, number, number, string, string, string, string][] = [
    ["00122", "2022", "YARN_PUR", "Al-Hamd Yarn Traders", "Riaz & Co", "20/1 Cotton", 5000, 280, 1400000, "KG", "2022-07-05", "2022-08-05", "C"],
    ["00222", "2022", "YARN_PUR", "Crescent Textile Mills", "Kashif Bros", "30/1 Cotton", 3000, 320, 960000, "KG", "2022-07-10", "2022-08-15", "A"],
    ["00322", "2022", "YARN_PUR", "Diamond Fibre Ltd", null, "40/1 Cotton", 2000, 410, 820000, "KG", "2022-08-01", "2022-09-01", "A"],
    ["00422", "2022", "YARN_PUR", "Fazal Cotton Mills", "Tariq Comm", "20/1-PC Blend", 4000, 295, 1180000, "KG", "2022-08-10", "2022-09-15", "A"],
    ["00522", "2022", "GREY_SALE", "Nishat Chunian Ltd", "Akbar Agency", "GC-001", 25000, 48, 1200000, "MTR", "2022-07-08", "2022-10-08", "A"],
    ["00622", "2022", "GREY_SALE", "Sapphire Textile Mills", null, "GC-003", 15000, 62, 930000, "MTR", "2022-07-12", "2022-09-30", "A"],
    ["00722", "2022", "GREY_SALE", "Gul Ahmed Textile Mills", "Faisal & Sons", "GC-006", 20000, 55, 1100000, "MTR", "2022-07-20", "2022-11-20", "A"],
    ["00822", "2022", "GREY_SALE", "Kohinoor Textile Mills", null, "GC-004", 18000, 52, 936000, "MTR", "2022-08-01", "2022-11-01", "A"],
    ["00922", "2022", "WARPING", "City Sizing House", null, "20/1 Cotton Beams", 50, 3500, 175000, "BEAM", "2022-07-15", "2022-08-15", "A"],
    ["01022", "2022", "WARPING", "Madina Sizing Works", null, "30/1 Cotton Beams", 30, 4200, 126000, "BEAM", "2022-08-01", "2022-09-01", "A"],
    ["01122", "2022", "GREY_CONV", "Ashfaq Weaving Factory", "Rana Bros", "GC-002 Conversion", 10000, 8.5, 85000, "MTR", "2022-07-25", "2022-10-25", "A"],
    ["01222", "2022", "GREY_CONV", "Bilal Power Looms", null, "GC-005 Conversion", 8000, 12, 96000, "MTR", "2022-08-05", "2022-11-05", "A"],
    ["01322", "2022", "KNOTTING", "Sajjad Knotting Service", null, "Beam knotting", 60, 800, 48000, "BEAM", "2022-07-20", "2022-12-20", "A"],
    ["01422", "2022", "YARN_SALE", "Gohar Textiles", "Shahbaz Comm", "20/1 Cotton surplus", 1000, 290, 290000, "KG", "2022-08-15", "2022-09-15", "A"],
  ];
  for (const [no, fy, type, party, broker, product, qty, rate, amt, unit, cdate, ddate, status] of contractData) {
    await client.execute({ sql: "INSERT INTO contracts (contract_no, fy_code, type, party, broker, product, quantity, rate, amount, unit, contract_date, delivery_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [no, fy, type, party, broker, product, qty, rate, amt, unit, cdate, ddate, status] });
  }

  // Daily Production — 30 days of data across looms
  const weavers = ["Akram Khan", "Bashir Ahmed", "Chaudhry Aslam", "Dost Muhammad", "Ehsan Ullah", "Farooq Ahmed", "Ghulam Abbas", "Hamid Raza"];
  for (let day = 1; day <= 30; day++) {
    const date = `2022-08-${String(day).padStart(2, "0")}`;
    for (let loom = 1; loom <= 42; loom++) {
      if ((loom + day) % 7 === 0) continue; // skip some for realism
      const shed = loom <= 22 ? "A" : "B";
      const shift = (loom + day) % 3 === 0 ? "NIGHT" : "DAY";
      const baseMeters = 45 + (loom * 3 + day * 2) % 35;
      const eff = 72 + (loom + day * 7) % 20;
      const gradeA = baseMeters * (0.85 + ((loom * day) % 10) / 100);
      const gradeB = baseMeters * (0.05 + ((loom + day) % 5) / 100);
      const rej = baseMeters - gradeA - gradeB > 0 ? baseMeters - gradeA - gradeB : 0;
      const contract = `00${(loom % 8) + 1}22`;
      const grey = greys[(loom + day) % greys.length][0];
      const weaver = weavers[(loom + day) % weavers.length];
      await client.execute({
        sql: "INSERT INTO daily_production (production_date, shed, shift, loom_no, contract_no, grey_code, meters, picks, grade_a, grade_b, grade_c, rejection, rpm, efficiency, weaver_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [date, shed, shift, loom, contract, grey, Math.round(baseMeters * 10) / 10, Math.round(baseMeters * 52), Math.round(gradeA * 10) / 10, Math.round(gradeB * 10) / 10, 0, Math.round(rej * 10) / 10, 220 + (loom * 13) % 580, eff, weaver]
      });
    }
  }

  // Chart Parts — spare parts inventory
  const parts: [string, string, string, string, number, number, number, string][] = [
    ["SP-001", "SHUTTLE COMPLETE", "WEAVING", "PCS", 50, 120, 2500, "2022-07-15"],
    ["SP-002", "PICKER STICK", "WEAVING", "PCS", 100, 280, 450, "2022-08-01"],
    ["SP-003", "REED WIRE 63\"", "WEAVING", "PCS", 20, 35, 8500, "2022-07-20"],
    ["SP-004", "HEALD FRAME COMPLETE", "WEAVING", "PCS", 10, 22, 15000, "2022-06-10"],
    ["SP-005", "HEALD WIRE (1000 PCS)", "WEAVING", "BOX", 30, 45, 3200, "2022-08-05"],
    ["SP-006", "DROP WIRE (1000 PCS)", "WEAVING", "BOX", 25, 38, 2800, "2022-07-25"],
    ["SP-007", "BEARING 6205 2RS", "MECHANICAL", "PCS", 100, 250, 380, "2022-08-10"],
    ["SP-008", "BEARING 6306 ZZ", "MECHANICAL", "PCS", 80, 180, 520, "2022-07-30"],
    ["SP-009", "V-BELT A-68", "MECHANICAL", "PCS", 30, 65, 750, "2022-08-01"],
    ["SP-010", "V-BELT B-92", "MECHANICAL", "PCS", 25, 48, 1100, "2022-07-18"],
    ["SP-011", "MOTOR 3HP 1440RPM", "ELECTRICAL", "PCS", 5, 8, 28000, "2022-06-20"],
    ["SP-012", "MOTOR 5HP 1440RPM", "ELECTRICAL", "PCS", 3, 5, 42000, "2022-05-15"],
    ["SP-013", "CONTACTOR 40A", "ELECTRICAL", "PCS", 15, 32, 3500, "2022-08-08"],
    ["SP-014", "MCB 32A 3-POLE", "ELECTRICAL", "PCS", 20, 45, 1200, "2022-07-22"],
    ["SP-015", "SIZING CHEMICAL PVA", "SIZING", "KG", 500, 1200, 280, "2022-08-12"],
    ["SP-016", "SIZING CHEMICAL STARCH", "SIZING", "KG", 1000, 2500, 85, "2022-08-10"],
    ["SP-017", "LUBRICANT OIL 68", "MECHANICAL", "LTR", 200, 380, 320, "2022-07-28"],
    ["SP-018", "GREASE EP-2", "MECHANICAL", "KG", 100, 150, 450, "2022-08-05"],
    ["SP-019", "RAPIER TAPE", "WEAVING", "MTR", 200, 420, 1800, "2022-07-10"],
    ["SP-020", "RAPIER HEAD", "WEAVING", "PCS", 10, 18, 35000, "2022-06-01"],
    ["SP-021", "WARP STOP MOTION CONTACT", "WEAVING", "PCS", 50, 95, 850, "2022-08-02"],
    ["SP-022", "TEMPLE RING 58\"", "WEAVING", "PCS", 30, 52, 2200, "2022-07-15"],
    ["SP-023", "LEASE RODS (PAIR)", "WARPING", "PAIR", 20, 35, 1500, "2022-07-20"],
    ["SP-024", "WINDING DRUM COVER", "WARPING", "PCS", 8, 14, 4500, "2022-06-25"],
    ["SP-025", "CLOTH ROLLER BEARING", "WEAVING", "PCS", 40, 78, 680, "2022-08-08"],
  ];
  for (const [code, desc, cat, unit, min, stock, cost, lastDate] of parts) {
    await client.execute({ sql: "INSERT INTO chart_parts (code, description, category, unit, min_stock, current_stock, avg_cost, last_purchase_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: [code, desc, cat, unit, min, stock, cost, lastDate] });
  }

  // Beams
  const beamData: [string, string, string | null, string | null, string | null, number, number, number, string, number | null, string][] = [
    ["BM-001", "WARP", "00122", "GC-001", "20/1", 3200, 1200, 380, "RUNNING", 1, "2022-07-20"],
    ["BM-002", "WARP", "00122", "GC-001", "20/1", 3200, 1150, 365, "RUNNING", 2, "2022-07-21"],
    ["BM-003", "WARP", "00222", "GC-003", "40/1", 5200, 800, 185, "RUNNING", 11, "2022-07-22"],
    ["BM-004", "WARP", "00522", "GC-001", "20/1", 3200, 1100, 350, "RUNNING", 5, "2022-07-25"],
    ["BM-005", "SIZED", "00622", "GC-003", "40/1", 5200, 900, 210, "RUNNING", 15, "2022-07-28"],
    ["BM-006", "WARP", "00722", "GC-006", "60/1", 4800, 750, 145, "RUNNING", 25, "2022-08-01"],
    ["BM-007", "SIZED", "00822", "GC-004", "30/1", 3600, 950, 280, "RUNNING", 30, "2022-08-03"],
    ["BM-008", "WARP", "00122", "GC-001", "20/1", 3200, 1200, 380, "RE-KNOT", null, "2022-08-05"],
    ["BM-009", "WARP", "00222", "GC-002", "20/1", 3400, 1300, 420, "F-ROLL", null, "2022-08-06"],
    ["BM-010", "EMPTY", null, null, null, 0, 0, 45, "EMPTY", null, "2022-08-08"],
    ["BM-011", "EMPTY", null, null, null, 0, 0, 45, "EMPTY", null, "2022-08-08"],
    ["BM-012", "SIZED", "00622", "GC-003", "40/1", 5200, 850, 195, "R-CUT", null, "2022-08-02"],
    ["BM-013", "WARP", "00522", "GC-001", "20/1", 3200, 1050, 335, "L-ROLL", 8, "2022-08-04"],
    ["BM-014", "WARP", "00722", "GC-006", "60/1", 4800, 700, 135, "RUNNING", 28, "2022-08-07"],
    ["BM-015", "SIZED", "00822", "GC-004", "30/1", 3600, 900, 265, "RUNNING", 35, "2022-08-09"],
  ];
  for (const [no, type, contract, product, yarn, ends, len, weight, status, loom, date] of beamData) {
    await client.execute({ sql: "INSERT INTO beams (beam_no, type, contract_no, product, yarn_count, ends, length, weight, status, loom_no, received_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [no, type, contract, product, yarn, ends, len, weight, status, loom, date] });
  }

  // System Locking
  const locks: [string, string, string | null][] = [
    ["ADM", "Administration (Finance)", "2022-06-30"],
    ["WVG", "Weaving Operations", "2022-06-30"],
    ["WRP", "Warping Department", "2022-06-30"],
    ["STR", "Store / Spare Parts", "2022-06-30"],
    ["EPH", "Establishment Payroll", null],
    ["DBL", "Doubling", null],
    ["BLD", "Bleach / Dye", null],
    ["RWD", "Reward / Bonus", null],
    ["FPS", "Finished Product Store", null],
    ["DYG", "Dyeing", null],
    ["DBF", "Doubling (Finished)", null],
    ["PRL", "Payroll", null],
  ];
  for (const [mod, desc, lockDate] of locks) {
    await client.execute({ sql: "INSERT INTO system_locking (module, description, lock_date) VALUES (?, ?, ?)", args: [mod, desc, lockDate] });
  }

  // Transactions — expanded
  const txns: [string, string, number, string, string, [string, string, number, number][]][] = [
    ["2022","OPN",1,"2022-07-01","Opening balances",[
      ["1.01.01","Cash opening balance",250000,0],
      ["1.03.01","HBL opening balance",1500000,0],
      ["1.03.02","MCB opening balance",850000,0],
      ["1.03.04","Meezan opening balance",320000,0],
      ["1.02.02","Plant & machinery",12000000,0],
      ["1.02.01","Land & building",8500000,0],
      ["1.02.03","Vehicles",2200000,0],
      ["1.04.01","Yarn stock in godown",1850000,0],
      ["1.05.01","Grey in folding",420000,0],
      ["3.01.01","Partners capital",0,27890000],
    ]],
    ["2022","JV",1,"2022-07-15","Yarn purchase from Al-Hamd - 20/1 Cotton 500 bags",[
      ["7.01.01","Yarn 20/1 PC - 500 bags",750000,0],
      ["3.04.01.0001","Al-Hamd Yarn Traders",0,750000],
    ]],
    ["2022","CP",1,"2022-07-20","Salary payment - July",[
      ["7.02.01","Office salaries July 2022",180000,0],
      ["1.01.01","Cash payment",0,180000],
    ]],
    ["2022","BP",1,"2022-07-25","FESCO electricity deposit",[
      ["7.01.03","FESCO bill Jul 2022",285000,0],
      ["1.03.01","HBL bank payment",0,285000],
    ]],
    ["2022","BR",1,"2022-08-01","Grey cloth sale - Nishat Chunian",[
      ["1.03.01","HBL deposit - grey sale",420000,0],
      ["5.01.01","Grey cloth sale GC-001",0,420000],
    ]],
    ["2022","BP",2,"2022-08-05","Sui gas bill - July",[
      ["7.01.03","SNGPL bill Jul 2022",42000,0],
      ["1.03.02","MCB bank payment",0,42000],
    ]],
    ["2022","JV",2,"2022-08-10","Warping charges - City Sizing House",[
      ["7.01.07","Warping 20 beams @ 3500",70000,0],
      ["3.03.01","Accounts payable - City Sizing",0,70000],
    ]],
    ["2022","BP",3,"2022-08-10","Electricity bill - August",[
      ["7.01.03","FESCO bill Aug 2022",295000,0],
      ["1.03.02","MCB bank payment",0,295000],
    ]],
    ["2022","JV",3,"2022-08-15","Yarn purchase - Crescent 30/1 CVC",[
      ["7.01.01","Yarn 30/1 CVC - 300 bags",510000,0],
      ["3.04.01.0002","Crescent Textile Mills",0,510000],
    ]],
    ["2022","CR",1,"2022-08-18","Cash received - Masood Textile",[
      ["1.01.01","Cash received from party",185000,0],
      ["3.05.01.0003","Masood Textile Mills",0,185000],
    ]],
    ["2022","BR",2,"2022-08-20","Grey sale - Sapphire Textile",[
      ["1.03.01","HBL deposit - grey sale",620000,0],
      ["5.01.01","Grey cloth sale GC-003",0,620000],
    ]],
    ["2022","CP",2,"2022-08-22","Wages payment - Shed A",[
      ["7.01.02","Weaving wages Aug - Shed A",320000,0],
      ["1.01.01","Cash payment wages",0,320000],
    ]],
    ["2022","CP",3,"2022-08-23","Wages payment - Shed B",[
      ["7.01.02","Weaving wages Aug - Shed B",280000,0],
      ["1.01.01","Cash payment wages",0,280000],
    ]],
    ["2022","JV",4,"2022-08-25","Store purchase - spare parts",[
      ["7.01.04","Bearings, belts, shuttles",145000,0],
      ["3.03.01","Accounts payable - vendors",0,145000],
    ]],
    ["2022","BP",4,"2022-08-28","Rent payment - godown",[
      ["7.02.02","Godown rent August",85000,0],
      ["1.03.04","Meezan bank payment",0,85000],
    ]],
    ["2022","BR",3,"2022-09-01","Grey sale - Gul Ahmed",[
      ["1.03.01","HBL deposit - grey sale",380000,0],
      ["5.01.01","Grey cloth sale GC-006",0,380000],
    ]],
    ["2022","JV",5,"2022-09-05","Knotting charges",[
      ["7.01.08","Knotting 15 beams @ 800",12000,0],
      ["3.03.01","Accounts payable - knotting",0,12000],
    ]],
    ["2022","JV",6,"2022-09-10","Yarn purchase - Diamond Fibre 40/1",[
      ["7.01.01","Yarn 40/1 Cotton - 200 bags",410000,0],
      ["3.04.01.0003","Diamond Fibre Ltd",0,410000],
    ]],
    ["2022","CP",4,"2022-09-12","Petty cash expenses",[
      ["7.02.03","Telephone bill Sep",8500,0],
      ["7.02.06","Printing & stationery",4200,0],
      ["7.02.05","Local travelling",6300,0],
      ["1.01.01","Cash payment misc",0,19000],
    ]],
    ["2022","BR",4,"2022-09-15","Grey sale - Kohinoor Textile",[
      ["1.03.02","MCB deposit - grey sale",468000,0],
      ["5.01.01","Grey cloth sale GC-004",0,468000],
    ]],
  ];
  for (const [fy, vtype, vno, vdate, narr, lines] of txns) {
    await client.execute({ sql: "INSERT INTO trans_main (fy_code, vtype, vno, vdate, narration, ut_code) VALUES (?, ?, ?, ?, ?, 1)", args: [fy, vtype, vno, vdate, narr] });
    for (let i = 0; i < lines.length; i++) {
      const [acc, desc, dr, cr] = lines[i];
      await client.execute({ sql: "INSERT INTO trans_detail (fy_code, vtype, vno, srno, acc_code, narration, debit, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: [fy, vtype, vno, i + 1, acc, desc, dr, cr] });
    }
  }

  // Cities — from real Oracle data
  for (const city of ["FSD", "KHI", "LHR", "ISB", "MUL", "GUJ", "SIL", "RWP", "PSH", "HYD"]) {
    await client.execute({ sql: "INSERT INTO cities (name) VALUES (?)", args: [city] });
  }

  // Company Units — from real Oracle data
  for (const [code, srno, desc] of [["GDN", 1, "YARN GODAM GHAR"], ["SZG", 2, "OTHER PARTY"], ["WVG", 3, "WEAVING SHED"], ["WRP", 4, "WARPING UNIT"]] as const) {
    await client.execute({ sql: "INSERT INTO company_units (code, srno, description) VALUES (?, ?, ?)", args: [code, srno, desc] });
  }

  // Beam Statuses — from real Oracle data
  for (const s of ["RUNNING", "RE-KNOT", "F-ROLL", "R-CUT", "L-ROLL"]) {
    await client.execute({ sql: "INSERT INTO beam_statuses (status) VALUES (?)", args: [s] });
  }

  // Weavers
  const weaverData: [number, string, string, string, string][] = [
    [1, "Akram Khan", "AKK", "0300-1234567", "Faisalabad"],
    [2, "Bashir Ahmed", "BSH", "0301-2345678", "Faisalabad"],
    [3, "Chaudhry Aslam", "CHA", "0302-3456789", "Faisalabad"],
    [4, "Dost Muhammad", "DST", "0303-4567890", "Chiniot"],
    [5, "Ehsan Ullah", "EHS", "0304-5678901", "Faisalabad"],
    [6, "Farooq Ahmed", "FRQ", "0305-6789012", "Jhang"],
    [7, "Ghulam Abbas", "GHL", "0306-7890123", "Faisalabad"],
    [8, "Hamid Raza", "HMD", "0307-8901234", "Faisalabad"],
    [9, "Ijaz Hussain", "IJZ", "0308-9012345", "T.T. Singh"],
    [10, "Javed Iqbal", "JVD", "0309-0123456", "Faisalabad"],
    [11, "Khalid Mehmood", "KHL", "0311-1234567", "Chiniot"],
    [12, "Latif Ahmad", "LTF", "0312-2345678", "Faisalabad"],
  ];
  for (const [code, name, short, cell, addr] of weaverData) {
    await client.execute({ sql: "INSERT INTO weavers (code, name, name_short, cell, address) VALUES (?, ?, ?, ?, ?)", args: [code, name, short, cell, addr] });
  }

  // Yarn Blends — from real Oracle data
  for (const blend of [
    "COTTON 100%", "PC 70;30", "PV 65;35", "PV 80;20", "PV 90;10",
    "PP 100%", "VISCOSE 100%", "AVT 65;35", "AVT 80:20", "AVT 40:40:20",
    "PUNCH 75,40", "PUNCH 50,40", "PUNCH 70.30", "PUNCH 100/40", "PUNCH 75,75",
    "PUNCH 100:100", "PUNCH 57:42%", "PUNCH 28:78%", "PUNCH 30.70",
    "PA 70;30", "PV 22:78", "PVT", "AVT 45.45.10", "100CD:20AVT", "YODIA",
  ]) {
    await client.execute({ sql: "INSERT INTO yarn_blends (description) VALUES (?)", args: [blend] });
  }

  // Yarn Brands — from real Oracle data (55 brands)
  for (const brand of [
    "A.TAX", "AA", "AFZAL", "AJ", "AL-FALAH", "ASHIANA", "BEST", "C-20",
    "CANDAL", "CH-TALAB", "CHINA", "COLONY", "COMBINE", "DHABI", "DIAMOND",
    "DOUBLING", "GETRON", "GREENLINE", "GUJJAR KHAN", "HANNAN", "HAR",
    "JAMORKAR", "KC-TAX", "KINO HUSSAIN", "KOHAT", "KOHINOOR", "LUCKY STAR",
    "MAKKAH", "MALIK USMAN", "MARATHON", "MOAZZAM", "MOONSTAR", "MUNEEB",
    "NAVEENA", "NEW CITY", "NOOR", "OK", "OLYMPIC", "PAKISTAN", "PIONEER",
    "PREMIUM", "QAMAR SHAH", "QUEEN", "RANA", "RASHID", "ROYAL", "SAFA",
    "SHAHEEN", "SULTAN", "SUPER STAR", "TAHIR", "UNITED", "VICTORY", "ZAMAN", "ZAMZAM",
  ]) {
    await client.execute({ sql: "INSERT INTO yarn_brands (name) VALUES (?)", args: [brand] });
  }

  // Yarn Fibers
  const fibers: [number, string, string, string, string][] = [
    [1, "COTTON", "Cotton Staple Fiber", "1.5", "28mm"],
    [2, "POLYES", "Polyester Staple Fiber", "1.2D", "38mm"],
    [3, "VISCOS", "Viscose Rayon Fiber", "1.5D", "38mm"],
    [4, "POLYES", "Polyester Filament", "75D", "CONT"],
    [5, "POLYES", "Polyester Filament", "150D", "CONT"],
    [6, "COTTON", "Cotton Combed Fiber", "1.5", "32mm"],
    [7, "NYLON", "Nylon 6 Filament", "70D", "CONT"],
    [8, "POLYES", "Polyester Textured", "100D", "CONT"],
  ];
  for (const [code, type, desc, denier, len] of fibers) {
    await client.execute({ sql: "INSERT INTO yarn_fibers (code, type, description, denier, length) VALUES (?, ?, ?, ?, ?)", args: [code, type, desc, denier, len] });
  }

  // Grey Despatch Chart — from real Oracle data (35 parties)
  const gdcData: [number, string, string, string | null, string | null][] = [
    [3, "UNI TEXTILE DYING LHR", "UNITEX", "04235297577", "03009746674"],
    [4, "AL NOOR TEXTILE DYING", "ALNOORTEX", null, null],
    [5, "AL RAHIM DYING", "ALRAHDY", null, null],
    [6, "GODAM MALIK SHAHID RASEED FACTORY", "GMSRF", "03232201515", null],
    [7, "CRYSTAL DYING", "CRLDYI", "03216457538", "0553407088"],
    [8, "SHAFI DYING", "SHDY", null, null],
    [9, "VARIETY DYING GUJJAR BASI", "VARDYI", null, null],
    [10, "ZEENO DYING GUJJAR BSSTI", "ZEEDY", null, null],
    [12, "JHANG DYING KHUDIAWALA", "JHDYI", null, null],
    [17, "SAFA DYING LAHORE", "SADYI", null, null],
    [23, "AL-REHMAN DYING MAQBOOL ROAD", "ALREDY", null, null],
    [24, "TAQWA WEAVING", "TAQWA", null, null],
    [25, "GILLAN DYING DHANOLLA", "GILLAN", null, null],
    [26, "AL-JANNAT DYING GUJJAR BASTI", "AL-JAN DY", null, null],
    [27, "AL-FALAH DYING LAHORE", "AL-FALAH D", null, null],
    [29, "DILPASAND DYING LAHORE", "DIL", null, null],
    [34, "HAJI MUSTAFA SARDAR", "HJMTS", null, null],
    [35, "MADINA DYING WORKS", "MADDY", null, null],
    [36, "NAZIR DYING HOUSE", "NAZDH", null, null],
    [37, "PAKISTAN DYING MILLS", "PAKDY", null, null],
    [38, "QADIR TEXTILE DYING", "QADDY", "03001234567", null],
    [39, "RAZA DYING & FINISHING", "RAZDY", null, null],
    [40, "SARWAR DYING WORKS", "SARDY", null, null],
    [41, "TAHIR DYING INDUSTRY", "TAHDY", null, null],
    [42, "USMAN TEXTILE PROCESSING", "USMPRC", "03451234567", null],
  ];
  for (const [code, name, short, cell, phone] of gdcData) {
    await client.execute({ sql: "INSERT INTO grey_dsp_chart (code, name, name_short, cell, phone) VALUES (?, ?, ?, ?, ?)", args: [code, name, short, cell, phone] });
  }

  // DO Party Chart
  const doParties: [number, string, string, string | null][] = [
    [1, "DO PARTY", "DOP", null],
    [2, "AL-HAMD TRADERS", "ALHTRD", "03001112233"],
    [3, "CRESCENT GROUP", "CRSGRP", "03012223344"],
    [4, "DIAMOND INDUSTRIES", "DMIND", "03023334455"],
    [5, "FAZAL ENTERPRISES", "FZLENT", null],
    [6, "GOHAR BROTHERS", "GHRBRS", "03045556677"],
    [7, "HAMZA TEXTILES", "HMZTEX", null],
    [8, "IQBAL & SONS", "IQBSNS", "03067778899"],
  ];
  for (const [code, name, short, cell] of doParties) {
    await client.execute({ sql: "INSERT INTO do_party_chart (code, name, name_short, cell) VALUES (?, ?, ?, ?)", args: [code, name, short, cell] });
  }

  // Locations — Grey Despatch + Yarn parties
  const locs: [number, string, string][] = [
    [1, "FAISALABAD CITY", "GREY"],
    [2, "LAHORE", "GREY"],
    [3, "KARACHI PORT", "GREY"],
    [4, "MULTAN", "GREY"],
    [5, "GUJRANWALA", "GREY"],
    [6, "CHINIOT", "GREY"],
    [7, "JHANG", "GREY"],
    [8, "T.T. SINGH", "GREY"],
    [101, "FAISALABAD YARN MARKET", "YARN"],
    [102, "LAHORE YARN MARKET", "YARN"],
    [103, "KARACHI YARN MARKET", "YARN"],
    [104, "MULTAN YARN DEPOT", "YARN"],
    [105, "GUJRANWALA YARN DEPOT", "YARN"],
  ];
  for (const [code, desc, type] of locs) {
    await client.execute({ sql: "INSERT INTO locations (code, description, type) VALUES (?, ?, ?)", args: [code, desc, type] });
  }

  // Production Staff — 3 levels
  const staff: [number, number, string, string, string, number, string, string][] = [
    [1, 1, "Zafar Iqbal", "ZFR", "0300-1111111", 1, "A", "A"],
    [2, 1, "Tariq Mehmood", "TRQ", "0301-2222222", 2, "A", "A"],
    [3, 1, "Rashid Ali", "RSH", "0302-3333333", 1, "B", "A"],
    [4, 1, "Nasir Ahmed", "NSR", "0303-4444444", 2, "B", "A"],
    [5, 2, "Waheed Hassan", "WHD", "0304-5555555", 1, "A", "A"],
    [6, 2, "Arif Khan", "ARF", "0305-6666666", 1, "B", "A"],
    [7, 2, "Sajjad Hussain", "SJD", "0306-7777777", 2, "A", "A"],
    [8, 2, "Imran Shah", "IMR", "0307-8888888", 2, "B", "A"],
    [9, 3, "Bilal Ahmed", "BLL", "0308-9999999", 1, "A", "A"],
    [10, 3, "Kamran Ali", "KMR", "0309-0000000", 1, "B", "A"],
    [11, 3, "Naveed Aslam", "NVD", "0311-1111111", 2, "A", "A"],
    [12, 3, "Faisal Mehmood", "FSL", "0312-2222222", 2, "B", "A"],
  ];
  for (const [code, level, name, short, cell, shed, shift, status] of staff) {
    await client.execute({ sql: "INSERT INTO production_staff (code, level, name, name_short, cell, shed, shift, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: [code, level, name, short, cell, shed, shift, status] });
  }

  // Party Counts
  const pcs: [string, number, number, number, number, string, string, string][] = [
    ["3.04.01.0001", 20, 280, 19.5, 20.2, "A", "PUR", "W"],
    ["3.04.01.0001", 30, 320, 29.8, 30.5, "A", "PUR", "W"],
    ["3.04.01.0002", 40, 410, 39.5, 40.8, "A", "PUR", "W"],
    ["3.04.01.0003", 20, 275, 19.2, 20.1, "A", "PUR", "W"],
    ["3.04.01.0004", 30, 315, 29.5, 30.2, "A", "PUR", "C"],
    ["3.04.01.0005", 60, 520, 59.5, 60.8, "A", "PUR", "W"],
    ["3.05.01.0001", 20, 48, 19.8, 20.5, "A", "SAL", "G"],
    ["3.05.01.0002", 40, 62, 39.8, 40.5, "A", "SAL", "G"],
    ["3.05.01.0003", 30, 55, 29.5, 30.2, "A", "SAL", "G"],
  ];
  for (const [party, count, rate, weft, warp, status, trn, group] of pcs) {
    await client.execute({ sql: "INSERT INTO party_counts (party_code, count_code, rate_per_lbs, cal_count_weft, cal_count_warp, status, trn_type, count_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: [party, count, rate, weft, warp, status, trn, group] });
  }

  // Products — main categories, sub categories, and product codes
  for (const [code, desc] of [[1, "GREY CLOTH"], [2, "DYED CLOTH"], [3, "YARN"]] as const) {
    await client.execute({ sql: "INSERT INTO products_main (code, description) VALUES (?, ?)", args: [code, desc] });
  }
  for (const [code, desc] of [[1, "SHEETING"], [2, "POPLIN"], [3, "TWILL"], [4, "CANVAS"], [5, "PERCALE"], [6, "DRILL"], [7, "LAWN"], [8, "SATIN"], [9, "DOBBY"]] as const) {
    await client.execute({ sql: "INSERT INTO products_sub (code, description) VALUES (?, ?)", args: [code, desc] });
  }
  const prods: [number, string, string, string, number, number][] = [
    [1001, "63\" Grey Sheeting 20x20", "GREY CLOTH", "SHEETING", 1, 1],
    [1002, "72\" Grey Sheeting 20x16", "GREY CLOTH", "SHEETING", 1, 1],
    [1003, "44\" Grey Poplin 40x40", "GREY CLOTH", "POPLIN", 1, 2],
    [1004, "63\" Grey Twill 2/1 30x20", "GREY CLOTH", "TWILL", 1, 3],
    [1005, "58\" Grey Canvas 7x7", "GREY CLOTH", "CANVAS", 1, 4],
    [1006, "72\" Grey Percale 60x60", "GREY CLOTH", "PERCALE", 1, 5],
    [1007, "44\" Grey Drill 32x16", "GREY CLOTH", "DRILL", 1, 6],
    [1008, "63\" Grey Lawn 80x80", "GREY CLOTH", "LAWN", 1, 7],
    [1009, "58\" Grey Satin 5/1 40x30", "GREY CLOTH", "SATIN", 1, 8],
    [1010, "72\" Grey PC Sheeting 20x20", "GREY CLOTH", "SHEETING", 1, 1],
    [1011, "44\" Grey CVC Poplin 30x30", "GREY CLOTH", "POPLIN", 1, 2],
    [1012, "63\" Grey Dobby 40x40", "GREY CLOTH", "DOBBY", 1, 9],
  ];
  for (const [code, desc, mdesc, sdesc, mc, sc] of prods) {
    await client.execute({ sql: "INSERT INTO products (code, description, main_desc, sub_desc, main_code, sub_code) VALUES (?, ?, ?, ?, ?, ?)", args: [code, desc, mdesc, sdesc, mc, sc] });
  }

  // Chart Define — account chart types
  for (const [code, desc, srno] of [[1, "SELF", 1], [2, "YARN PARTIES", 2], [3, "GREY PARTIES", 3], [4, "BROKER", 4], [5, "BANK", 5]] as const) {
    await client.execute({ sql: "INSERT INTO chart_define (code, description, srno) VALUES (?, ?, ?)", args: [code, desc, srno] });
  }

  // Yarn Transactions
  const yarnTxns: [string, string, number, string | null, string, number, number, number, number, string | null, string | null, string | null, string | null][] = [
    ["RECEIPT", "2022-07-18", 1, "Al-Hamd Yarn Traders", "20/1", 50, 5000, 280, 1400000, "LEV-2234", "BL-4421", null, null],
    ["RECEIPT", "2022-07-25", 2, "Crescent Textile Mills", "30/1", 30, 3000, 320, 960000, "LEW-5567", "BL-4455", null, null],
    ["RECEIPT", "2022-08-05", 3, "Diamond Fibre Ltd", "40/1", 20, 2000, 410, 820000, "LEX-8890", null, null, null],
    ["RECEIPT", "2022-08-12", 4, "Fazal Cotton Mills", "20/1-PC", 40, 4000, 295, 1180000, "LEY-1123", "BL-4489", null, null],
    ["RETURN", "2022-08-20", 1, "Al-Hamd Yarn Traders", "20/1", 5, 500, 280, 140000, null, null, null, "Defective lot"],
    ["TRANSFER", "2022-07-22", 1, null, "20/1", 10, 1000, 0, 0, null, null, "YARN GODAM GHAR", "WEAVING SHED A"],
    ["TRANSFER", "2022-07-28", 2, null, "30/1", 8, 800, 0, 0, null, null, "YARN GODAM GHAR", "WEAVING SHED A"],
    ["TRANSFER", "2022-08-08", 3, null, "40/1", 5, 500, 0, 0, null, null, "YARN GODAM GHAR", "WEAVING SHED B"],
    ["TRANSFER", "2022-08-15", 4, null, "20/1-PC", 12, 1200, 0, 0, null, null, "YARN GODAM GHAR", "WEAVING SHED A"],
    ["RECEIPT", "2022-08-22", 5, "Gohar Textiles", "60/1", 15, 1500, 520, 780000, "LEZ-3345", "BL-4501", null, null],
    ["TRANSFER", "2022-08-25", 5, null, "60/1", 6, 600, 0, 0, null, null, "YARN GODAM GHAR", "WEAVING SHED B"],
    ["RECEIPT", "2022-09-01", 6, "Crescent Textile Mills", "30/1-CVC", 25, 2500, 340, 850000, "LFA-1122", "BL-4520", null, null],
  ];
  for (const [type, date, no, party, yarn, bags, wt, rate, amt, veh, bil, from, to] of yarnTxns) {
    await client.execute({ sql: "INSERT INTO yarn_transactions (trans_type, trans_date, trans_no, fy_code, party, yarn_count, bags, weight_kg, rate, amount, vehicle_no, bilty_no, from_location, to_location) VALUES (?, ?, ?, '2022', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [type, date, no, party, yarn, bags, wt, rate, amt, veh, bil, from, to] });
  }

  // Beam Transactions
  const beamTxns: [string, string, number, string, string | null, string | null, number | null, number | null, number | null, string, string][] = [
    ["EMPTY_ISSUE", "2022-07-20", 1, "BM-001", null, "20/1", null, null, null, "STORE", "WARPING"],
    ["EMPTY_ISSUE", "2022-07-21", 2, "BM-002", null, "20/1", null, null, null, "STORE", "WARPING"],
    ["EMPTY_ISSUE", "2022-07-22", 3, "BM-003", null, "40/1", null, null, null, "STORE", "WARPING"],
    ["EMPTY_RETURN", "2022-08-10", 1, "BM-010", null, null, null, null, 45, "WEAVING SHED A", "STORE"],
    ["EMPTY_RETURN", "2022-08-10", 2, "BM-011", null, null, null, null, 45, "WEAVING SHED B", "STORE"],
    ["WARPED_RECV", "2022-07-25", 1, "BM-004", "City Sizing House", "20/1", 3200, 1100, 350, "EXTERNAL", "WEAVING SHED A"],
    ["WARPED_RECV", "2022-07-28", 2, "BM-005", "City Sizing House", "40/1", 5200, 900, 210, "EXTERNAL", "WEAVING SHED B"],
    ["WARPED_RECV", "2022-08-01", 3, "BM-006", "Madina Sizing Works", "60/1", 4800, 750, 145, "EXTERNAL", "WEAVING SHED B"],
    ["WARPED_RECV", "2022-08-03", 4, "BM-007", "Madina Sizing Works", "30/1", 3600, 950, 280, "EXTERNAL", "WEAVING SHED B"],
    ["EMPTY_ISSUE", "2022-08-05", 4, "BM-008", null, "20/1", null, null, null, "STORE", "WARPING"],
    ["WARPED_RECV", "2022-08-07", 5, "BM-014", "City Sizing House", "60/1", 4800, 700, 135, "EXTERNAL", "WEAVING SHED B"],
  ];
  for (const [type, date, no, beam, party, yarn, ends, len, wt, from, to] of beamTxns) {
    await client.execute({ sql: "INSERT INTO beam_transactions (trans_type, trans_date, trans_no, fy_code, beam_no, party, yarn_count, ends, length, weight, from_location, to_location) VALUES (?, ?, ?, '2022', ?, ?, ?, ?, ?, ?, ?, ?)", args: [type, date, no, beam, party, yarn, ends, len, wt, from, to] });
  }

  // Knotting Transactions
  const knottingTxns: [string, number, string, string, string, string, number, number, number][] = [
    ["2022-07-25", 1, "00122", "BM-001", "KNOTTING", "Akram Khan", 1, 800, 800],
    ["2022-07-26", 2, "00122", "BM-002", "KNOTTING", "Bashir Ahmed", 2, 800, 800],
    ["2022-07-27", 3, "00222", "BM-003", "KNOTTING", "Chaudhry Aslam", 11, 800, 800],
    ["2022-08-02", 4, "00522", "BM-004", "SARNING", "Dost Muhammad", 5, 600, 600],
    ["2022-08-04", 5, "00622", "BM-005", "KNOTTING", "Ehsan Ullah", 15, 800, 800],
    ["2022-08-06", 6, "00722", "BM-006", "MAROORI", "Farooq Ahmed", 25, 500, 500],
    ["2022-08-08", 7, "00822", "BM-007", "KNOTTING", "Ghulam Abbas", 30, 800, 800],
    ["2022-08-10", 8, "00122", "BM-008", "SARNING", "Hamid Raza", 1, 600, 600],
    ["2022-08-12", 9, "00722", "BM-014", "KNOTTING", "Akram Khan", 28, 800, 800],
    ["2022-08-14", 10, "00822", "BM-015", "KNOTTING", "Bashir Ahmed", 35, 800, 800],
  ];
  for (const [date, no, contract, beam, type, weaver, loom, rate, amount] of knottingTxns) {
    await client.execute({ sql: "INSERT INTO knotting_transactions (trans_date, trans_no, fy_code, contract_no, beam_no, trans_type, weaver, loom_no, rate, amount) VALUES (?, ?, '2022', ?, ?, ?, ?, ?, ?, ?)", args: [date, no, contract, beam, type, weaver, loom, rate, amount] });
  }

  // Production Hours Schedule
  for (let day = 1; day <= 30; day++) {
    const date = `2022-08-${String(day).padStart(2, "0")}`;
    for (const shed of ["A", "B"]) {
      const dayLooms = shed === "A" ? 20 + (day % 3) : 18 + (day % 4);
      const nightLooms = shed === "A" ? 18 + (day % 3) : 16 + (day % 4);
      await client.execute({ sql: "INSERT INTO production_hours (schedule_date, shed, shift, start_time, end_time, hours, looms_running) VALUES (?, ?, 'DAY', '06:00', '18:00', 12, ?)", args: [date, shed, dayLooms] });
      await client.execute({ sql: "INSERT INTO production_hours (schedule_date, shed, shift, start_time, end_time, hours, looms_running) VALUES (?, ?, 'NIGHT', '18:00', '06:00', 12, ?)", args: [date, shed, nightLooms] });
    }
  }

  // Grey Despatch
  const greyDsp: [number, string, string, number, string, number, number, string | null, string | null, string | null][] = [
    [1, "2022-08-05", "DILPASAND DYING LAHORE", 29, "GC-001", 2500, 12, "LEV-4421", "BL-7701", "GP-001"],
    [2, "2022-08-10", "UNI TEXTILE DYING LHR", 3, "GC-003", 1800, 8, "LEW-5512", "BL-7702", "GP-002"],
    [3, "2022-08-15", "CRYSTAL DYING", 7, "GC-001", 3200, 15, "LEX-6623", "BL-7703", "GP-003"],
    [4, "2022-08-18", "AL RAHIM DYING", 5, "GC-006", 2100, 10, "LEY-7734", null, "GP-004"],
    [5, "2022-08-22", "SAFA DYING LAHORE", 17, "GC-004", 1500, 7, "LEZ-8845", "BL-7705", "GP-005"],
    [6, "2022-08-25", "AL-JANNAT DYING GUJJAR BASTI", 26, "GC-002", 2800, 13, "LFA-9956", "BL-7706", "GP-006"],
    [7, "2022-08-28", "SHAFI DYING", 8, "GC-003", 1900, 9, "LFB-1067", null, "GP-007"],
    [8, "2022-09-01", "GODAM MALIK SHAHID RASEED FACTORY", 6, "GC-001", 3500, 16, "LFC-2178", "BL-7708", "GP-008"],
    [9, "2022-09-05", "VARIETY DYING GUJJAR BASI", 9, "GC-006", 2200, 10, "LFD-3289", "BL-7709", "GP-009"],
    [10, "2022-09-08", "TAQWA WEAVING", 24, "GC-004", 1600, 8, "LFE-4390", null, "GP-010"],
    [11, "2022-09-12", "AL NOOR TEXTILE DYING", 4, "GC-002", 2700, 12, "LFF-5401", "BL-7711", "GP-011"],
    [12, "2022-09-15", "ZEENO DYING GUJJAR BSSTI", 10, "GC-003", 2000, 9, "LFG-6512", "BL-7712", "GP-012"],
  ];
  for (const [no, date, party, pcode, product, meters, rolls, veh, bil, gp] of greyDsp) {
    await client.execute({ sql: "INSERT INTO grey_despatch (despatch_no, fy_code, despatch_date, party, party_code, product, meters, rolls, vehicle_no, bilty_no, gate_pass_no) VALUES (?, '2022', ?, ?, ?, ?, ?, ?, ?, ?, ?)", args: [no, date, party, pcode, product, meters, rolls, veh, bil, gp] });
  }

  // Store Demands
  const demands: [number, string, string, string, number, number, string][] = [
    [1, "2022-07-10", "WEAVING SHED-A", "Zafar Iqbal", 5, 45000, "A"],
    [2, "2022-07-15", "WEAVING SHED-B", "Tariq Mehmood", 3, 28000, "A"],
    [3, "2022-07-22", "WARPING DEPARTMENT", "Rashid Ali", 4, 35000, "A"],
    [4, "2022-08-01", "ELECTRICAL WORKSHOP", "Waqas Ali", 6, 52000, "A"],
    [5, "2022-08-05", "WEAVING SHED-A", "Zafar Iqbal", 8, 68000, "A"],
    [6, "2022-08-12", "MECHANICAL WORKSHOP", "Nasir Ahmed", 4, 32000, "A"],
    [7, "2022-08-18", "SIZING DEPARTMENT", "Waheed Hassan", 3, 95000, "P"],
    [8, "2022-08-25", "WEAVING SHED-B", "Tariq Mehmood", 5, 41000, "P"],
    [9, "2022-09-01", "FOLDING & INSPECTION", "Arif Khan", 2, 12000, "P"],
    [10, "2022-09-05", "WEAVING SHED-A", "Zafar Iqbal", 7, 55000, "P"],
  ];
  for (const [no, date, dept, by, items, amt, status] of demands) {
    await client.execute({ sql: "INSERT INTO store_demands (demand_no, fy_code, demand_date, department, requested_by, item_count, total_amount, status) VALUES (?, '2022', ?, ?, ?, ?, ?, ?)", args: [no, date, dept, by, items, amt, status] });
  }

  // Store GRN
  const grns: [number, string, string, string, number, number][] = [
    [1, "2022-07-15", "Pakistan Bearing House", "INV-2201", 5, 48500],
    [2, "2022-07-20", "Faisalabad Electric Supply", "INV-3301", 3, 125000],
    [3, "2022-07-28", "Textile Parts & Machinery", "INV-4401", 8, 185000],
    [4, "2022-08-05", "Kamran Belt & Bearing", "INV-5501", 4, 32000],
    [5, "2022-08-12", "National Chemical Works", "INV-6601", 2, 95000],
    [6, "2022-08-20", "Punjab Lubricants", "INV-7701", 3, 42000],
    [7, "2022-08-28", "Rapier Parts Trading", "INV-8801", 6, 210000],
    [8, "2022-09-05", "Pakistan Bearing House", "INV-2215", 4, 35000],
  ];
  for (const [no, date, supplier, inv, items, amt] of grns) {
    await client.execute({ sql: "INSERT INTO store_grn (grn_no, fy_code, grn_date, supplier, invoice_no, item_count, total_amount) VALUES (?, '2022', ?, ?, ?, ?, ?)", args: [no, date, supplier, inv, items, amt] });
  }

  // Store Gate Pass
  const gps: [number, string, string, string, string | null, string, number][] = [
    [1, "2022-07-15", "IN", "Pakistan Bearing House", "LEV-1100", "GRN Receipt", 5],
    [2, "2022-07-20", "IN", "Faisalabad Electric Supply", "LEW-2200", "GRN Receipt", 3],
    [3, "2022-07-25", "OUT", "City Sizing House", "LEX-3300", "Beam delivery", 2],
    [4, "2022-07-28", "IN", "Textile Parts & Machinery", "LEY-4400", "GRN Receipt", 8],
    [5, "2022-08-01", "OUT", "Madina Sizing Works", "LEZ-5500", "Beam delivery", 3],
    [6, "2022-08-05", "IN", "Kamran Belt & Bearing", "LFA-6600", "GRN Receipt", 4],
    [7, "2022-08-08", "OUT", "Ashfaq Weaving Factory", null, "Grey conversion", 1],
    [8, "2022-08-12", "IN", "National Chemical Works", "LFB-7700", "GRN Receipt", 2],
    [9, "2022-08-15", "OUT", "Bilal Power Looms", "LFC-8800", "Grey conversion", 1],
    [10, "2022-08-20", "IN", "Punjab Lubricants", "LFD-9900", "GRN Receipt", 3],
    [11, "2022-08-25", "OUT", "Sajjad Knotting Service", null, "Beam knotting", 2],
    [12, "2022-09-01", "IN", "Rapier Parts Trading", "LFE-1010", "GRN Receipt", 6],
  ];
  for (const [no, date, type, party, veh, purpose, items] of gps) {
    await client.execute({ sql: "INSERT INTO store_gatepass (gatepass_no, fy_code, gatepass_date, gatepass_type, party, vehicle_no, purpose, item_count) VALUES (?, '2022', ?, ?, ?, ?, ?, ?)", args: [no, date, type, party, veh, purpose, items] });
  }

  // Inventory Opening — yarn and grey opening balances
  const invOpenings: [string, string, string, number, number, number, string, string][] = [
    ["YARN", "20/1", "Cotton 20/1 Single", 12500, 285, 3562500, "KG", "YARN GODOWN"],
    ["YARN", "30/1", "Cotton 30/1 Single", 8200, 310, 2542000, "KG", "YARN GODOWN"],
    ["YARN", "40/1", "Cotton 40/1 Single", 5600, 345, 1932000, "KG", "YARN GODOWN"],
    ["YARN", "16/1", "Cotton 16/1 Single", 15000, 260, 3900000, "KG", "YARN GODOWN"],
    ["YARN", "10/1", "Cotton 10/1 Single", 20000, 240, 4800000, "KG", "YARN GODOWN"],
    ["YARN", "20/2", "Cotton 20/2 Double", 3200, 380, 1216000, "KG", "YARN GODOWN"],
    ["GREY", "GR-001", "Grey 63\" Plain 20x20", 45000, 85, 3825000, "MTR", "GREY GODOWN"],
    ["GREY", "GR-002", "Grey 63\" Twill 30x30", 32000, 95, 3040000, "MTR", "GREY GODOWN"],
    ["GREY", "GR-003", "Grey 44\" Plain 40x40", 18000, 110, 1980000, "MTR", "GREY GODOWN"],
    ["BEAM", "BM-EMPTY", "Empty Beams (Various)", 150, 8500, 1275000, "PCS", "BEAM STORE"],
    ["PARTS", "SP-GEN", "General Spare Parts", 1, 450000, 450000, "LOT", "STORE"],
    ["PARTS", "SP-SHUTTLE", "Shuttles Inventory", 85, 3500, 297500, "PCS", "STORE"],
  ];
  for (const [type, code, desc, qty, rate, amt, unit, loc] of invOpenings) {
    await client.execute({ sql: "INSERT INTO inventory_opening (fy_code, item_type, item_code, description, opening_qty, opening_rate, opening_amount, unit, location, entry_date) VALUES ('2022', ?, ?, ?, ?, ?, ?, ?, ?, '2022-07-01')", args: [type, code, desc, qty, rate, amt, unit, loc] });
  }

  // Branch Opening
  const branches: [string, string, string, string, string, string][] = [
    ["MAIN", "SK Weaving Mills - Main", "P-224, Industrial Estate", "Faisalabad", "041-8780001", "2020-07-01"],
    ["GDN", "Yarn Godown", "P-225, Industrial Estate", "Faisalabad", "041-8780002", "2020-07-01"],
    ["SZG", "Sizing Unit", "P-226, Industrial Estate", "Faisalabad", "041-8780003", "2021-01-01"],
  ];
  for (const [code, name, addr, city, phone, date] of branches) {
    await client.execute({ sql: "INSERT INTO branch_opening (branch_code, branch_name, address, city, phone, fy_code, opening_date) VALUES (?, ?, ?, ?, ?, '2022', ?)", args: [code, name, addr, city, phone, date] });
  }

  // Grey Paki Parchi — delivery receipts
  const pakiParchis: [number, string, string, string, number, number, number, number, number, number, number, number, string][] = [
    [1, "2022-08-10", "AL-KARAM TEXTILE", "3.01.01.01.0012", 101, 18, 1250, 1220, 52, 63.5, 78, 85.50, "CNT-001"],
    [2, "2022-08-15", "NISHAT MILLS", "3.01.01.01.0015", 102, 24, 1680, 1650, 56, 63.0, 92, 88.00, "CNT-002"],
    [3, "2022-08-22", "GULL AHMED TEXTILE", "3.01.01.01.0018", 103, 12, 840, 825, 48, 44.0, 72, 110.50, "CNT-003"],
    [4, "2022-09-01", "SAPPHIRE TEXTILE", "3.01.01.01.0020", 101, 30, 2100, 2070, 52, 63.5, 78, 85.50, "CNT-001"],
    [5, "2022-09-05", "AL-KARAM TEXTILE", "3.01.01.01.0012", 104, 15, 1050, 1035, 60, 63.0, 88, 92.00, "CNT-004"],
    [6, "2022-09-10", "CHENAB LIMITED", "3.01.01.01.0025", 102, 20, 1400, 1380, 56, 63.0, 92, 88.00, "CNT-002"],
    [7, "2022-09-18", "NISHAT MILLS", "3.01.01.01.0015", 105, 35, 2450, 2415, 48, 63.5, 75, 82.00, "CNT-005"],
    [8, "2022-09-25", "KOHINOOR TEXTILE", "3.01.01.01.0030", 101, 22, 1540, 1520, 52, 63.5, 78, 85.50, "CNT-001"],
    [9, "2022-10-02", "GULL AHMED TEXTILE", "3.01.01.01.0018", 103, 16, 1120, 1105, 48, 44.0, 72, 110.50, "CNT-003"],
    [10, "2022-10-10", "SAPPHIRE TEXTILE", "3.01.01.01.0020", 106, 28, 1960, 1935, 54, 63.0, 85, 90.00, "CNT-006"],
  ];
  for (const [no, date, party, pcode, gcode, than, mtrs, mtrsNet, pick, width, rate, amt, cno] of pakiParchis) {
    await client.execute({ sql: "INSERT INTO grey_paki_parchi (pp_no, fy_code, pp_date, party, party_code, grey_code, loom_type, qty_than, qty_mtrs, qty_mtrs_net, grey_pick, grey_width, rate, amount, contract_no) VALUES (?, '2022', ?, ?, ?, ?, 'SHUTTLE', ?, ?, ?, ?, ?, ?, ?, ?)", args: [no, date, party, pcode, gcode, than, mtrs, mtrsNet, pick, width, rate, amt, cno] });
  }

  console.log("Database seeded successfully.");
}

seed().catch(console.error);
