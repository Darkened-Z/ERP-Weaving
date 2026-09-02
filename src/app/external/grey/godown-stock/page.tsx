import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { AutoFill, RowAutoFill } from "@/components/auto-fill";
import { ContractInfoPanel } from "@/components/contract-info-panel";
import { FindingPicker } from "@/components/finding-picker";
import { TermSelect } from "@/components/term-select";
import { ConfirmButton } from "@/components/confirm-button";
import { GodownCalc } from "@/components/godown-calc";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { today as pkToday } from "@/lib/time";
import { assertPeriodOpen } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

const intVal = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v as string, 10);
  return Number.isFinite(n) ? n : null;
};

const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

const today = () => pkToday();

const TYPE_OPTIONS = ["STOCK", "OTHERS"];
const STATUS_OPTIONS = ["", "OK", "REJ", "Y"];
const EL_METER_MODE_OPTIONS = ["", "1/5", "1/10"];

const COUNT_ROWS = 4;

export default async function GodownStockPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";

  const findFilter = params.find?.trim();
  const escFind = findFilter?.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = escFind ? `%${escFind}%` : "";

  const stocks = findFilter
    ? await db
        .select()
        .from(schema.extGodownStock)
        .where(sql`
          ${schema.extGodownStock.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extGodownStock.kpNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extGodownStock.purchaseParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extGodownStock.gdnParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extGodownStock.contactQuality} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extGodownStock.dspQuality} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.extGodownStock.id))
    : await db
        .select()
        .from(schema.extGodownStock)
        .orderBy(desc(schema.extGodownStock.id));

  const selected = isEditing ? stocks.find((s) => s.id === idParam) ?? null : null;
  const formStock = isAdding ? null : selected;

  const counts = formStock
    ? await db
        .select()
        .from(schema.extGodownStockCount)
        .where(eq(schema.extGodownStockCount.stockId, formStock.id))
        .orderBy(schema.extGodownStockCount.id)
    : [];

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);

  const partyAccounts = parties.filter((p) => p.level >= 5);
  const partyOpts = partyAccounts.map((p) => ({
    value: p.description,
    label: p.description, // show the party NAME only (the code sits in the CODE field); still searchable by code via `desc`
    desc: p.code,
  }));
  // Auto godown (fixed): the level-5 account under the "STOCK - GREY" head
  // (code 1.01.25.15 → "Godown - Grey Stock Treading"). All grey purchase stock &
  // sales are booked into this godown. Falls back to a description match if the head is renamed.
  const greyStockHead = parties.find((p) => p.level === 4 && /stock\s*-\s*grey/i.test(p.description));
  const godownParty =
    (greyStockHead ? partyAccounts.find((p) => p.code.startsWith(greyStockHead.code + "."))?.description : undefined) ??
    partyAccounts.find((p) => /godown/i.test(p.description) && /grey\s*stock/i.test(p.description))?.description ??
    partyAccounts.find((p) => /godown/i.test(p.description))?.description ??
    "";
  // Printing Name lists ONLY printing parties — the "CREDITORS - PRINTING" group
  // (level-5 accounts under the PRINTING head, e.g. BAHOO / RADO / IMTIAZ PRINT).
  const printingHead =
    parties.find((p) => p.level === 3 && /printing/i.test(p.description)) ??
    parties.find((p) => p.level < 5 && /printing/i.test(p.description));
  const printingOpts = printingHead
    ? partyAccounts
        .filter((p) => p.code.startsWith(printingHead.code + "."))
        .map((p) => ({ value: p.description, label: p.description, desc: p.code }))
    : partyOpts;
  const partyCodeByDesc = new Map(partyAccounts.map((p) => [p.description, p.code]));
  // Picking a party fills its account code live (Oracle: choose Amir → code 868 appears).
  const partyCodeFillMap: Record<string, Record<string, string>> = Object.fromEntries(
    partyAccounts.map((p) => [p.description, { party_code_display: p.code, gdn_code_display: p.code }])
  );

  const yarnCountList = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts)
    .where(eq(schema.yarnCounts.status, "A"))
    .orderBy(schema.yarnCounts.countCode);
  // Full count label = description + fibre type, e.g. count "2" → "30/S MVS PV 65;35".
  const countLabelByCode = new Map(
    yarnCountList.map((c) => [String(c.countCode), `${c.description ?? ""}${c.type ? ` ${c.type}` : ""}`.trim()])
  );
  const gsCountFillMap: Record<string, Record<string, string>> = {};
  for (const c of yarnCountList) {
    gsCountFillMap[String(c.countCode)] = { count_desc: countLabelByCode.get(String(c.countCode)) ?? "", count_type: c.type ?? "" };
  }
  const gsCountDescByCode = countLabelByCode;

  const convContracts = await db
    .select()
    .from(schema.extGreyConvContract)
    .orderBy(desc(schema.extGreyConvContract.id));
  const constructions = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description, width: schema.greyConstruction.width })
    .from(schema.greyConstruction);
  const qualityByCode: Record<string, string> = Object.fromEntries(
    constructions.map((c) => [c.code, c.description])
  );
  // The conv-contract table holds BOTH conversion (type CONV) and sale (type SALE)
  // contracts. CONV feeds the Pur Conv Contract picker; SALE joins the grey-sale
  // contracts in the Sal Cont pickers. Only running (status R) contracts are offered.
  const isRunning = (s: string | null | undefined) => (s ?? "R").toUpperCase() === "R";
  const convOnlyContracts = convContracts.filter((c) => (c.type ?? "CONV").toUpperCase() !== "SALE" && isRunning(c.status));
  const saleConvContracts = convContracts.filter((c) => (c.type ?? "").toUpperCase() === "SALE" && isRunning(c.status));
  // Full-page F9 finder rows for Cont# — the party's running contracts shown as a
  // rich Oracle-style LOV (date, party, quality, read×pick×width, qty, rate, status).
  const fmtN = (n: number | null | undefined, d = 0) =>
    n == null ? "" : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString("en-US");
  const contractColumns = [
    { key: "cont", label: "Cont #", width: 88 },
    { key: "desc", label: "Prd. Desc" },
    { key: "qty", label: "Qty Mtr", width: 84, align: "right" as const },
    { key: "convRate", label: "Conv Rate", width: 78, align: "right" as const },
    { key: "grayRate", label: "Gray Rate", width: 78, align: "right" as const },
    { key: "date", label: "Date", width: 86 },
    { key: "status", label: "St", width: 34 },
  ];
  const contractFindRows = convOnlyContracts.map((c) => {
    const prd = (c.grayQltyCode ? qualityByCode[c.grayQltyCode] : "") || c.grayCode || "";
    return {
      value: c.contNo,
      code: c.contNo,
      description: `${c.party ?? ""}${prd ? ` · ${prd}` : ""}`,
      filterKey: c.party ?? "",
      cells: {
        cont: c.contNo,
        desc: prd,
        qty: fmtN(c.qtyMtr),
        convRate: fmtN(c.convRatePerMtr, 2),
        grayRate: fmtN(c.grayRatePerMtr, 2),
        date: c.contDate ?? "",
        status: c.status ?? "",
      },
    };
  });
  const contractMap: Record<string, Record<string, string | number | null>> = Object.fromEntries(
    convContracts.map((c) => [
      c.contNo,
      {
        purchase_party: c.party ?? "",
        // Rate Purchase = the conversion contract's GREY rate (Oracle: 163.45), not the conv rate.
        rate: c.grayRatePerMtr ?? "",
        contact_quality: c.grayQltyCode ? qualityByCode[c.grayQltyCode] ?? "" : "",
        dsp_quality: c.grayQltyCode ? qualityByCode[c.grayQltyCode] ?? "" : "",
        _contact_quality_pick: c.grayQltyCode ?? "",
        _dsp_quality_pick: c.grayQltyCode ?? "",
      },
    ])
  );

  const purContracts = await db
    .select()
    .from(schema.extGreyPurContract)
    .orderBy(desc(schema.extGreyPurContract.id));
  const purMap: Record<string, Record<string, string | number | null>> = Object.fromEntries(
    purContracts.map((c) => [
      c.contractNo,
      {
        purchase_party: c.party ?? "",
        // Basic purchase rate comes from the grey PURCHASE contract → drives total/commission.
        rate: c.ratePerMtr,
        contact_quality: c.greyCode ? qualityByCode[c.greyCode] ?? "" : "",
        dsp_quality: c.greyCode ? qualityByCode[c.greyCode] ?? "" : "",
        _contact_quality_pick: c.greyCode ?? "",
        _dsp_quality_pick: c.greyCode ?? "",
      },
    ])
  );
  const salContracts = await db
    .select()
    .from(schema.extGreySalContract)
    .orderBy(desc(schema.extGreySalContract.id));
  // Sale-side contracts = grey-sale contracts + the SALE-type conv contracts. Picking
  // either flows its rate into the locked Rate Sal and the display box beside the picker.
  const salMap: Record<string, Record<string, string | number | null>> = Object.fromEntries([
    ...salContracts.map((c) => [
      c.contractNo,
      {
        grey_sale_rate_disp: c.ratePerMtr ?? "",
        grey_sale_cont: c.contractNo,
        _contact_quality_pick: c.greyCode ?? "",
        _dsp_quality_pick: c.greyCode ?? "",
      },
    ] as const),
    ...saleConvContracts.map((c) => [
      c.contNo,
      {
        grey_sale_rate_disp: c.grayRatePerMtr ?? "",
        grey_sale_cont: c.contNo,
        _contact_quality_pick: c.grayQltyCode ?? "",
        _dsp_quality_pick: c.grayQltyCode ?? "",
      },
    ] as const),
  ]);
  const salRateByNo = new Map<string, number | null>([
    ...salContracts.map((c) => [c.contractNo, c.ratePerMtr] as const),
    ...saleConvContracts.map((c) => [c.contNo, c.grayRatePerMtr] as const),
  ]);
  // Sal Cont # opens the grey CONVERSION contracts; picking one fills the sale rate from
  // its grey rate. (Grey Sale Cont opens the grey SALE contracts — different list.)
  const convRateByNo = new Map<string, number | null>(
    convOnlyContracts.map((c) => [c.contNo, c.grayRatePerMtr] as const)
  );
  const convSaleMap: Record<string, Record<string, string | number | null>> = Object.fromEntries(
    convOnlyContracts.map((c) => [
      c.contNo,
      { rate: c.grayRatePerMtr ?? "", sal_cont_rate_disp: c.grayRatePerMtr ?? "" },
    ])
  );

  // Full-page F9 finder rows for the grey PURCHASE / SALE contracts — rich
  // Oracle-style LOV columns (Prd. Desc, qty, rate, term, date, status).
  const greyPurColumns = [
    { key: "cont", label: "Cont #", width: 88 },
    { key: "desc", label: "Prd. Desc" },
    { key: "qty", label: "Qty", width: 84, align: "right" as const },
    { key: "rate", label: "Rate", width: 70, align: "right" as const },
    { key: "term", label: "Term", width: 70 },
    { key: "date", label: "Date", width: 86 },
    { key: "status", label: "St", width: 34 },
  ];
  const greySaleColumns = greyPurColumns;
  const purFindRows = purContracts.filter((c) => isRunning(c.status)).map((c) => {
    const prd = (c.greyCode ? qualityByCode[c.greyCode] : "") || c.greyCode || "";
    return {
      value: c.contractNo,
      code: c.contractNo,
      description: `${c.party ?? ""}${prd ? ` · ${prd}` : ""}`,
      filterKey: c.party ?? "",
      cells: {
        cont: c.contractNo,
        desc: prd,
        qty: fmtN(c.quantityMtr),
        rate: fmtN(c.ratePerMtr, 2),
        term: c.paymentTerm ?? "",
        date: c.contractDate ?? "",
        status: c.status ?? "",
      },
    };
  });
  const salFindRows = salContracts.map((c) => {
    const prd = (c.greyCode ? qualityByCode[c.greyCode] : "") || c.greyCode || "";
    return {
      value: c.contractNo,
      code: c.contractNo,
      description: `${c.party ?? ""}${prd ? ` · ${prd}` : ""}`,
      filterKey: c.party ?? "",
      cells: {
        cont: c.contractNo,
        desc: prd,
        qty: fmtN(c.quantityMtr),
        rate: fmtN(c.ratePerMtr, 2),
        term: c.paymentTerm ?? "",
        date: c.contractDate ?? "",
        status: c.status ?? "",
      },
    };
  });
  // SALE-type conv contracts, shaped for the sale-contract LOV, then merged with the
  // grey-sale contracts so both feed the Sal Cont # / Grey Sale Cont pickers.
  const saleConvFindRows = saleConvContracts.map((c) => {
    const prd = (c.grayQltyCode ? qualityByCode[c.grayQltyCode] : "") || c.grayCode || "";
    return {
      value: c.contNo,
      code: c.contNo,
      description: `${c.party ?? ""}${prd ? ` · ${prd}` : ""}`,
      filterKey: c.party ?? "",
      cells: {
        cont: c.contNo,
        desc: prd,
        qty: fmtN(c.qtyMtr),
        rate: fmtN(c.grayRatePerMtr, 2),
        term: "",
        date: c.contDate ?? "",
        status: c.status ?? "",
      },
    };
  });
  const saleAllFindRows = [...saleConvFindRows, ...salFindRows];

  const warpRows = await db
    .select()
    .from(schema.extGreyConvWarp)
    .orderBy(schema.extGreyConvWarp.contractId, schema.extGreyConvWarp.srNo);
  const weftRows = await db
    .select()
    .from(schema.extGreyConvWeft)
    .orderBy(schema.extGreyConvWeft.contractId, schema.extGreyConvWeft.srNo);
  const contNoById = new Map(convContracts.map((c) => [c.id, c.contNo]));
  type CountFill = {
    code: string | null;
    type: string;
    calCount: number | null;
    ends: number | null;
    ratePerLbs: number | null;
    wtPerMtr: number | null;
    costPerMtr: number | null;
  };
  const countMap: Record<string, CountFill[]> = {};
  const pushCount = (contractId: number, cType: string, r: typeof warpRows[number]) => {
    const key = contNoById.get(contractId);
    if (!key) return;
    (countMap[key] ??= []).push({
      code: r.count,
      type: cType,
      calCount: r.calCount,
      ends: r.ends,
      ratePerLbs: r.ratePerLbs,
      wtPerMtr: r.wtPerMtr,
      costPerMtr: r.costPerMtr,
    });
  };
  for (const w of warpRows) pushCount(w.contractId, "WARP", w);
  for (const w of weftRows) pushCount(w.contractId, "WEFT", w);

  // Quality shown when a contract is picked = full construction detail (Oracle-style):
  // construction desc · read×pick×width · warp/weft counts — not a bare quality code.
  for (const c of convContracts) {
    const desc = c.grayQltyCode ? qualityByCode[c.grayQltyCode] ?? c.grayQltyCode : c.grayCode ?? "";
    const rpw =
      c.read != null && c.pick != null
        ? ` ${fmtN(c.read)}×${fmtN(c.pick)}${c.width != null ? `×${fmtN(c.width)}` : ""}`
        : "";
    const cnts = countMap[c.contNo] ?? [];
    const warp = cnts.filter((x) => x.type === "WARP").map((x) => x.code).filter(Boolean).join(",");
    const weft = cnts.filter((x) => x.type === "WEFT").map((x) => x.code).filter(Boolean).join(",");
    const wf = warp || weft ? ` [W:${warp || "-"} F:${weft || "-"}]` : "";
    const rich = `${desc}${rpw}${wf}`.trim();
    if (contractMap[c.contNo] && rich) {
      contractMap[c.contNo].contact_quality = rich;
      contractMap[c.contNo].dsp_quality = rich;
    }
  }

  // Full detail of each conversion contract, for the side info panel (updates on pick).
  const contractInfoMap: Record<string, { label: string; value: string }[]> = {};
  for (const c of convContracts) {
    const constr = c.grayQltyCode ? qualityByCode[c.grayQltyCode] ?? c.grayQltyCode : c.grayCode ?? "";
    const cnts = countMap[c.contNo] ?? [];
    // Show each warp/weft count with its full description (Oracle: "2" → "2 — 30/S MVS PV 65;35").
    const lbl = (code: string | null) => {
      if (!code) return "";
      const l = countLabelByCode.get(String(code));
      return l ? `${code} — ${l}` : String(code);
    };
    const warp = cnts.filter((x) => x.type === "WARP").map((x) => lbl(x.code)).filter(Boolean).join(", ");
    const weft = cnts.filter((x) => x.type === "WEFT").map((x) => lbl(x.code)).filter(Boolean).join(", ");
    const rpw =
      c.read != null && c.pick != null
        ? `${fmtN(c.read)}×${fmtN(c.pick)}${c.width != null ? `×${fmtN(c.width)}` : ""}`
        : "";
    contractInfoMap[c.contNo] = [
      { label: "Party", value: c.party ?? "" },
      { label: "Quality", value: constr },
      { label: "Read×Pick×Wd", value: rpw },
      { label: "Warp", value: warp },
      { label: "Weft", value: weft },
      { label: "Conv Rate", value: fmtN(c.convRatePerMtr, 2) },
      { label: "Gray Rate", value: fmtN(c.grayRatePerMtr, 2) },
      { label: "Qty Mtr", value: fmtN(c.qtyMtr) },
      { label: "Date", value: c.contDate ?? "" },
      { label: "Status", value: c.status ?? "" },
    ];
  }

  const nextVNoVal = await db
    .select({
      m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extGodownStock.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.extGodownStock);
  const upcomingVNo = "GDN-" + String((nextVNoVal[0]?.m ?? 0) + 1).padStart(4, "0");
  const upcomingKpNo = String((nextVNoVal[0]?.m ?? 0) + 1);
  const upcomingLvNo = stocks.reduce((m, s) => Math.max(m, s.lvNo ?? 0), 0);

  const lastLvRow = await db
    .select({ m: sql<number>`coalesce(max(${schema.extGodownStock.lvNo}), 0)` })
    .from(schema.extGodownStock);
  const lastLvNo = lastLvRow[0]?.m ?? 0;

  async function saveStock(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const vDate = ((formData.get("v_date") as string) || "").trim() || today();
    const kpNo = txt(formData.get("kp_no"));
    const type = txt(formData.get("type")) ?? "STOCK";
    const purchaseParty = txt(formData.get("purchase_party"));
    const gdnParty = txt(formData.get("gdn_party"));
    const contNo = txt(formData.get("cont_no"));
    const purContNo = txt(formData.get("pur_cont_no"));
    const contactQuality = txt(formData.get("contact_quality"));
    const dspQuality = txt(formData.get("dsp_quality"));
    const than = intVal(formData.get("than"));
    const meter = num(formData.get("meter"));
    const elCumiNum = intVal(formData.get("el_cumi_num"));
    const elCumiDen = intVal(formData.get("el_cumi_den"));
    const kamiMtr = num(formData.get("kami_mtr"));
    const rateConversion = num(formData.get("rate_conversion"));
    const term = txt(formData.get("term"));
    const dueDate = term === "DUE" ? txt(formData.get("due_date")) : null;
    const days = intVal(formData.get("days"));
    const rateSal = num(formData.get("rate_sal"));
    const salContNo = txt(formData.get("sal_cont_no"));
    const greySaleCont = txt(formData.get("grey_sale_cont"));
    const kaatPercent = num(formData.get("kaat_percent"));
    const elMeterMode = txt(formData.get("el_meter_mode"));
    const checkery = num(formData.get("checkery"));
    const commission = num(formData.get("commission"));
    const printingName = txt(formData.get("printing_name"));
    const brokerName = txt(formData.get("broker_name"));
    const remarks = txt(formData.get("remarks"));
    const imgHash = txt(formData.get("img_hash"));
    const convGreyType = txt(formData.get("conv_grey_type"));
    const rate = num(formData.get("rate"));
    const salAvgRate = num(formData.get("sal_avg_rate"));

    if (!than || !meter) {
      redirect(`/external/grey/godown-stock?error=qty_required`);
    }

    const meterVal = meter ?? 0;
    const elMeter = Math.round(
      (meterVal * (elCumiNum ?? 0)) / ((elCumiDen ?? 0) === 5 ? 400 : 800)
    );
    const netMeter = meterVal - elMeter - (kamiMtr ?? 0);
    const rateVal = rate ?? 0;
    const kaatAmt = Math.round((netMeter / 40) * (kaatPercent ?? 0));
    const checkeryAmt = Math.round(netMeter * (checkery ?? 0));
    const commissionAmt = Math.round((netMeter * rateVal * (commission ?? 0)) / 100);
    const total = Math.round(netMeter * rateVal);
    const balance = total - (kaatAmt + checkeryAmt + commissionAmt);
    // Persist profit (sale rate − cost rate) so reports can read it directly. cost=rate, sale=rate_sal.
    const saleRateVal = rateSal ?? 0;
    const hasBothRates = saleRateVal > 0 && rateVal > 0;
    const profitPerMtr = hasBothRates ? Math.round((saleRateVal - rateVal) * 100) / 100 : null;
    const profitAmt = hasBothRates ? Math.round(netMeter * (saleRateVal - rateVal)) : null;

    const lineThans = formData.getAll("line_than") as string[];
    const lineMtrs = formData.getAll("line_mtr") as string[];
    const lineStatuses = formData.getAll("line_status") as string[];

    const validLines: {
      srNo: number;
      than: number | null;
      mtr: number | null;
      status: string | null;
    }[] = [];

    const lineCount = Math.max(lineThans.length, lineMtrs.length, lineStatuses.length);
    let srCounter = 0;
    for (let i = 0; i < lineCount; i++) {
      const t = intVal(lineThans[i]);
      const m = num(lineMtrs[i]);
      const s = (lineStatuses[i] || "").trim();
      if (t === null && m === null && !s) continue;
      srCounter++;
      validLines.push({ srNo: srCounter, than: t, mtr: m, status: s || null });
    }

    const cCodes = formData.getAll("count_code") as string[];
    const cTypes = formData.getAll("count_type") as string[];
    const cCals = formData.getAll("count_cal_count") as string[];
    const cEnds = formData.getAll("count_ends") as string[];
    const cRates = formData.getAll("count_rate_per_lbs") as string[];
    const cWts = formData.getAll("count_wt_per_mtr") as string[];
    const cCosts = formData.getAll("count_cost_per_mtr") as string[];
    const cTots = formData.getAll("count_tot_lbs") as string[];

    const validCounts: {
      code: string | null;
      type: string | null;
      calCount: number | null;
      ends: number | null;
      ratePerLbs: number | null;
      wtPerMtr: number | null;
      costPerMtr: number | null;
      totLbs: number | null;
    }[] = [];

    const cntRows = Math.max(
      cCodes.length, cTypes.length, cCals.length, cEnds.length,
      cRates.length, cWts.length, cCosts.length, cTots.length
    );
    for (let i = 0; i < cntRows; i++) {
      const code = (cCodes[i] || "").trim();
      const cType = (cTypes[i] || "").trim();
      const cal = num(cCals[i]);
      const e = intVal(cEnds[i]);
      const r = num(cRates[i]);
      const w = num(cWts[i]);
      const co = num(cCosts[i]);
      const tot = num(cTots[i]);
      if (!code && !cType && cal === null && e === null && r === null && w === null && co === null && tot === null) continue;
      validCounts.push({
        code: code || null,
        type: cType || null,
        calCount: cal,
        ends: e,
        ratePerLbs: r,
        wtPerMtr: w,
        costPerMtr: co,
        totLbs: tot,
      });
    }

    const nowIso = new Date().toISOString();

    try {
      await assertPeriodOpen(vDate, "INVENTORY");

    if (Number.isFinite(id) && id > 0) {
      const existingLines = await db
        .select()
        .from(schema.extGodownStockLine)
        .where(eq(schema.extGodownStockLine.stockId, id))
        .orderBy(schema.extGodownStockLine.srNo);
      const existingBySr = new Map(existingLines.map((l) => [l.srNo, l]));

      const consumedRemovedSr: number[] = [];
      for (const old of existingLines) {
        const match = validLines.find((v) => v.srNo === old.srNo);
        if (!match && old.status === "Y") consumedRemovedSr.push(old.srNo ?? 0);
      }
      if (consumedRemovedSr.length) {
        redirect(`/external/grey/godown-stock?id=${id}&error=cant_remove_consumed_line`);
      }

      await db.transaction(async (tx) => {
        await tx
          .update(schema.extGodownStock)
          .set({
            vDate, kpNo, type, purchaseParty, gdnParty, contNo, purContNo, contactQuality, dspQuality,
            than, meter, elCumiNum, elCumiDen, kamiMtr, rateConversion, term, dueDate, days, rateSal, salContNo,
            greySaleCont, kaatPercent, elMeter, elMeterMode, netMeter, checkery, commission, total, balance,
            profitPerMtr, profitAmt,
            printingName, brokerName, remarks, imgHash, convGreyType, rate, salAvgRate,
            modifiedDate: nowIso,
          })
          .where(eq(schema.extGodownStock.id, id));

        await tx.delete(schema.extGodownStockCount).where(eq(schema.extGodownStockCount.stockId, id));

        const seenSr = new Set<number>();
        for (const line of validLines) {
          seenSr.add(line.srNo);
          const prev = existingBySr.get(line.srNo);
          if (prev) {
            await tx
              .update(schema.extGodownStockLine)
              .set({
                than: line.than,
                mtr: line.mtr,
                status: prev.status ?? line.status,
              })
              .where(eq(schema.extGodownStockLine.id, prev.id));
          } else {
            await tx.insert(schema.extGodownStockLine).values({ ...line, stockId: id });
          }
        }
        for (const old of existingLines) {
          if (!seenSr.has(old.srNo ?? -1) && old.status !== "Y") {
            await tx.delete(schema.extGodownStockLine).where(eq(schema.extGodownStockLine.id, old.id));
          }
        }
        if (validCounts.length) {
          await tx.insert(schema.extGodownStockCount).values(validCounts.map((c) => ({ ...c, stockId: id })));
        }
      });

      revalidatePath("/external/grey/godown-stock");
      redirect(`/external/grey/godown-stock?id=${id}`);
    } else {
      let newId = 0;
      let codeExists = false;
      try {
        newId = await db.transaction(async (tx) => {
          const existingRows = await tx
            .select({
              m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extGodownStock.vNo}, 5) AS INTEGER)), 0)`,
            })
            .from(schema.extGodownStock);
          const maxN = existingRows[0]?.m ?? 0;
          const vNo = "GDN-" + String(maxN + 1).padStart(4, "0");
          const lvRow = await tx
            .select({ m: sql<number>`coalesce(max(${schema.extGodownStock.lvNo}), 0)` })
            .from(schema.extGodownStock);
          const nextL = (lvRow[0]?.m ?? 0) + 1;

          const inserted = await tx
            .insert(schema.extGodownStock)
            .values({
              vNo, lvNo: nextL, vDate, kpNo, type, purchaseParty, gdnParty, contNo, purContNo,
              contactQuality, dspQuality, than, meter, elCumiNum, elCumiDen, kamiMtr, rateConversion,
              term, dueDate, days, rateSal, salContNo, greySaleCont, kaatPercent, elMeter, elMeterMode, netMeter,
              checkery, commission, total, balance, profitPerMtr, profitAmt, printingName, brokerName, remarks, imgHash,
              convGreyType, rate, salAvgRate, postedDate: nowIso,
            })
            .returning({ id: schema.extGodownStock.id });
          const insertedId = inserted[0].id;

          if (validLines.length) {
            await tx.insert(schema.extGodownStockLine).values(validLines.map((l) => ({ ...l, stockId: insertedId })));
          }
          if (validCounts.length) {
            await tx.insert(schema.extGodownStockCount).values(validCounts.map((c) => ({ ...c, stockId: insertedId })));
          }
          return insertedId;
        });
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message ?? "";
        if (/UNIQUE|constraint/i.test(msg)) {
          codeExists = true;
        } else {
          throw e;
        }
      }

      if (codeExists) {
        redirect(`/external/grey/godown-stock?error=code_exists`);
      }

      revalidatePath("/external/grey/godown-stock");
      redirect(`/external/grey/godown-stock?id=${newId}`);
    }
    } catch (e: unknown) {
      const digest = (e as { digest?: string })?.digest ?? "";
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw e;
      const msg = (e as { message?: string })?.message ?? "";
      const m = /Period locked through (\d{4}-\d{2}-\d{2})/.exec(msg);
      if (m) {
        redirect(`/external/grey/godown-stock?error=period_locked&thru=${m[1]}`);
      }
      throw e;
    }
  }

  async function deleteStock(formData: FormData) {
    "use server";
    const s = await getSession();
    if (s?.roleName !== "ADMIN") redirect("/external/grey/godown-stock?error=admin_only");
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;

    const lineRows = await db
      .select({ status: schema.extGodownStockLine.status })
      .from(schema.extGodownStockLine)
      .where(eq(schema.extGodownStockLine.stockId, id));
    if (lineRows.some((r) => r.status === "Y")) {
      redirect(`/external/grey/godown-stock?id=${id}&error=in_use`);
    }

    await db.transaction(async (tx) => {
      await tx.delete(schema.extGodownStockCount).where(eq(schema.extGodownStockCount.stockId, id));
      await tx.delete(schema.extGodownStockLine).where(eq(schema.extGodownStockLine.stockId, id));
      await tx.delete(schema.extGodownStock).where(eq(schema.extGodownStock.id, id));
    });
    revalidatePath("/external/grey/godown-stock");
    redirect("/external/grey/godown-stock");
  }

  async function setStatusOk(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    await db
      .update(schema.extGodownStock)
      .set({ statusOk: "OK" })
      .where(eq(schema.extGodownStock.id, id));
    revalidatePath("/external/grey/godown-stock");
    redirect(`/external/grey/godown-stock?id=${id}`);
  }

  async function clearStatusOk(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    await db
      .update(schema.extGodownStock)
      .set({ statusOk: null })
      .where(eq(schema.extGodownStock.id, id));
    revalidatePath("/external/grey/godown-stock");
    redirect(`/external/grey/godown-stock?id=${id}`);
  }

  const countGridRows: (typeof counts[number] | null)[] = Array.from(
    { length: Math.max(COUNT_ROWS, counts.length) },
    (_, i) => counts[i] ?? null
  );

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const roCls = "input-box mono bg-gray-100";
  const gridCellCls = "input-box mono text-[13px] py-1";
  const gridCellNumCls = "input-box mono text-[13px] py-1 text-right";

  const excelRows = stocks.map((s) => ({
    vNo: s.vNo,
    vDate: s.vDate,
    kpNo: s.kpNo,
    purchaseParty: s.purchaseParty,
    gdnParty: s.gdnParty,
    meter: s.meter,
    netMeter: s.netMeter,
    total: s.total,
    type: s.type,
  }));

  return (
    <Shell active="ext-godown">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">GODOWN STOCK</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {stocks.length} entr{stocks.length === 1 ? "y" : "ies"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={excelRows}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "V.Date" },
              { key: "kpNo", label: "KP No" },
              { key: "purchaseParty", label: "Purchase Party" },
              { key: "gdnParty", label: "Gdn Party" },
              { key: "meter", label: "Meter" },
              { key: "netMeter", label: "Net Meter" },
              { key: "total", label: "Total" },
              { key: "type", label: "Status" },
            ]}
            filename="godown-stock"
            sheetName="GodownStock"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            V.No already exists. Try again.
          </div>
        )}
        {params.error === "qty_required" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Than and Meter are required.
          </div>
        )}
        {params.error === "in_use" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Cannot delete: one or more lines are consumed by a Kachi Parchi.
          </div>
        )}
        {params.error === "cant_remove_consumed_line" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Cannot remove a line that is already consumed by a Kachi Parchi.
          </div>
        )}
        {params.error === "period_locked" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Period locked through {params.thru ?? "?"}. Nothing was saved.
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can delete records.
          </div>
        )}

        <form id="gdn-find-form" method="GET" action="/external/grey/godown-stock" className="hidden"></form>

        <div className="grid grid-cols-1 gap-4 mb-3">
          <div>
            <div className="border border-black p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding
                    ? "New — GODOWN STOCK"
                    : formStock
                    ? `Edit — ${formStock.vNo}`
                    : "GODOWN STOCK"}
                </div>
                <div className="flex gap-2 no-print flex-wrap">
                  <a href="/external/grey/godown-stock?adding=1" className="btn btn-outline btn-sm">
                    New
                  </a>
                  <button type="submit" form="gdn-save-form" className="btn btn-sm">
                    Save
                  </button>
                  <PrintButton label="Print" />
                  <a href="/external/grey/godown-stock" className="btn btn-outline btn-sm">
                    Exit
                  </a>
                  <div>
                    <label className="label block mb-1">Alt-S Password</label>
                    <input className="input-box mono" placeholder="password" type="password" style={{ maxWidth: 130 }} />
                  </div>
                  {formStock ? (
                    <form action={deleteStock} className="inline">
                      <input type="hidden" name="id" value={formStock.id} />
                      <ConfirmButton>Delete</ConfirmButton>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled
                      title="Save the stock entry first to enable delete"
                      style={{ opacity: 0.5, cursor: "not-allowed" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <form id="gdn-save-form" action={saveStock}>
                {formStock && <input type="hidden" name="id" value={formStock.id} />}

                <div className="grid grid-cols-12 gap-x-2 gap-y-2 gform">
                  <div className="col-span-2">
                    <label className="label block mb-1">V. Date</label>
                    <input
                      name="v_date"
                      type="date"
                      className="input-box mono"
                      defaultValue={formStock?.vDate ?? today()}
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">KP No</label>
                    <input name="kp_no" className="input-box mono" defaultValue={formStock?.kpNo ?? (isAdding ? upcomingKpNo : "")} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Type</label>
                    <select name="type" className="input-box mono" defaultValue={formStock?.type ?? "STOCK"}>
                      {TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">V.No</label>
                    <input className={roCls} defaultValue={formStock?.vNo ?? upcomingVNo} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-1 flex items-end">
                    <span className="mono text-[11px] text-[var(--muted)] pb-2">F-9</span>
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Find</label>
                    <div className="flex gap-2">
                      <input
                        form="gdn-find-form"
                        name="find"
                        className="input-box mono flex-1"
                        defaultValue={params.find ?? ""}
                        placeholder="v.no / kp / party / quality"
                      />
                      <button form="gdn-find-form" type="submit" className="btn btn-outline btn-sm">
                        Find
                      </button>
                    </div>
                  </div>

                  <div className="col-span-1">
                    <label className="label block mb-1">Code</label>
                    <input name="party_code_display" className={roCls} defaultValue={partyCodeByDesc.get(formStock?.purchaseParty ?? "") ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-4">
                    <label className="label block mb-1">Purchase Party</label>
                    <Combobox
                      name="purchase_party"
                      options={partyOpts}
                      defaultValue={formStock?.purchaseParty ?? ""}
                      placeholder="Select party…"
                    />
                    <AutoFill watch="purchase_party" map={partyCodeFillMap} inputs={["party_code_display"]} />
                  </div>
                  <div className="col-span-2 flex flex-col items-stretch">
                    <label className="label block mb-1">
                      Status{" "}
                      <span
                        className={`mono text-[10px] px-1 ${
                          formStock?.statusOk === "OK"
                            ? "bg-green-100 border border-green-600 text-green-700"
                            : "text-[var(--muted)]"
                        }`}
                      >
                        {formStock?.statusOk ?? "—"}
                      </span>
                    </label>
                    <button
                      formAction={clearStatusOk}
                      className="btn btn-outline btn-sm w-full"
                      disabled={!formStock}
                    >
                      Clear-OK
                    </button>
                  </div>
                  <div className="col-span-5">
                    <label className="label block mb-1">Pending Finance No</label>
                    <input className={roCls} defaultValue={formStock?.pendingFinance ?? ""} readOnly tabIndex={-1} />
                  </div>

                  <div className="col-span-2">
                    <label className="label block mb-1">Gdn Code</label>
                    <input name="gdn_code_display" className={roCls} defaultValue={partyCodeByDesc.get(formStock?.gdnParty ?? godownParty) ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-10">
                    <label className="label block mb-1">Gdn Party <span className="text-[9px] text-[var(--muted)]">(grey-stock godown — locked)</span></label>
                    <input className={roCls} defaultValue={formStock?.gdnParty || godownParty} readOnly tabIndex={-1} />
                    <input type="hidden" name="gdn_party" defaultValue={formStock?.gdnParty || godownParty} />
                  </div>

                  <div className="col-span-6">
                    <label className="label block mb-1">Pur Conv Contract <span className="text-[9px] text-[var(--muted)]">(F9 — all running conv contracts)</span></label>
                    <FindingPicker
                      name="cont_no"
                      defaultValue={formStock?.contNo ?? ""}
                      rows={contractFindRows}
                      columns={contractColumns}
                      title="CONVERSION CONTRACT LIST"
                      placeholder="Contract #…"
                      className="input-box mono text-[13px] cursor-pointer"
                    />
                    <AutoFill
                      watch="cont_no"
                      map={contractMap}
                      combos={["purchase_party"]}
                      inputs={["rate", "contact_quality", "dsp_quality"]}
                    />
                  </div>
                  <div className="col-span-6">
                    <label className="label block mb-1">Pur Grey Contract <span className="text-[9px] text-[var(--muted)]">(F9 — all running grey contracts)</span></label>
                    <FindingPicker
                      name="pur_cont_no"
                      defaultValue={formStock?.purContNo ?? ""}
                      rows={purFindRows}
                      columns={greyPurColumns}
                      title="GREY PURCHASE CONTRACT LIST"
                      placeholder="Pur contract #…"
                      className="input-box mono text-[13px] cursor-pointer"
                    />
                    <AutoFill
                      watch="pur_cont_no"
                      map={purMap}
                      combos={["purchase_party"]}
                      inputs={["contact_quality", "rate"]}
                    />
                  </div>

                  <div className="col-span-12">
                    <label className="label block mb-1">
                      Quality{" "}
                      <span className="text-[9px] text-[var(--muted)]">(construction · read×pick×width · warp/weft — auto from contract)</span>
                    </label>
                    <input name="contact_quality" className="input-box mono w-full" defaultValue={formStock?.contactQuality ?? ""} readOnly tabIndex={-1} style={{ background: "#f3f4f6" }} />
                    {/* Despatch quality mirrors the contract quality; kept as a hidden field so the record still stores it. */}
                    <input type="hidden" name="dsp_quality" defaultValue={formStock?.dspQuality ?? formStock?.contactQuality ?? ""} />
                  </div>

                  <div className="col-span-12">
                    <ContractInfoPanel watch="cont_no" map={contractInfoMap} title="PUR CONV CONTRACT — INFO" />
                  </div>

                  {/* Measurements — one dense row */}
                  <div className="col-span-2">
                    <label className="label block mb-1">Than</label>
                    <input name="than" type="number" step="1" className="input-box mono text-right" defaultValue={formStock?.than ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Meter</label>
                    <input name="meter" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.meter ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">EL-Cumi</label>
                    <div className="flex items-center gap-1">
                      <input name="el_cumi_num" type="number" step="1" className="input-box mono text-right" defaultValue={formStock?.elCumiNum ?? ""} />
                      <span className="mono">/</span>
                      <input name="el_cumi_den" type="number" step="1" className="input-box mono text-right" defaultValue={formStock?.elCumiDen ?? ""} />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Kami Mtr</label>
                    <input name="kami_mtr" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.kamiMtr ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">EL-Meter</label>
                    <input name="el_meter" type="number" step="any" className={roCls + " text-right"} defaultValue={formStock?.elMeter ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Net Meter</label>
                    <input name="net_meter_display" type="number" step="any" className={roCls + " text-right"} defaultValue={formStock?.netMeter ?? ""} readOnly tabIndex={-1} />
                  </div>

                  {/* Rate / term row — purchase rate editable, sale rate fixed, total below the rate */}
                  <div className="col-span-2">
                    <label className="label block mb-1">(1/5 or 1/10)</label>
                    <select name="el_meter_mode" className="input-box mono" defaultValue={formStock?.elMeterMode ?? ""}>
                      {EL_METER_MODE_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m || "—"}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Rate Purchase <span className="text-[9px] text-[var(--muted)]">(grey rate — from contract)</span></label>
                    <input name="rate" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.rate ?? ""} />
                  </div>
                  <TermSelect
                    defaultTerm={formStock?.term ?? "CASH"}
                    defaultDate={formStock?.dueDate ?? ""}
                    defaultDays={formStock?.days ?? ""}
                  />
                  {/* Rate Sale removed from the UI; kept hidden so the sale rate still saves (set from the Grey Sale Cont rate). */}
                  <input type="hidden" name="rate_sal" defaultValue={formStock?.rateSal ?? ""} />
                  <div className="col-span-3">
                    <label className="label block mb-1">Total <span className="text-[9px] text-[var(--muted)]">(net mtr × purchase)</span></label>
                    <input name="total_display" type="number" step="any" className={roCls + " text-right"} defaultValue={formStock?.total ?? ""} readOnly tabIndex={-1} />
                  </div>

                  {/* Two different contract lists: Conv Cont # → conversion contracts,
                      Grey Sale Cont → sale contracts. Each shows its rate beside it. */}
                  <div className="col-span-4">
                    <label className="label block mb-1">Conv Cont # <span className="text-[9px] text-[var(--muted)]">(conversion contracts)</span></label>
                    <FindingPicker
                      name="sal_cont_no"
                      defaultValue={formStock?.salContNo ?? ""}
                      rows={contractFindRows}
                      columns={contractColumns}
                      title="GREY CONVERSION CONTRACT LIST"
                      placeholder="Conv contract #…"
                      className="input-box mono text-[13px] cursor-pointer"
                    />
                    <AutoFill
                      watch="sal_cont_no"
                      map={convSaleMap}
                      inputs={["sal_cont_rate_disp", "rate"]}
                    />
                    <RowAutoFill watch="count_code" map={gsCountFillMap} />
                    <datalist id="gs-yarn-counts">
                      {yarnCountList.map((c) => (
                        <option key={c.countCode} value={c.countCode}>{c.countCode} — {c.description}{c.type ? ` ${c.type}` : ""}</option>
                      ))}
                    </datalist>
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Conv Rate</label>
                    <input name="sal_cont_rate_disp" type="number" step="any" className={roCls + " text-right"} defaultValue={convRateByNo.get(formStock?.salContNo ?? "") ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-4">
                    <label className="label block mb-1">Grey Sale Cont</label>
                    <FindingPicker
                      name="grey_sale_cont"
                      defaultValue={formStock?.greySaleCont ?? ""}
                      rows={saleAllFindRows}
                      columns={greySaleColumns}
                      title="SALE CONTRACT LIST (conv-sale + grey-sale)"
                      placeholder="Grey sale contract #…"
                      className="input-box mono text-[13px] cursor-pointer"
                    />
                    <AutoFill
                      watch="grey_sale_cont"
                      map={salMap}
                      inputs={["grey_sale_rate_disp"]}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Rate</label>
                    <input name="grey_sale_rate_disp" type="number" step="any" className={roCls + " text-right"} defaultValue={salRateByNo.get(formStock?.greySaleCont ?? "") ?? ""} readOnly tabIndex={-1} />
                  </div>

                  {/* Charges paired with their amounts — full row, no gaps */}
                  <div className="col-span-2">
                    <label className="label block mb-1">Kaat %</label>
                    <input name="kaat_percent" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.kaatPercent ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Kaat Amt</label>
                    <input name="kaat_amt_disp" type="number" step="any" className={roCls + " text-right"} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Checkery</label>
                    <input name="checkery" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.checkery ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Checkery Amt</label>
                    <input name="checkery_amt_disp" type="number" step="any" className={roCls + " text-right"} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Commission</label>
                    <input name="commission" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.commission ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Commission Amt</label>
                    <input name="commission_amt_disp" type="number" step="any" className={roCls + " text-right"} readOnly tabIndex={-1} />
                  </div>

                  {/* Net Balance = Total − Kaat − Checkery − Commission */}
                  <div className="col-span-3">
                    <label className="label block mb-1">Net Balance <span className="text-[9px] text-[var(--muted)]">(total − kaat/checkery/comm)</span></label>
                    <input name="balance_display" type="number" step="any" className={roCls + " text-right font-bold"} defaultValue={formStock?.balance ?? ""} readOnly tabIndex={-1} />
                  </div>

                  <div className="col-span-12">
                    <div className="border border-black bg-blue-50 p-2 inline-flex items-end gap-4">
                      <div>
                        <label className="label block mb-1">Cost Rate <span className="text-[9px] text-[var(--muted)]">(purchase)</span></label>
                        <input name="cost_rate_disp" type="number" step="any" className={roCls + " text-right"} readOnly tabIndex={-1} defaultValue={formStock?.rate ?? ""} style={{ maxWidth: 110 }} />
                      </div>
                      <div className="text-[var(--muted)] pb-2">→</div>
                      <div>
                        <label className="label block mb-1">Sale Rate</label>
                        <input name="sale_rate_disp" type="number" step="any" className={roCls + " text-right"} readOnly tabIndex={-1} defaultValue={formStock?.rateSal ?? ""} style={{ maxWidth: 110 }} />
                      </div>
                      <div>
                        <label className="label block mb-1">Profit / Mtr</label>
                        <input name="profit_rate_disp" type="number" step="any" className={roCls + " text-right"} defaultValue={formStock?.profitPerMtr ?? ""} readOnly tabIndex={-1} style={{ maxWidth: 110 }} />
                      </div>
                      <div>
                        <label className="label block mb-1">Profit Amt</label>
                        <input name="profit_amt_disp" type="number" step="any" className={roCls + " text-right font-bold text-[13px]"} defaultValue={formStock?.profitAmt ?? ""} readOnly tabIndex={-1} style={{ maxWidth: 150 }} />
                      </div>
                    </div>
                  </div>

                  <div className="col-span-6">
                    <label className="label block mb-1">Printing Name <span className="text-[9px] text-[var(--muted)]">(printing parties)</span></label>
                    <Combobox
                      name="printing_name"
                      options={printingOpts}
                      defaultValue={formStock?.printingName ?? ""}
                      placeholder="Select printing party…"
                    />
                  </div>
                  <div className="col-span-6">
                    <label className="label block mb-1">Broker Name</label>
                    <Combobox
                      name="broker_name"
                      options={partyOpts}
                      defaultValue={formStock?.brokerName ?? ""}
                      placeholder="Broker or free text…"
                    />
                  </div>

                  <div className="col-span-12">
                    <label className="label block mb-1">Remarks</label>
                    <input name="remarks" className="input-box" defaultValue={formStock?.remarks ?? ""} />
                  </div>

                  <div className="col-span-12">
                    <label className="label block mb-1">Img #</label>
                    <input name="img_hash" className="input-box mono" defaultValue={formStock?.imgHash ?? ""} />
                  </div>

                  <div className="col-span-3 flex items-end">
                    <button
                      formAction={setStatusOk}
                      className="btn btn-outline btn-sm w-full"
                      disabled={!formStock}
                    >
                      OK
                    </button>
                  </div>

                  <div className="col-span-3">
                    <label className="label block mb-1">LV.No</label>
                    <input className={roCls + " text-center"} defaultValue={formStock?.lvNo ?? upcomingLvNo} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Posted</label>
                    <input className={roCls + " text-[12px]"} defaultValue={formStock?.postedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Modified</label>
                    <input className={roCls + " text-[12px]"} defaultValue={formStock?.modifiedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div className="col-span-3 flex items-end">
                    <div className="mono text-[11px] text-[var(--muted)]">Read-only meta</div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                    Update Count ({COUNT_ROWS} rows)
                  </div>
                  <div className="overflow-x-auto border border-black">
                    <table className="w-full text-[13px]" style={{ minWidth: "1000px" }}>
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-1 py-1 border-b border-black" style={{ width: 28 }}>#</th>
                          <th className="px-1 py-1 border-b border-black">Code</th>
                          <th className="px-1 py-1 border-b border-black">Count Desc</th>
                          <th className="px-1 py-1 border-b border-black">Type</th>
                          <th className="px-1 py-1 border-b border-black text-right">Cal Count</th>
                          <th className="px-1 py-1 border-b border-black text-right">Ends</th>
                          <th className="px-1 py-1 border-b border-black text-right">Rate Per Lbs</th>
                          <th className="px-1 py-1 border-b border-black text-right">WT Per Mtr</th>
                          <th className="px-1 py-1 border-b border-black text-right">Cost Per Mtr</th>
                          <th className="px-1 py-1 border-b border-black text-right">TOT Lbs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {countGridRows.map((r, i) => (
                          <tr key={r?.id ?? `c-${i}`}>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-center">{i + 1}</td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_code" list="gs-yarn-counts" className={gridCellCls} defaultValue={r?.code ?? ""} style={{ width: 60 }} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_desc" className={gridCellCls} defaultValue={r?.code ? (gsCountDescByCode.get(String(r.code)) ?? "") : ""} readOnly tabIndex={-1} style={{ minWidth: 140, background: "#f3f4f6" }} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_type" className={gridCellCls} defaultValue={r?.type ?? ""} style={{ width: 80 }} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_cal_count" type="number" step="any" className={gridCellNumCls} defaultValue={r?.calCount ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_ends" type="number" step="1" className={gridCellNumCls} defaultValue={r?.ends ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_rate_per_lbs" type="number" step="any" className={gridCellNumCls} defaultValue={r?.ratePerLbs ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_wt_per_mtr" type="number" step="any" className={gridCellNumCls} defaultValue={r?.wtPerMtr ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_cost_per_mtr" type="number" step="any" className={gridCellNumCls} defaultValue={r?.costPerMtr ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_tot_lbs" type="number" step="any" className={gridCellNumCls} defaultValue={r?.totLbs ?? ""} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="text-[10px] text-[var(--muted)] mt-2">
                    Empty rows are ignored on save.
                  </div>
                </div>

                <GodownCalc godownParty={godownParty} countMap={countMap} countLabel={Object.fromEntries(countLabelByCode)} />
              </form>
            </div>
          </div>

        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold flex items-center justify-between">
            <span>All Godown Stock Entries</span>
            {findFilter && (
              <a href="/external/grey/godown-stock" className="btn btn-outline btn-sm">Clear Search</a>
            )}
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>V.Date</th>
                  <th>KP No</th>
                  <th>Purchase Party</th>
                  <th>Gdn Party</th>
                  <th className="text-right">Meter</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => {
                  const isSel = s.id === selected?.id;
                  const href = `/external/grey/godown-stock?id=${s.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={s.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono font-bold"><a href={href} className="no-underline block" style={linkStyle}>{s.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{s.vDate}</a></td>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{s.kpNo ?? "-"}</a></td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {s.purchaseParty ?? "-"}
                          {s.purchaseParty && partyCodeByDesc.get(s.purchaseParty) && (
                            <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(s.purchaseParty)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {s.gdnParty ?? "-"}
                          {s.gdnParty && partyCodeByDesc.get(s.gdnParty) && (
                            <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(s.gdnParty)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-right mono"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(s.meter)}</a></td>
                      <td className="text-right mono font-bold"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(s.total)}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{s.type}</a></td>
                    </tr>
                  );
                })}
                {stocks.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-[13px] text-[var(--muted)] py-6">
                      No entries. Click <b>New</b> above to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
