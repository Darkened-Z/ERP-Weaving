// Builds demo/demo.db — the database behind erp-weaving.vercel.app (DEMO_DB=1).
//
// Structure comes from the live database, READ-ONLY: every table's DDL plus the
// generic masters (account heads, yarn counts, constructions, looms, statuses,
// fiscal years, posting accounts …). Nothing that names the client's business is
// copied: every party, bank, contract, beam, voucher and production figure here
// is made up below. Run from app/:  ./node_modules/.bin/tsx demo/build-demo-db.ts
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/db/schema";

const OUT = path.join(process.cwd(), "demo", "demo.db");
const TODAY = "2026-10-20";
const FY = "2026";

for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const live = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });

// Masters copied as they are: textile and accounting structure, no client names.
const COPY = [
  "beam_statuses", "chart_define", "cities", "company_units", "cost_centers", "fiscal_years",
  "grey_construction", "locations", "posting_accounts", "products_main",
  "products_sub", "system_locking", "voucher_types", "yarn_blends", "yarn_brands", "yarn_counts",
  "yarn_fibers", "chart_parts",
];
// Generic level-5 accounts kept by code prefix (income, expenses, cash, stock).
const KEEP_L5 = ["5.", "7.", "1.01.11.01.", "1.01.25.15.", "1.01.25.16.", "3.01.01.03."];
const KEEP_L5_EXACT = ["1.01.25.01.0001", "1.01.25.01.0002", "3.03.25.03.0003"];

let seed = 20261020;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const between = (a: number, b: number) => a + rand() * (b - a);
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(4, "0");
const addDays = (d: string, n: number) => {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const iso = (d: string, h = 10) => `${d}T${String(h).padStart(2, "0")}:00:00.000Z`;

async function main() {
  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);
  const out = createClient({ url: `file:${OUT}` });
  await out.execute("PRAGMA foreign_keys = OFF");

  // ── Structure ──
  const ddl = await live.execute(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' AND name NOT LIKE '_litestream%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
  );
  for (const r of ddl.rows) await out.execute(String(r[2]));

  const copyRows = async (table: string, where = "", scrub?: (row: Record<string, unknown>) => void) => {
    const rs = await live.execute(`SELECT * FROM "${table}" ${where}`);
    const cols = rs.columns;
    const stmts = rs.rows.map((r) => {
      const row: Record<string, unknown> = Object.fromEntries(cols.map((c, i) => [c, r[i]]));
      scrub?.(row);
      return {
        sql: `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
        args: cols.map((c) => row[c] as never),
      };
    });
    for (let i = 0; i < stmts.length; i += 300) await out.batch(stmts.slice(i, i + 300), "write");
    return rs.rows.length;
  };
  for (const t of COPY) await copyRows(t);
  await copyRows("looms", "", (r) => {
    r.weaver_name = null; r.forman = null; r.group = null;
    // Only real machine makes survive; anything else was a person's name.
    if (!/^(SULZER|PICANOL|TOYOTA|TSUDAKOMA|AIR ?JET|RUSSIAN|STAUBLI|DORNIER|SOMET|VAMATEX)/i.test(String(r.make ?? ""))) r.make = null;
    r.status_wrk = null; r.current_contract = null; r.current_product = null; r.current_beam = null;
  });
  const keepL5 = [...KEEP_L5.map((p) => `code LIKE '${p}%'`), ...KEEP_L5_EXACT.map((c) => `code = '${c}'`)].join(" OR ");
  await copyRows("chart_of_accounts", `WHERE level <= 4 OR (level = 5 AND (${keepL5}))`, (r) => {
    for (const k of Object.keys(r)) if (!["code", "code_head", "code_auto", "level", "description", "desc_short", "status", "bs_code", "pl_code"].includes(k)) r[k] = null;
  });

  const db = drizzle(out, { schema });

  // ── Made-up accounts ──
  const parties: Record<string, string[]> = {
    "1.01.01.01": ["DEMO WEAVING CO (WVG)", "NOOR CONVERSION (WVG)", "STAR FABRICS CONV (WVG)"],
    "1.01.01.19": ["CRESCENT CONVERSION (COMMERCIAL)"],
    "1.01.01.10": ["ALPHA TEXTILE", "BETA FABRICS", "GAMMA CLOTH TRADERS", "DELTA DYEING", "OMEGA CLOTH HOUSE"],
    "3.03.01.01": ["SUNRISE YARN TRADERS", "VALLEY SPINNING", "UNITED YARN HOUSE", "PRIME COTTON MILLS"],
    "3.03.06.02": ["CITY SIZING INDUSTRY", "MODEL SIZING"],
    "3.03.25.03": ["AHMED BROKER", "RAZA BROKERS"],
    "3.03.30.01": ["RIVERSIDE GREY TRADERS"],
    "3.03.31.01": ["SUPREME PRINTING", "COLOR LINE DYEING"],
    "3.03.08.01": ["MACHINE PARTS CENTRE"],
    "1.01.15.02": ["DEMO BANK - CURRENT A/C", "CITY BANK - CURRENT A/C"],
    "1.01.15.03": ["ADVANCE CHQ DEMO BANK", "ADVANCE CHQ CITY BANK"],
    "1.01.15.04": ["CHQ DISHONOUR A/C"],
    "1.01.25.01": ["GODOWN - CITY SIZING"],
    "3.01.01.06": ["OWNER CAPITAL A/C"],
  };
  const codeOf: Record<string, string> = {};
  const taken = new Set((await db.select({ code: schema.chartOfAccounts.code }).from(schema.chartOfAccounts)).map((r) => r.code));
  for (const [head, names] of Object.entries(parties)) {
    let n = 1;
    for (const description of names) {
      while (taken.has(`${head}.${pad(n)}`)) n++;
      const code = `${head}.${pad(n)}`;
      taken.add(code);
      codeOf[description] = code;
      await db.insert(schema.chartOfAccounts).values({ code, codeHead: head, codeAuto: pad(n), level: 5, description, descShort: description.slice(0, 12), city: "FSD" });
    }
  }
  const WVG = parties["1.01.01.01"];
  const GREY_BUYERS = parties["1.01.01.10"];
  const YARN_SUPPLIERS = parties["3.03.01.01"];
  const CASH = "1.01.11.01.0001";
  const INCOME_CONV = "5.01.01.01.0001";
  const INCOME_YARN = "5.01.01.01.0005";
  const INCOME_GREY = "5.01.01.01.0006";
  const GREY_GODOWN = "Godown - Grey Stock Treading";

  await db.insert(schema.companyProfile).values({
    name: "Demo Weaving Mills", address: "Industrial Estate, Faisalabad", city: "Faisalabad",
    phone: "000-0000000", email: "demo@example.com", currentFy: FY, fyStart: "2026-07-01", fyEnd: "2027-06-30",
  });
  await db.insert(schema.users).values({ login: "demo", password: bcrypt.hashSync("demo123", 10), fullName: "Demo Admin", roleName: "ADMIN", status: "A" });

  // ── Contracts ──
  const counts = await db.select().from(schema.yarnCounts);
  const countDesc = new Map(counts.map((c) => [String(c.countCode), c.description ?? ""]));
  const calOf = (code: string | null | undefined) => parseFloat((countDesc.get(String(code)) ?? "30").match(/\d+(\.\d+)?/)?.[0] ?? "30");
  const constrs = (await db.select().from(schema.greyConstruction)).filter((g) => g.reed && g.pick && g.warpCount && g.weftCount).slice(0, 4);
  const ratePerPick = [0.8, 0.55, 0.55, 0.56];
  const contracts: { contNo: string; party: string; product: string; construction: string; rate: number; pick: number; width: number }[] = [];
  const productNames = ["PLAIN POPLIN", "TWILL SHIRTING", "SATIN STRIPE", "WOOL SUITING"];
  for (const [i, description] of productNames.entries()) {
    await db.insert(schema.products).values({ code: i + 1, description, mainDesc: "GREY CLOTH", mainCode: 1 });
  }
  for (const [i, name] of ["SUPREME PRINTING", "COLOR LINE DYEING", "CITY PROCESSING"].entries()) {
    await db.insert(schema.greyDspChart).values({ code: i + 1, name, nameShort: name.split(" ")[0] });
  }
  for (let i = 0; i < constrs.length; i++) {
    const g = constrs[i];
    const contNo = `IGCC-${pad(i + 1)}`;
    const party = WVG[i % WVG.length];
    const pick = g.pick!;
    const width = g.width ?? 61;
    const warpEnds = Math.round(g.reed! * width * 1.15);
    const weftEnds = Math.round(pick * width * 1.02);
    const warpCal = calOf(g.warpCount), weftCal = calOf(g.weftCount);
    const warpWt = warpEnds / 731.52 / warpCal, weftWt = weftEnds / 731.52 / weftCal;
    const warpRate = 350, weftRate = 340;
    const conv = r2(pick * ratePerPick[i]);
    const cost = warpWt * warpRate + weftWt * weftRate;
    const [c] = await db.insert(schema.intGreyConversionContract).values({
      contNo, lContNo: i + 1, contDate: "2026-09-20", status: "R", type: "CONV", party,
      ratePerPick: ratePerPick[i], loomType: i % 2 ? "SULZER" : "AIR_JET", grayQltyCode: g.code,
      read: g.reed, pick, width, qtyMtr: 60000,
      warpWtPerMtr: r2(warpWt * 1e4) / 1e4, weftWtPerMtr: r2(weftWt * 1e4) / 1e4, wtPerMtr: r2((warpWt + weftWt) * 1e4) / 1e4,
      wrpWt40: r2(warpWt * 40), wftWt40: r2(weftWt * 40), weight40: r2((warpWt + weftWt) * 40),
      warpCostPerMtr: r2(warpWt * warpRate), weftCostPerMtr: r2(weftWt * weftRate), costPerMtr: r2(cost),
      convRatePerMtr: conv, grayRatePerMtr: r2(cost + conv), productName: productNames[i], productQuality: productNames[i],
      postedDate: iso("2026-09-20"),
    }).returning({ id: schema.intGreyConversionContract.id });
    await db.insert(schema.intGreyConversionWarp).values({ contractId: c.id, srNo: 1, count: g.warpCount, descr: countDesc.get(String(g.warpCount)) ?? null, brand: "AJ", calCount: warpCal, ends: warpEnds, wtPerMtr: r2(warpWt * 1e6) / 1e6, ratePerLbs: warpRate, costPerMtr: r2(warpWt * warpRate) });
    await db.insert(schema.intGreyConversionWeft).values({ contractId: c.id, srNo: 1, count: g.weftCount, descr: countDesc.get(String(g.weftCount)) ?? null, brand: "AJ", calCount: weftCal, ends: weftEnds, wtPerMtr: r2(weftWt * 1e6) / 1e6, ratePerLbs: weftRate, costPerMtr: r2(weftWt * weftRate) });
    contracts.push({ contNo, party, product: productNames[i], construction: g.code, rate: conv, pick, width });
  }

  // ── Beams on looms ──
  const allLooms = await db.select().from(schema.looms);
  const bySh = (s: string) => allLooms.filter((l) => l.shed === s).sort((a, b) => a.loomNo - b.loomNo).slice(0, 4);
  const running = [...bySh("1"), ...bySh("2"), ...bySh("3")];
  const beams: { beamNo: string; loomNo: number; shed: string; contract: (typeof contracts)[number]; woven: number }[] = [];
  let beamN = 1;
  for (const [i, l] of running.entries()) {
    const contract = contracts[i % contracts.length];
    const beamNo = `DB-${String(beamN).padStart(2, "0")}`;
    const setNo = String(Math.ceil(beamN / 2));
    await db.insert(schema.beams).values({
      beamNo, type: "WARP", ends: 4400 + (i % 4) * 300, length: 5600, shed: l.shed, loomNo: l.loomNo,
      contractNo: contract.contNo, setNo, beamSetNo: `${setNo}-${beamN}`, brVno: `SET-${pad(Number(setNo))}`, brDate: "2026-09-24",
      knVno: `IKS-${pad(beamN)}`, knDate: "2026-09-26", statusWrk: "RUNNING", statusLoc: "RUNNING", receivedDate: "2026-09-24",
    });
    await db.update(schema.looms).set({ statusWrk: "RUNNING", currentBeam: beamNo, currentContract: contract.contNo, currentProduct: contract.construction }).where(eqLoom(l.id));
    beams.push({ beamNo, loomNo: l.loomNo, shed: l.shed, contract, woven: 0 });
    beamN++;
  }
  for (let k = 0; k < 6; k++) {
    await db.insert(schema.beams).values({ beamNo: `DB-${String(beamN).padStart(2, "0")}`, type: "WARP", ends: 4400, length: 5600, statusWrk: "EMPTY", statusLoc: "EMPTY" });
    beamN++;
  }

  // ── Daily production: one voucher per running loom per day ──
  let idp = 1;
  const thans: { contNo: string; serial: string; length: number; setId: number; vDate: string }[] = [];
  for (let d = 0; d < 23; d++) {
    const vDate = addDays("2026-09-28", d);
    for (const b of beams) {
      const vNo = `IDP-${pad(idp)}`;
      const [p] = await db.insert(schema.intDailyProduction).values({
        vDate, vNo, lvNo: idp, time: "16:00", shedNo: b.shed, convContParty: b.contract.party, beamContParty: b.contract.party,
        szgParty: "CITY SIZING INDUSTRY", productQuality: b.contract.product, productBrand: "AJ", postedDate: iso(vDate, 11),
      }).returning({ id: schema.intDailyProduction.id });
      const twoWidth = b.shed === "1" || b.shed === "2";
      const m = Math.round(twoWidth ? between(108, 126) : between(185, 230));
      b.woven += m;
      const rows = twoWidth ? ["A", "B"] : ["A"];
      for (const [k, row] of rows.entries()) {
        const len = k === 0 ? m : Math.round(m + between(-3, 3));
        const [s] = await db.insert(schema.intDailyProductionSet).values({
          productionId: p.id, srNo: k + 1, mmThanSrNo: `${vNo}/${row}`, aCount: len, totalCount: len,
          loomNo: b.loomNo, contNo: b.contract.contNo, beamNo: k === 0 ? b.beamNo : null, rcvdMtr: k === 0 ? b.woven : null,
        }).returning({ id: schema.intDailyProductionSet.id });
        thans.push({ contNo: b.contract.contNo, serial: `${vNo}/${row}`, length: len, setId: s.id, vDate });
      }
      idp++;
    }
  }

  // ── Grey despatch of the early thans + GDP ledger ──
  const dispatchFor = async (n: number, contract: (typeof contracts)[number], vDate: string, upTo: string) => {
    const lot = thans.filter((t) => t.contNo === contract.contNo && t.vDate <= upTo).slice(0, 40);
    const mtrs = r2(lot.reduce((s, t) => s + t.length, 0));
    const amnt = r2(mtrs * contract.rate);
    const vNo = `IGD-${pad(n)}`;
    const [g] = await db.insert(schema.intGreyDespatch).values({
      vDate, time: "11:00", vNo, lNo: n, despatchLocation: "SUPREME PRINTING", convContNo: contract.contNo, party: contract.party,
      thanQty: lot.length, convRate: contract.rate, amnt, gst: 0, further: 0, amtTot: amnt, productBrand: contract.product,
      greyCode: contract.construction, width: contract.width, type: "FRS", lockState: "FINAL", postedDate: iso(vDate),
    }).returning({ id: schema.intGreyDespatch.id });
    for (const [i, t] of lot.entries()) {
      await db.insert(schema.intGreyDespatchLine).values({ despatchId: g.id, srNo: i + 1, tSrNo: t.serial as unknown as number /* declared integer, stores the than serial text like the live app */, a: t.length, lengthMtrs: t.length });
      await db.update(schema.intDailyProductionSet).set({ dlvStatus: "Y" }).where(eqSet(t.setId));
    }
    const narr = `${lot.length} THAN ${mtrs} MTR @ ${contract.rate}, ${contract.product} (DESPATCH)`;
    await gl("GDP", n, vDate, codeOf[contract.party], narr, [
      [codeOf[contract.party], amnt, 0, narr],
      [INCOME_CONV, 0, amnt, narr],
    ]);
  };
  await dispatchFor(1, contracts[0], "2026-10-06", "2026-10-03");
  await dispatchFor(2, contracts[1], "2026-10-09", "2026-10-06");
  await dispatchFor(3, contracts[2], "2026-10-14", "2026-10-10");

  // ── Ledger helper ──
  async function gl(vtype: string, vno: number, vdate: string, accCode: string, narration: string, lines: [string, number, number, string | null][], trnType?: string) {
    const total = lines.reduce((s, l) => s + l[1], 0);
    await db.insert(schema.transMain).values({ fyCode: FY, vtype, vno, vdate, accCode, narration, vtime: "12:00", trnType: trnType ?? null, balanceAmount: r2(total) });
    await db.insert(schema.transDetail).values(lines.map(([acc, debit, credit, narr], i) => ({
      fyCode: FY, vtype, vno, srno: vtype === "CP" || vtype === "CR" ? (debit > 0 === (vtype === "CP") ? i + 1 : 100 + i) : i + 1,
      accCode: acc, partyCode: acc, narration: narr, debit: r2(debit), credit: r2(credit),
    })));
  }

  // ── Yarn: purchases (Income Yarn debit) and sales (credit) ──
  const yarnCodes = counts.slice(0, 6).map((c) => String(c.countCode));
  const batches: { batch: string; count: string; rate: number; lbs: number }[] = [];
  for (let i = 1; i <= 4; i++) {
    const vDate = addDays("2026-09-25", i * 4);
    const supplier = YARN_SUPPLIERS[i - 1];
    const count = yarnCodes[i % yarnCodes.length];
    const lbs = 4000 + i * 800;
    const rate = 330 + i * 10;
    const [v] = await db.insert(schema.extYarnPurVoucher).values({ vNo: `YPV-${pad(i)}`, lvNo: i, vDate, type: "PUR", posting: "Y", loomType: "SULZER", party: supplier, term: "CASH", postedDate: iso(vDate) }).returning({ id: schema.extYarnPurVoucher.id });
    const batch = `YPV-${pad(i)}/A`;
    await db.insert(schema.extYarnPurVoucherLine).values({ voucherId: v.id, count, partyCount: count, pack: "24", brand: "AJ", qty: lbs / 100, bag: lbs / 100, lbs, unit: "GDN", despatchParty: "GODOWN - YARN STOCK (WVG)", rate, batchNo: batch });
    batches.push({ batch, count, rate, lbs });
    const narr = `@ ${rate}, ${count} ${countDesc.get(count) ?? ""} Bags ${lbs / 100} Lbs ${lbs}`;
    await gl("YPV", i, vDate, codeOf[supplier], narr, [[INCOME_YARN, lbs * rate, 0, narr], [codeOf[supplier], 0, lbs * rate, narr]]);
  }
  for (let i = 1; i <= 3; i++) {
    const b = batches[i - 1];
    const vDate = addDays("2026-10-02", i * 4);
    const party = WVG[(i - 1) % WVG.length];
    const lbs = Math.round(b.lbs * 0.6);
    const rate = b.rate + 6;
    const [v] = await db.insert(schema.extYarnSalVoucher).values({ vNo: `YSV-${pad(i)}`, lvNo: i, vDate, type: "SAL", posting: "Y", loomType: "SULZER", party, term: "CASH", lockState: "FINAL", postedDate: iso(vDate) }).returning({ id: schema.extYarnSalVoucher.id });
    await db.insert(schema.extYarnSalVoucherLine).values({ voucherId: v.id, batchNo: b.batch, count: b.count, partyCount: b.count, pack: "24", brand: "AJ", qty: lbs / 100, bag: lbs / 100, lbs, unit: "GDN", despatchParty: "GODOWN - YARN STOCK (WVG)", rate, amt: lbs * rate });
    const narr = `@ ${rate}, ${b.count} ${countDesc.get(b.count) ?? ""} Bags ${lbs / 100} Lbs ${lbs}`;
    await gl("YSV", i, vDate, codeOf[party], narr, [[codeOf[party], lbs * rate, 0, narr], [INCOME_YARN, 0, lbs * rate, narr]]);
  }

  // ── Grey trading: godown purchases (Income Grey debit) and Pakki Parchi sales (credit) ──
  for (let i = 1; i <= 2; i++) {
    await db.insert(schema.extGreySalContract).values({ contractNo: `GSC-${pad(i)}`, contractDate: "2026-09-22", status: "R", party: GREY_BUYERS[i - 1], greyCode: contracts[i - 1].construction, ratePerMtr: 215 + i * 5, quantityMtr: 30000 });
  }
  for (let i = 1; i <= 3; i++) {
    const c = contracts[(i - 1) % contracts.length];
    const vDate = addDays("2026-10-01", i * 5);
    const meter = 9000 + i * 600;
    const than = Math.round(meter / 150);
    const rate = r2(170 + i * 4);
    const total = Math.round(meter * rate);
    await db.insert(schema.extGodownStock).values({ vNo: `GDN-${pad(i)}`, lvNo: i, vDate, type: "STOCK", purchaseParty: c.party, gdnParty: GREY_GODOWN, dspQuality: c.construction, contactQuality: c.construction, than, meter, netMeter: meter, elMeter: 0, rate, total, term: "CASH", postedDate: iso(vDate) });
    const narr = `${than} THAN ${meter} MTR @ ${rate}, ${c.construction} (GREY PURCHASE)`;
    await gl("GDN", i, vDate, codeOf[c.party], narr, [[INCOME_GREY, total, 0, narr], [codeOf[c.party], 0, total, narr]]);

    const buyer = GREY_BUYERS[(i - 1) % GREY_BUYERS.length];
    const saleRate = rate + 38;
    const sale = Math.round(meter * saleRate);
    const ppDate = addDays(vDate, 2);
    await db.insert(schema.extPackiParchi).values({ vNo: `PP-${pad(i)}`, vDate: ppDate, purchaseParty: GREY_GODOWN, kpAll: "N", quality: c.construction, qualityPrint: c.construction, meterNet: meter, than, kpMeter: meter, greyRate: rate, wkcBrk: 1, type: "OK", checkery: 0.07, saleParty: buyer, convContNoSale: i <= 2 ? `GSC-${pad(i)}` : null, greyRateKp: saleRate, postedDate: iso(ppDate) });
    const sNarr = `${than} THAN ${meter} MTR @ ${saleRate}, ${c.construction} (PACKI SALE)`;
    await gl("GPV", i, ppDate, codeOf[buyer], sNarr, [[codeOf[buyer], sale, 0, sNarr], [INCOME_GREY, 0, sale, sNarr]]);
  }

  // ── Cash book ──
  const expenses: [string, number, string][] = [
    ["7.02.01.0001.0003", 185000, "ELECTRICITY BILL SEPTEMBER"],
    ["7.02.01.0001.0010", 420000, "SALARIES SEPTEMBER"],
    ["7.02.01.0001.0008", 38000, "OIL AND LUBRICANTS"],
    ["7.02.01.0002.0003", 210000, "ELECTRICITY BILL AIRJET"],
    ["7.02.01.0002.0010", 365000, "SALARIES AIRJET SHED"],
    ["7.02.01.0001.0012", 52000, "SPARE PARTS"],
  ];
  for (const [i, [acc, amt, narr]] of expenses.entries()) {
    const vDate = addDays("2026-10-01", i * 3);
    await gl("CP", i + 1, vDate, CASH, narr, [[acc, amt, 0, narr], [CASH, 0, amt, narr]], "CASH");
  }
  const receipts: [string, number][] = [[WVG[0], 900000], [WVG[1], 650000], [GREY_BUYERS[0], 1200000], [GREY_BUYERS[1], 800000]];
  for (const [i, [party, amt]] of receipts.entries()) {
    const vDate = addDays("2026-10-03", i * 4);
    const narr = `RECEIVED FROM ${party}`;
    await gl("CR", i + 1, vDate, CASH, narr, [[CASH, amt, 0, narr], [codeOf[party], 0, amt, narr]], "CASH");
  }

  const totals = await out.execute("SELECT (SELECT COUNT(*) FROM int_daily_production), (SELECT COUNT(*) FROM int_daily_production_set), (SELECT COUNT(*) FROM trans_main), (SELECT ROUND(SUM(debit)-SUM(credit),2) FROM trans_detail), (SELECT COUNT(*) FROM chart_of_accounts)");
  console.log("production vouchers, thans, ledger vouchers, ledger imbalance, accounts:", totals.rows[0]);
  await out.execute("VACUUM");
  console.log("written", OUT, Math.round(fs.statSync(OUT).size / 1024), "KB");
}

import { eq } from "drizzle-orm";
const eqLoom = (id: number) => eq(schema.looms.id, id);
const eqSet = (id: number) => eq(schema.intDailyProductionSet.id, id);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
