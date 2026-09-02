import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { AutoFill, RowAutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { PackiCalc } from "@/components/packi-calc";
import { db, schema } from "@/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { today as pkToday } from "@/lib/time";
import { assertPeriodOpen } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { acc } from "@/lib/gl-accounts";

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

const TYPE_OPTIONS = ["OK", "REJ"];
const TYPE_REJ_OPTIONS = ["OK", "REJ", "MIX"];
const TERM_OPTIONS = ["CASH", "DUE"];
const COUNT_ROWS = 4;

export default async function PackiParchiPage({
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

  const parchis = findFilter
    ? await db
        .select()
        .from(schema.extPackiParchi)
        .where(sql`
          ${schema.extPackiParchi.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extPackiParchi.ppNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extPackiParchi.kpNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extPackiParchi.purchaseParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extPackiParchi.saleParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extPackiParchi.quality} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.extPackiParchi.id))
    : await db
        .select()
        .from(schema.extPackiParchi)
        .orderBy(desc(schema.extPackiParchi.id));

  const selected = isEditing ? parchis.find((p) => p.id === idParam) ?? null : null;
  const formItem = isAdding ? null : selected;

  const bags = formItem
    ? await db
        .select()
        .from(schema.extPackiParchiBag)
        .where(eq(schema.extPackiParchiBag.parchiId, formItem.id))
        .orderBy(schema.extPackiParchiBag.id)
    : [];

  const counts = formItem
    ? await db
        .select()
        .from(schema.extPackiParchiCount)
        .where(eq(schema.extPackiParchiCount.parchiId, formItem.id))
        .orderBy(schema.extPackiParchiCount.id)
    : [];

  const warpBag = bags.find((b) => b.section === "WARP") ?? null;
  const weftBag = bags.find((b) => b.section === "WEFT") ?? null;

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);
  const partyOpts = parties
    .filter((p) => p.level >= 5)
    .map((p) => ({ value: p.description, label: `${p.code} — ${p.description}`, desc: p.code }));
  // Printing Name lists ONLY printing parties (the "CREDITORS - PRINTING" group).
  const printingHead =
    parties.find((p) => p.level === 3 && /printing/i.test(p.description)) ??
    parties.find((p) => p.level < 5 && /printing/i.test(p.description));
  const printingOpts = printingHead
    ? parties
        .filter((p) => p.level >= 5 && p.code.startsWith(printingHead.code + "."))
        .map((p) => ({ value: p.description, label: `${p.code} — ${p.description}`, desc: p.code }))
    : partyOpts;
  const partyCodeByDesc = new Map(parties.filter((p) => p.level >= 5).map((p) => [p.description, p.code]));
  // Purchase Party auto = the grey-stock godown (level-5 under the "STOCK - GREY" head).
  // Packi consumes grey lying in this godown (Kachi Parchi step removed).
  const partyAccounts = parties.filter((p) => p.level >= 5);
  const greyStockHead = parties.find((p) => p.level === 4 && /stock\s*-\s*grey/i.test(p.description));
  const godownParty =
    (greyStockHead ? partyAccounts.find((p) => p.code.startsWith(greyStockHead.code + "."))?.description : undefined) ??
    partyAccounts.find((p) => /godown/i.test(p.description) && /grey\s*stock/i.test(p.description))?.description ??
    "";

  const yarnCountList = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts)
    .where(eq(schema.yarnCounts.status, "A"))
    .orderBy(schema.yarnCounts.countCode);
  const ppCountFillMap: Record<string, Record<string, string>> = {};
  for (const c of yarnCountList) {
    ppCountFillMap[String(c.countCode)] = { count_desc: c.description ?? "", count_type: c.type ?? "" };
  }
  const ppCountDescByCode = new Map(yarnCountList.map((c) => [String(c.countCode), c.description ?? ""]));

  const constructions = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction)
    .orderBy(schema.greyConstruction.description);
  const qualityOpts = constructions.map((c) => ({
    value: c.description,
    label: `${c.code} — ${c.description}`,
  }));


  const convContracts = await db
    .select()
    .from(schema.extGreyConvContract)
    .orderBy(desc(schema.extGreyConvContract.contNo));
  const convOpts = convContracts.map((c) => ({
    value: c.contNo,
    label: c.party ? `${c.contNo} — ${c.party}` : c.contNo,
    filterKey: c.party ?? "",
  }));
  const convContractMap: Record<string, Record<string, string | number | null>> = Object.fromEntries(
    convContracts.map((c) => [
      c.contNo,
      {
        purchase_party: c.party ?? "",
      },
    ])
  );

  const salContracts = await db
    .select()
    .from(schema.extGreySalContract)
    .orderBy(desc(schema.extGreySalContract.contractNo));
  const salContractOpts = salContracts.map((c) => ({
    value: c.contractNo,
    label: c.party ? `${c.contractNo} — ${c.party}` : c.contractNo,
    filterKey: c.party ?? "",
  }));
  const salContractMap: Record<string, Record<string, string | number | null>> = Object.fromEntries(
    salContracts.map((c) => [
      c.contractNo,
      {
        grey_rate_kp: c.ratePerMtr ?? "",
        broker_name_sale: c.broker ?? "",
        sale_party: c.party ?? "",
      },
    ])
  );

  const nextVNoRow = await db
    .select({
      m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extPackiParchi.vNo}, 4) AS INTEGER)), 0)`,
    })
    .from(schema.extPackiParchi);
  const upcomingVNo = "PP-" + String((nextVNoRow[0]?.m ?? 0) + 1).padStart(4, "0");

  // Godown stock + moving average for this godown+quality — grey purchased IN
  // (ext_godown_stock) minus sold OUT via other packi parchis, replayed in date order.
  // NET METER / net amount; the average RESETS whenever the meter balance hits 0.
  let ppStockThan: number | null = null;
  let ppStockMtr: number | null = null;
  let ppAvgRate: number | null = null;
  if (formItem?.purchaseParty && formItem?.quality) {
    const insRows = await db
      .select({
        date: schema.extGodownStock.vDate,
        id: schema.extGodownStock.id,
        than: schema.extGodownStock.than,
        mtr: schema.extGodownStock.netMeter,
        rate: schema.extGodownStock.rate,
      })
      .from(schema.extGodownStock)
      .where(
        and(
          eq(schema.extGodownStock.gdnParty, formItem.purchaseParty),
          eq(schema.extGodownStock.dspQuality, formItem.quality),
          eq(schema.extGodownStock.type, "STOCK"),
        ),
      );
    const outsRows = await db
      .select({
        date: schema.extPackiParchi.vDate,
        id: schema.extPackiParchi.id,
        than: schema.extPackiParchi.than,
        mtr: schema.extPackiParchi.meterNet,
      })
      .from(schema.extPackiParchi)
      .where(
        and(
          eq(schema.extPackiParchi.purchaseParty, formItem.purchaseParty),
          eq(schema.extPackiParchi.quality, formItem.quality),
          sql`${schema.extPackiParchi.id} != ${formItem.id}`,
        ),
      );
    type Mv = { date: string; id: number; kind: "IN" | "OUT"; than: number; mtr: number; rate: number };
    const moves: Mv[] = [
      ...insRows.map((r) => ({ date: r.date ?? "", id: r.id, kind: "IN" as const, than: r.than ?? 0, mtr: r.mtr ?? 0, rate: r.rate ?? 0 })),
      ...outsRows.map((r) => ({ date: r.date ?? "", id: r.id, kind: "OUT" as const, than: r.than ?? 0, mtr: r.mtr ?? 0, rate: 0 })),
    ].sort((a, b) => (a.date === b.date ? (a.kind === b.kind ? a.id - b.id : a.kind === "IN" ? -1 : 1) : a.date.localeCompare(b.date)));
    const EPS = 0.001;
    let balThan = 0, balMtr = 0, accAmt = 0;
    for (const mv of moves) {
      if (mv.kind === "IN") {
        balThan += mv.than; balMtr += mv.mtr; accAmt += mv.mtr * mv.rate;
      } else {
        const avg = balMtr > EPS ? accAmt / balMtr : 0;
        balThan -= mv.than; balMtr -= mv.mtr; accAmt -= mv.mtr * avg;
      }
      if (balMtr <= EPS) accAmt = 0; // depleted → average restarts from scratch
    }
    ppStockThan = Math.round(balThan * 100) / 100;
    ppStockMtr = Math.round(balMtr * 100) / 100;
    ppAvgRate = balMtr > EPS ? Math.round((accAmt / balMtr) * 100) / 100 : null;
  }

  async function saveParchi(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const vDate = ((formData.get("v_date") as string) || "").trim() || today();
    const purchaseParty = txt(formData.get("purchase_party"));
    const kpAll = formData.get("kp_all") ? "Y" : "N";
    const ppNo = txt(formData.get("pp_no"));
    const ppDate = txt(formData.get("pp_date"));
    const quality = txt(formData.get("quality"));
    const qualityPrint = txt(formData.get("quality_print"));
    const meterRe = num(formData.get("meter_re"));
    const meterKam = num(formData.get("meter_kam"));
    const than = intVal(formData.get("than"));
    const kpMeter = num(formData.get("kp_meter"));
    const brokerName = txt(formData.get("broker_name"));
    const brokerPercent = num(formData.get("broker_percent"));
    const meterFineNum = intVal(formData.get("meter_fine_num"));
    const meterFineDen = intVal(formData.get("meter_fine_den"));
    const greyRate = num(formData.get("grey_rate"));
    const wokc = num(formData.get("wokc"));
    const wkcBrk = num(formData.get("wkc_brk"));
    const elCumiNum = intVal(formData.get("el_cumi_num"));
    const elCumiDen = intVal(formData.get("el_cumi_den"));
    const elMeter = num(formData.get("el_meter"));
    const elMeterMode = txt(formData.get("el_meter_mode"));
    const type = txt(formData.get("type"));
    const kaatPercent = num(formData.get("kaat_percent"));
    const checkery = num(formData.get("checkery"));
    const commission = num(formData.get("commission"));
    const convContNo = txt(formData.get("conv_cont_no"));
    const saleParty = txt(formData.get("sale_party"));
    const convContNoSale = txt(formData.get("conv_cont_no_sale"));
    const commissionSale = num(formData.get("commission_sale"));
    const greyRateKp = num(formData.get("grey_rate_kp"));
    const kaatPercentSale = num(formData.get("kaat_percent_sale"));
    const checkerySale = num(formData.get("checkery_sale"));
    const brokerNameSale = txt(formData.get("broker_name_sale"));
    const brokerPercentSale = num(formData.get("broker_percent_sale"));
    const remarks = txt(formData.get("remarks"));
    const woc = num(formData.get("woc"));
    const wc = num(formData.get("wc"));
    const wck = num(formData.get("wck"));
    const printingName = txt(formData.get("printing_name"));
    const termSal = txt(formData.get("term_sal"));
    const dueDate = termSal === "DUE" ? txt(formData.get("due_date")) : null;
    const typeRej = txt(formData.get("type_rej"));
    const imgNo = txt(formData.get("img_no"));

    const errPath = (slug: string) =>
      `/external/grey/packi-parchi?${Number.isFinite(id) && id > 0 ? `id=${id}&` : ""}error=${slug}`;

    const kpNoRaw =
      kpAll === "Y"
        ? txt(formData.get("kp_no_all")) ?? txt(formData.get("kp_no"))
        : txt(formData.get("kp_no")) ?? txt(formData.get("kp_no_all"));
    const kpIdRaw = intVal(formData.get("kp_id"));

    let kpRows = kpNoRaw
      ? await db
          .select()
          .from(schema.extKachiParchi)
          .where(eq(schema.extKachiParchi.vNo, kpNoRaw))
          .limit(1)
      : [];
    if (!kpRows.length && kpIdRaw != null) {
      kpRows = await db
        .select()
        .from(schema.extKachiParchi)
        .where(eq(schema.extKachiParchi.id, kpIdRaw))
        .limit(1);
    }
    // Kachi Parchi is optional now — Packi works standalone (consumes from the godown).
    const kpLinkId = kpRows.length ? kpRows[0].id : null;
    const kpNo = kpRows.length ? kpRows[0].vNo : null;

    // Oracle-parity: PP-form's monetary calcs use Round(...) to whole rupees / whole meters.
    // Keep integer rounding here rather than 2dp because that's what Oracle reports.
    const rnd = Math.round;
    const cumiDiv = (d: number) => (d === 5 ? 400 : 800);
    const mRe = meterRe ?? 0;
    let elMeterC = elMeter;
    if (kpMeter != null && elCumiNum != null && elCumiDen != null) {
      elMeterC = rnd(((kpMeter - mRe) * elCumiNum) / cumiDiv(elCumiDen));
    }
    const fineMtr =
      kpMeter != null && meterFineNum != null && meterFineDen != null
        ? rnd(((kpMeter - mRe) * meterFineNum) / cumiDiv(meterFineDen))
        : 0;
    const meterNetC =
      kpMeter == null
        ? null
        : Math.round((kpMeter - (elMeterC ?? 0) - mRe - fineMtr - (meterKam ?? 0)) * 100) / 100;
    if (meterNetC == null || meterNetC <= 0) redirect(errPath("meter_net"));

    const wkcBrkC =
      wkcBrk ??
      (greyRate != null && greyRate > 0 ? Math.min(Math.max(Math.floor(greyRate / 10), 1), 9) : null);
    const checkeryC = checkery ?? 0.07;

    const greyAmtPur = rnd(meterNetC * (greyRate ?? 0));
    const kaatAmt = rnd((meterNetC / 40) * (wkcBrkC ?? 0));
    const checkeryAmt = rnd((kpMeter ?? 0) * checkeryC);
    const commissionAmtPv = rnd((meterNetC * (greyRateKp ?? 0) * (commission ?? 0)) / 100);
    const brokerAmtPv = rnd((greyAmtPur * (brokerPercent ?? 0)) / 100);
    const purBal = greyAmtPur - kaatAmt - checkeryAmt - brokerAmtPv - commissionAmtPv;

    const greyAmtSal = rnd(meterNetC * (greyRateKp ?? 0));
    const commissionSaleAmt = rnd((greyAmtSal * (commissionSale ?? 0)) / 100);
    const kaatSalAmt = rnd((greyAmtSal * (kaatPercentSale ?? 0)) / 100);
    const checkerySalAmt = rnd((meterNetC / 40) * (checkerySale ?? 0));
    const salAmtTot = greyAmtSal + commissionSaleAmt - kaatSalAmt - checkerySalAmt;

    const brokerAmtSal = rnd((greyAmtSal * (brokerPercentSale ?? 0)) / 100);
    const salAmtDiffC = salAmtTot - purBal;
    const commissionTotalC = rnd(salAmtDiffC - brokerAmtSal - brokerAmtPv);
    const diffC = commissionTotalC - ((woc ?? 0) + (wc ?? 0) + (wck ?? 0));

    const warpQuality = txt(formData.get("warp_quality"));
    const warpWt = num(formData.get("warp_wt"));
    const warpRate = num(formData.get("warp_rate"));

    const weftQuality = txt(formData.get("weft_quality"));
    const weftWt = num(formData.get("weft_wt"));
    const weftRate = num(formData.get("weft_rate"));

    const bagFor = (quality: string | null, wt: number | null, rate: number | null) => {
      const bagsC = wt != null ? Math.round(((wt * meterNetC) / 100) * 100) / 100 : null;
      const amountC = bagsC != null && rate != null ? rnd(bagsC * rate * 100) : null;
      return { quality, wtPerMeter: wt, bags: bagsC, rate, amount: amountC };
    };

    const bagRows: {
      section: string;
      quality: string | null;
      wtPerMeter: number | null;
      bags: number | null;
      rate: number | null;
      amount: number | null;
    }[] = [];

    if (warpQuality || warpWt != null || warpRate != null) {
      bagRows.push({ section: "WARP", ...bagFor(warpQuality, warpWt, warpRate) });
    }
    if (weftQuality || weftWt != null || weftRate != null) {
      bagRows.push({ section: "WEFT", ...bagFor(weftQuality, weftWt, weftRate) });
    }

    const countCode = formData.getAll("count_code") as string[];
    const countType = formData.getAll("count_type") as string[];
    const countCal = formData.getAll("count_cal") as string[];
    const countEnds = formData.getAll("count_ends") as string[];
    const countRate = formData.getAll("count_rate") as string[];
    const countWt = formData.getAll("count_wt") as string[];
    const countCost = formData.getAll("count_cost") as string[];
    const countTot = formData.getAll("count_tot") as string[];

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
    const countRowCount = Math.max(
      countCode.length, countType.length, countCal.length, countEnds.length,
      countRate.length, countWt.length, countCost.length, countTot.length
    );
    for (let i = 0; i < countRowCount; i++) {
      const code = (countCode[i] || "").trim();
      const t = (countType[i] || "").trim();
      const cal = num(countCal[i]);
      const ends = intVal(countEnds[i]);
      const rate = num(countRate[i]);
      const wt = num(countWt[i]);
      const cost = num(countCost[i]);
      const tot = num(countTot[i]);
      if (!code && !t && cal == null && ends == null && rate == null && wt == null && cost == null && tot == null) continue;
      validCounts.push({
        code: code || null,
        type: t || null,
        calCount: cal,
        ends,
        ratePerLbs: rate,
        wtPerMtr: wt,
        costPerMtr: cost,
        totLbs: tot,
      });
    }

    const nowIso = new Date().toISOString();

    const [company] = await db
      .select({ currentFy: schema.companyProfile.currentFy })
      .from(schema.companyProfile)
      .limit(1);
    const fyCode = company?.currentFy ?? "";

    const coaRows = await db
      .select({
        code: schema.chartOfAccounts.code,
        description: schema.chartOfAccounts.description,
      })
      .from(schema.chartOfAccounts)
      .where(sql`${schema.chartOfAccounts.level} >= 5`);
    const codeByDesc = new Map(coaRows.map((p) => [p.description, p.code]));
    const resolvePartyCoa = (s: string | null | undefined): string => {
      if (!s) return "";
      const t = s.trim();
      if (/^\d+(\.\d+)+$/.test(t)) return t;
      return codeByDesc.get(t) ?? "";
    };
    const partyCoa = resolvePartyCoa(saleParty);

    const canPostGl = !!(fyCode && partyCoa && greyAmtSal > 0);
    const greyCommissionCode = canPostGl ? await acc("GREY_COMMISSION_INCOME") : "";

    const parseVno = (v: string | null | undefined): number => {
      if (!v) return 0;
      const m = /(\d+)\s*$/.exec(v);
      return m ? parseInt(m[1], 10) : 0;
    };

    const postGl = async (
      tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
      vNoForGl: string
    ) => {
      if (!canPostGl) return;
      const vno = parseVno(vNoForGl);
      if (vno <= 0) return;
      await tx
        .delete(schema.transDetail)
        .where(and(eq(schema.transDetail.vtype, "GPV"), eq(schema.transDetail.vno, vno)));
      await tx
        .delete(schema.transMain)
        .where(and(eq(schema.transMain.vtype, "GPV"), eq(schema.transMain.vno, vno)));

      await tx.insert(schema.transMain).values({
        fyCode,
        vtype: "GPV",
        vno,
        vdate: vDate,
        accCode: partyCoa,
        narration: `PP#${vNoForGl ?? ""} KP#${kpNo ?? ""}`.trim(),
        balanceAmount: greyAmtSal,
      });

      const details: (typeof schema.transDetail.$inferInsert)[] = [
        {
          fyCode,
          vtype: "GPV",
          vno,
          srno: 1,
          accCode: partyCoa,
          partyCode: partyCoa,
          debit: greyAmtSal,
          credit: 0,
        },
        {
          fyCode,
          vtype: "GPV",
          vno,
          srno: 2,
          accCode: greyCommissionCode,
          partyCode: partyCoa,
          debit: 0,
          credit: commissionTotalC,
        },
      ];
      const clearDiff = greyAmtSal - commissionTotalC;
      if (Math.abs(clearDiff) >= 0.01) {
        details.push({
          fyCode,
          vtype: "GPV",
          vno,
          srno: 3,
          accCode: partyCoa,
          partyCode: partyCoa,
          debit: 0,
          credit: clearDiff,
        });
      }
      const dSum = details.reduce((s, x) => s + (x.debit ?? 0), 0);
      const cSum = details.reduce((s, x) => s + (x.credit ?? 0), 0);
      if (Math.abs(dSum - cSum) >= 0.01) throw new Error("Unbalanced voucher");
      await tx.insert(schema.transDetail).values(details);
    };

    try {
      await assertPeriodOpen(vDate, "INVENTORY");

    if (Number.isFinite(id) && id > 0) {
      await db.transaction(async (tx) => {
        const cur = await tx
          .select({ vNo: schema.extPackiParchi.vNo })
          .from(schema.extPackiParchi)
          .where(eq(schema.extPackiParchi.id, id));
        const curVNo = cur[0]?.vNo;
        if (curVNo) {
          await tx
            .update(schema.extKachiParchi)
            .set({ ppVno: null })
            .where(eq(schema.extKachiParchi.ppVno, curVNo));
        }

        await tx
          .update(schema.extPackiParchi)
          .set({
            vDate, purchaseParty, kpNo, kpAll, ppNo, ppDate, quality, qualityPrint,
            meterRe, meterKam, meterNet: meterNetC, than, kpMeter, brokerName, brokerPercent,
            meterFineNum, meterFineDen, greyRate, wokc, wkcBrk: wkcBrkC, elCumiNum, elCumiDen,
            elMeter: elMeterC, elMeterMode, type, kaatPercent, checkery: checkeryC, commission, convContNo,
            saleParty, convContNoSale, commissionSale, greyRateKp, kaatPercentSale,
            checkerySale, brokerNameSale, brokerPercentSale, remarks, salAmtDiff: salAmtDiffC, woc,
            wc, wck, printingName, commissionTotal: commissionTotalC, diff: diffC, termSal, dueDate,
            typeRej, imgNo, kpId: kpLinkId,
            modifiedDate: nowIso,
          })
          .where(eq(schema.extPackiParchi.id, id));

        if (curVNo && kpLinkId != null) {
          await tx
            .update(schema.extKachiParchi)
            .set({ ppVno: curVNo })
            .where(eq(schema.extKachiParchi.id, kpLinkId));
        }

        await tx.delete(schema.extPackiParchiBag).where(eq(schema.extPackiParchiBag.parchiId, id));
        await tx.delete(schema.extPackiParchiCount).where(eq(schema.extPackiParchiCount.parchiId, id));

        if (bagRows.length) {
          await tx.insert(schema.extPackiParchiBag).values(bagRows.map((b) => ({ ...b, parchiId: id })));
        }
        if (validCounts.length) {
          await tx.insert(schema.extPackiParchiCount).values(validCounts.map((c) => ({ ...c, parchiId: id })));
        }

        if (curVNo) await postGl(tx, curVNo);
      });

      revalidatePath("/external/grey/packi-parchi");
      redirect(`/external/grey/packi-parchi?id=${id}`);
    } else {
      const providedVNo = ((formData.get("v_no") as string) || "").trim();

      let newId = 0;
      let codeExists = false;
      try {
        newId = await db.transaction(async (tx) => {
          const existingRows = await tx
            .select({
              m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extPackiParchi.vNo}, 4) AS INTEGER)), 0)`,
            })
            .from(schema.extPackiParchi);
          const vNo = providedVNo || "PP-" + String((existingRows[0]?.m ?? 0) + 1).padStart(4, "0");

          const inserted = await tx
            .insert(schema.extPackiParchi)
            .values({
              vNo, vDate, purchaseParty, kpNo, kpAll, ppNo, ppDate, quality, qualityPrint,
              meterRe, meterKam, meterNet: meterNetC, than, kpMeter, brokerName, brokerPercent,
              meterFineNum, meterFineDen, greyRate, wokc, wkcBrk: wkcBrkC, elCumiNum, elCumiDen,
              elMeter: elMeterC, elMeterMode, type, kaatPercent, checkery: checkeryC, commission, convContNo,
              saleParty, convContNoSale, commissionSale, greyRateKp, kaatPercentSale,
              checkerySale, brokerNameSale, brokerPercentSale, remarks, salAmtDiff: salAmtDiffC, woc,
              wc, wck, printingName, commissionTotal: commissionTotalC, diff: diffC, termSal, dueDate,
              typeRej, imgNo, kpId: kpLinkId,
              postedDate: nowIso,
            })
            .returning({ id: schema.extPackiParchi.id });
          const insertedId = inserted[0].id;

          if (kpLinkId != null) {
            await tx
              .update(schema.extKachiParchi)
              .set({ ppVno: vNo })
              .where(eq(schema.extKachiParchi.id, kpLinkId));
          }

          if (bagRows.length) {
            await tx.insert(schema.extPackiParchiBag).values(bagRows.map((b) => ({ ...b, parchiId: insertedId })));
          }
          if (validCounts.length) {
            await tx.insert(schema.extPackiParchiCount).values(validCounts.map((c) => ({ ...c, parchiId: insertedId })));
          }

          await postGl(tx, vNo);
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
        redirect(`/external/grey/packi-parchi?error=code_exists`);
      }

      revalidatePath("/external/grey/packi-parchi");
      redirect(`/external/grey/packi-parchi?id=${newId}`);
    }
    } catch (e: unknown) {
      const digest = (e as { digest?: string })?.digest ?? "";
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw e;
      const msg = (e as { message?: string })?.message ?? "";
      const m = /Period locked through (\d{4}-\d{2}-\d{2})/.exec(msg);
      if (m) {
        redirect(`/external/grey/packi-parchi?error=period_locked&thru=${m[1]}`);
      }
      throw e;
    }
  }

  async function deleteParchi(formData: FormData) {
    "use server";
    const s = await getSession();
    if (s?.roleName !== "ADMIN") redirect("/external/grey/packi-parchi?error=admin_only");
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
      const cur = await tx
        .select({ vNo: schema.extPackiParchi.vNo })
        .from(schema.extPackiParchi)
        .where(eq(schema.extPackiParchi.id, id));
      if (cur[0]?.vNo) {
        await tx
          .update(schema.extKachiParchi)
          .set({ ppVno: null })
          .where(eq(schema.extKachiParchi.ppVno, cur[0].vNo));
      }
      const m = cur[0]?.vNo ? /(\d+)\s*$/.exec(cur[0].vNo) : null;
      const delVno = m ? parseInt(m[1], 10) : 0;
      if (delVno > 0) {
        await tx
          .delete(schema.transDetail)
          .where(and(eq(schema.transDetail.vtype, "GPV"), eq(schema.transDetail.vno, delVno)));
        await tx
          .delete(schema.transMain)
          .where(and(eq(schema.transMain.vtype, "GPV"), eq(schema.transMain.vno, delVno)));
      }
      await tx.delete(schema.extPackiParchiBag).where(eq(schema.extPackiParchiBag.parchiId, id));
      await tx.delete(schema.extPackiParchiCount).where(eq(schema.extPackiParchiCount.parchiId, id));
      await tx.delete(schema.extPackiParchi).where(eq(schema.extPackiParchi.id, id));
    });
    revalidatePath("/external/grey/packi-parchi");
    redirect("/external/grey/packi-parchi");
  }

  const countGrid: (typeof counts[number] | null)[] = Array.from(
    { length: Math.max(COUNT_ROWS, counts.length) },
    (_, i) => counts[i] ?? null
  );

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const roCls = "input-box mono bg-gray-100";
  const gridCellCls = "input-box mono text-[13px] py-1";
  const gridCellNumCls = "input-box mono text-[13px] py-1 text-right";

  const bagTotalAmount =
    (warpBag?.amount ?? 0) + (weftBag?.amount ?? 0);

  return (
    <Shell active="ext-pp">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">PACKI PARCHI</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {parchis.length} parchi{parchis.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={parchis.map((p) => ({
              vNo: p.vNo,
              vDate: p.vDate,
              purchaseParty: p.purchaseParty,
              saleParty: p.saleParty,
              ppNo: p.ppNo,
              kpNo: p.kpNo,
              meterRe: p.meterRe,
              meterNet: p.meterNet,
              commissionTotal: p.commissionTotal,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "V.Date" },
              { key: "purchaseParty", label: "Purchase Party" },
              { key: "saleParty", label: "Sale Party" },
              { key: "ppNo", label: "PP.No" },
              { key: "kpNo", label: "KP.No" },
              { key: "meterRe", label: "Meter Re" },
              { key: "meterNet", label: "Meter Net" },
              { key: "commissionTotal", label: "Commission Total" },
            ]}
            filename="packi-parchi"
            sheetName="PackiParchi"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            V.No already exists. Try again.
          </div>
        )}
        {params.error === "meter_net" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Meter Net must be greater than 0. Check KP.Meter and deductions.
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

        <form id="pp-find-form" method="GET" action="/external/grey/packi-parchi" className="hidden"></form>

        <div className="border border-black p-4 mb-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — PACKI PARCHI"
                : formItem
                ? `Edit — ${formItem.vNo}`
                : "PACKI PARCHI"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/external/grey/packi-parchi?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="pp-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              <a href="/external/grey/packi-parchi" className="btn btn-outline btn-sm">Exit</a>
              {formItem ? (
                <form action={deleteParchi} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <ConfirmButton>Del</ConfirmButton>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled
                  title="Save the parchi first to enable delete"
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Del
                </button>
              )}
              <button type="button" className="btn btn-outline btn-sm">Conv Rate</button>
            </div>
          </div>

          <form id="pp-save-form" action={saveParchi}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3 gform">
              <div className="lg:col-span-2">
                <label className="label block mb-1">V. Date</label>
                <input
                  name="v_date"
                  type="date"
                  className="input-box mono"
                  defaultValue={formItem?.vDate ?? today()}
                  required
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">V.No</label>
                <input
                  name="v_no"
                  className={roCls}
                  defaultValue={formItem?.vNo ?? upcomingVNo}
                  readOnly
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Pending Finance</label>
                <input
                  className={roCls}
                  defaultValue={formItem?.pendingFinance ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Posted</label>
                <input
                  className={roCls + " text-[12px]"}
                  defaultValue={formItem?.postedDate?.slice(0, 10) ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-3 hidden">
                <label className="label block mb-1">Modified</label>
                <input
                  className={roCls + " text-[12px]"}
                  defaultValue={formItem?.modifiedDate?.slice(0, 10) ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>

              <div className="lg:col-span-6">
                <label className="label block mb-1">Purchase Party <span className="text-[9px] text-[var(--muted)]">(grey-stock godown — locked)</span></label>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <input className={roCls} defaultValue={partyCodeByDesc.get(formItem?.purchaseParty || godownParty) ?? ""} readOnly tabIndex={-1} />
                  <input className={roCls} defaultValue={formItem?.purchaseParty || godownParty} readOnly tabIndex={-1} />
                </div>
                <input type="hidden" name="purchase_party" defaultValue={formItem?.purchaseParty || godownParty} />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Godown Stock <span className="text-[9px] text-[var(--muted)]">(than / mtr)</span></label>
                <div className="grid grid-cols-2 gap-1">
                  <input className={roCls + " text-right"} defaultValue={ppStockThan ?? ""} readOnly tabIndex={-1} title="Stock Than" />
                  <input className={roCls + " text-right"} defaultValue={ppStockMtr ?? ""} readOnly tabIndex={-1} title="Stock Mtr" />
                </div>
                {/* Kachi Parchi step removed — Packi is standalone. Hidden KP fields keep
                   older converted records intact on re-save. */}
                <input type="hidden" name="kp_no" defaultValue={formItem?.kpNo ?? ""} />
                <input type="hidden" name="kp_id" defaultValue={formItem?.kpId ?? ""} />
                <PackiCalc />
              </div>
              <div className="lg:col-span-1">
                <label className="label block mb-1">Avg Rate</label>
                <input className={roCls + " text-right"} defaultValue={ppAvgRate ?? ""} readOnly tabIndex={-1} />
              </div>
              <div className="lg:col-span-1">
                <label className="label block mb-1">Stock Value</label>
                <input className={roCls + " text-right"} defaultValue={ppStockMtr != null && ppAvgRate != null ? Math.round(ppStockMtr * ppAvgRate) : ""} readOnly tabIndex={-1} />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">PP.No</label>
                <input
                  name="pp_no"
                  className="input-box mono"
                  defaultValue={formItem?.ppNo ?? ""}
                />
              </div>
              <div className="lg:col-span-1 hidden">
                <label className="label block mb-1">PP. Date</label>
                <input
                  name="pp_date"
                  type="date"
                  className="input-box mono"
                  defaultValue={formItem?.ppDate ?? ""}
                />
              </div>

              <div className="lg:col-span-6">
                <label className="label block mb-1">Quality</label>
                <Combobox
                  name="quality"
                  options={qualityOpts}
                  defaultValue={formItem?.quality ?? ""}
                  placeholder="Quality…"
                />
              </div>
              <div className="lg:col-span-6">
                <label className="label block mb-1">Quality Print</label>
                <input
                  name="quality_print"
                  className="input-box mono"
                  defaultValue={formItem?.qualityPrint ?? ""}
                />
              </div>

              <div className="lg:col-span-2">
                <label className="label block mb-1">Meter Re</label>
                <input
                  name="meter_re"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.meterRe ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Than</label>
                <input
                  name="than"
                  type="number"
                  step="1"
                  className="input-box mono text-right"
                  defaultValue={formItem?.than ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Meter <span className="text-[9px] text-[var(--muted)]">(from godown stock)</span></label>
                <input
                  name="kp_meter"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.kpMeter ?? ""}
                />
              </div>
              <div className="lg:col-span-3 hidden">
                <label className="label block mb-1">Broker Name</label>
                <Combobox
                  name="broker_name"
                  options={partyOpts}
                  defaultValue={formItem?.brokerName ?? ""}
                  placeholder="Select broker…"
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">KP. Meter</label>
                <input
                  className={roCls + " text-right"}
                  defaultValue={formItem?.kpMeter ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-1 hidden">
                <label className="label block mb-1">Broker %</label>
                <input
                  name="broker_percent"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.brokerPercent ?? ""}
                />
              </div>

              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Meter Kam</label>
                <input
                  name="meter_kam"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.meterKam ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Meter Fine (1/5 or 1/10)</label>
                <div className="flex items-center gap-1">
                  <input
                    name="meter_fine_num"
                    type="number"
                    step="1"
                    className="input-box mono text-right"
                    defaultValue={formItem?.meterFineNum ?? ""}
                  />
                  <span className="mono text-[13px]">/</span>
                  <input
                    name="meter_fine_den"
                    type="number"
                    step="1"
                    className="input-box mono text-right"
                    defaultValue={formItem?.meterFineDen ?? ""}
                  />
                </div>
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">EL-Cumi</label>
                <div className="flex items-center gap-1">
                  <input
                    name="el_cumi_num"
                    type="number"
                    step="1"
                    className="input-box mono text-right"
                    defaultValue={formItem?.elCumiNum ?? ""}
                  />
                  <span className="mono text-[13px]">/</span>
                  <input
                    name="el_cumi_den"
                    type="number"
                    step="1"
                    className="input-box mono text-right"
                    defaultValue={formItem?.elCumiDen ?? ""}
                  />
                </div>
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">EL-Meter (1/5 or 1/10)</label>
                <div className="flex items-center gap-1">
                  <input
                    name="el_meter"
                    type="number"
                    step="any"
                    className={roCls + " text-right"}
                    defaultValue={formItem?.elMeter ?? ""}
                    readOnly
                  />
                  <input
                    name="el_meter_mode"
                    className="input-box mono"
                    style={{ maxWidth: 80 }}
                    defaultValue={formItem?.elMeterMode ?? ""}
                    placeholder="mode"
                  />
                </div>
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Meter Net</label>
                <input
                  name="meter_net"
                  type="number"
                  step="any"
                  className={roCls + " text-right"}
                  defaultValue={formItem?.meterNet ?? ""}
                  readOnly
                />
              </div>

              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">W.O.K.C</label>
                <input
                  name="wokc"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.wokc ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">W.K.C.BRK</label>
                <input
                  name="wkc_brk"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.wkcBrk ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Purchase Rate <span className="text-[9px] text-[var(--muted)]">(see avg rate)</span></label>
                <input
                  name="grey_rate"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.greyRate ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Purchase Amount</label>
                <input name="grey_amt_pur_disp" type="number" step="any" className={roCls + " text-right"} readOnly tabIndex={-1} defaultValue={formItem?.meterNet != null && formItem?.greyRate != null ? Math.round(formItem.meterNet * formItem.greyRate) : ""} />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Type</label>
                <select name="type" className="input-box mono" defaultValue={formItem?.type ?? "OK"}>
                  <option value="">—</option>
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  {formItem?.type && !TYPE_OPTIONS.includes(formItem.type) && (
                    <option value={formItem.type}>{formItem.type}</option>
                  )}
                </select>
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Kaat %</label>
                <input
                  name="kaat_percent"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.kaatPercent ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Img #</label>
                <input
                  name="img_no"
                  className="input-box mono"
                  defaultValue={formItem?.imgNo ?? ""}
                  placeholder="img ref"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="label block mb-1">Conv.Cont No</label>
                <Combobox
                  name="conv_cont_no"
                  options={convOpts}
                  defaultValue={formItem?.convContNo ?? ""}
                  placeholder="Conv contract…"
                  filterByField="purchase_party"
                />
                <AutoFill
                  watch="conv_cont_no"
                  map={convContractMap}
                  combos={["purchase_party"]}
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Checkery</label>
                <input
                  name="checkery"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.checkery ?? ""}
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Commission</label>
                <input
                  name="commission"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.commission ?? ""}
                />
              </div>
              <div className="lg:col-span-5"></div>

              <div className="lg:col-span-12 border-t border-black pt-3 mt-1 gform-full">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">Sale Side</div>
              </div>

              <div className="lg:col-span-6">
                <label className="label block mb-1">Sale Party</label>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <input id="pp-sale-party-code" className={roCls} placeholder="Code" readOnly tabIndex={-1} />
                  <Combobox
                    name="sale_party"
                    options={partyOpts}
                    defaultValue={formItem?.saleParty ?? ""}
                    placeholder="Select party…"
                    descTargetId="pp-sale-party-code"
                  />
                </div>
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Conv. Cont #</label>
                <Combobox
                  name="conv_cont_no_sale"
                  options={salContractOpts}
                  defaultValue={formItem?.convContNoSale ?? ""}
                  placeholder="Sale contract…"
                  filterByField="sale_party"
                />
                <AutoFill
                  watch="conv_cont_no_sale"
                  map={salContractMap}
                  combos={["broker_name_sale", "sale_party"]}
                  inputs={["grey_rate_kp"]}
                />
                <RowAutoFill watch="count_code" map={ppCountFillMap} />
                <datalist id="pp-yarn-counts">
                  {yarnCountList.map((c) => (
                    <option key={c.countCode} value={c.countCode}>{c.countCode} — {c.description}{c.type ? ` ${c.type}` : ""}</option>
                  ))}
                </datalist>
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Commission <span className="text-[9px] text-[var(--muted)]">(+add / −less on bill)</span></label>
                <input
                  name="commission_sale"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.commissionSale ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Sale Net</label>
                <input name="sale_net_disp" type="number" step="any" className={roCls + " text-right font-bold"} readOnly tabIndex={-1} />
              </div>

              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Grey Rate Kp</label>
                <input
                  name="grey_rate_kp"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.greyRateKp ?? ""}
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Kaat %</label>
                <input
                  name="kaat_percent_sale"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.kaatPercentSale ?? ""}
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Checkery</label>
                <input
                  name="checkery_sale"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.checkerySale ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Printing Name <span className="text-[9px] text-[var(--muted)]">(printing parties)</span></label>
                <Combobox
                  name="printing_name"
                  options={printingOpts}
                  defaultValue={formItem?.printingName ?? ""}
                  placeholder="Select printing party…"
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Broker Name</label>
                <Combobox
                  name="broker_name_sale"
                  options={partyOpts}
                  defaultValue={formItem?.brokerNameSale ?? ""}
                  placeholder="Select broker…"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="label block mb-1">Broker %</label>
                <input
                  name="broker_percent_sale"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.brokerPercentSale ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Broker Amount</label>
                <input name="broker_amt_sal_disp" type="number" step="any" className={roCls + " text-right"} readOnly tabIndex={-1} />
              </div>
              <div className="lg:col-span-8">
                <label className="label block mb-1">Remarks</label>
                <input
                  name="remarks"
                  className="input-box mono"
                  defaultValue={formItem?.remarks ?? ""}
                />
              </div>

              <div className="lg:col-span-12 border-t border-black pt-3 mt-1 gform-full">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">Totals</div>
              </div>

              <div className="lg:col-span-2">
                <label className="label block mb-1">Sal.Amt.Diff</label>
                <input
                  name="sal_amt_diff"
                  type="number"
                  step="any"
                  className={roCls + " text-right"}
                  defaultValue={formItem?.salAmtDiff ?? ""}
                  readOnly
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">W.O.C</label>
                <input
                  name="woc"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.woc ?? ""}
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">W.C</label>
                <input
                  name="wc"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.wc ?? ""}
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">W.C.K</label>
                <input
                  name="wck"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.wck ?? ""}
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Commission Total</label>
                <input
                  name="commission_total"
                  type="number"
                  step="any"
                  className={roCls + " text-right"}
                  defaultValue={formItem?.commissionTotal ?? ""}
                  readOnly
                />
              </div>
              <div className="lg:col-span-2 hidden">
                <label className="label block mb-1">Diff</label>
                <input
                  name="diff"
                  type="number"
                  step="any"
                  className={roCls + " text-right"}
                  defaultValue={formItem?.diff ?? ""}
                  readOnly
                />
              </div>

              <div className="lg:col-span-3">
                <label className="label block mb-1">Term Sal</label>
                <select name="term_sal" className="input-box mono" defaultValue={formItem?.termSal ?? ""}>
                  <option value="">—</option>
                  {TERM_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  {formItem?.termSal && !TERM_OPTIONS.includes(formItem.termSal) && (
                    <option value={formItem.termSal}>{formItem.termSal}</option>
                  )}
                </select>
              </div>
              <div
                id="pp-due-date-wrap"
                className="lg:col-span-2"
                style={{ display: formItem?.termSal === "DUE" ? undefined : "none" }}
              >
                <label className="label block mb-1">Due Date</label>
                <input
                  name="due_date"
                  type="date"
                  className="input-box mono"
                  defaultValue={formItem?.dueDate ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Alt-S Password</label>
                <input className="input-box mono" placeholder="password" type="password" />
              </div>
              <div className="lg:col-span-6">
                <label className="label block mb-1">Find</label>
                <div className="flex gap-2">
                  <input
                    form="pp-find-form"
                    name="find"
                    className="input-box mono flex-1"
                    defaultValue={params.find ?? ""}
                    placeholder="v.no / pp / kp / party / quality"
                  />
                  <button form="pp-find-form" type="submit" className="btn btn-outline btn-sm">Find</button>
                  {findFilter && <a href="/external/grey/packi-parchi" className="btn btn-outline btn-sm">Clear</a>}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">BAGS</div>
              <div className="overflow-x-auto border border-black">
                <table style={{ minWidth: "900px" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "70px" }}>Section</th>
                      <th>Quality</th>
                      <th className="text-right">WT/Meter</th>
                      <th className="text-right">Bags</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="mono text-[12px] text-center font-bold">Warp</td>
                      <td><Combobox name="warp_quality" options={qualityOpts} defaultValue={warpBag?.quality ?? ""} placeholder="Quality…" className={gridCellCls} /></td>
                      <td><input name="warp_wt" type="number" step="any" className={gridCellNumCls} defaultValue={warpBag?.wtPerMeter ?? ""} /></td>
                      <td><input name="warp_bags" type="number" step="any" className={gridCellNumCls + " bg-gray-100"} defaultValue={warpBag?.bags ?? ""} readOnly /></td>
                      <td><input name="warp_rate" type="number" step="any" className={gridCellNumCls} defaultValue={warpBag?.rate ?? ""} /></td>
                      <td><input name="warp_amount" type="number" step="any" className={gridCellNumCls + " bg-gray-100"} defaultValue={warpBag?.amount ?? ""} readOnly /></td>
                    </tr>
                    <tr>
                      <td className="mono text-[12px] text-center font-bold">Weft</td>
                      <td><Combobox name="weft_quality" options={qualityOpts} defaultValue={weftBag?.quality ?? ""} placeholder="Quality…" className={gridCellCls} /></td>
                      <td><input name="weft_wt" type="number" step="any" className={gridCellNumCls} defaultValue={weftBag?.wtPerMeter ?? ""} /></td>
                      <td><input name="weft_bags" type="number" step="any" className={gridCellNumCls + " bg-gray-100"} defaultValue={weftBag?.bags ?? ""} readOnly /></td>
                      <td><input name="weft_rate" type="number" step="any" className={gridCellNumCls} defaultValue={weftBag?.rate ?? ""} /></td>
                      <td><input name="weft_amount" type="number" step="any" className={gridCellNumCls + " bg-gray-100"} defaultValue={weftBag?.amount ?? ""} readOnly /></td>
                    </tr>
                    <tr className="bg-gray-50 font-bold">
                      <td className="mono text-[12px] text-center">Total</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td className="text-right mono text-[12px] pr-2">Sum</td>
                      <td className="text-right mono text-[12px] pr-2">{formatNum(bagTotalAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                Update Count ({COUNT_ROWS} rows)
              </div>
              <div className="overflow-x-auto border border-black">
                <table style={{ minWidth: "1100px" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "30px" }}>#</th>
                      <th>Count Code</th>
                      <th>Count Desc</th>
                      <th>Type</th>
                      <th className="text-right">Cal Count</th>
                      <th className="text-right">Ends</th>
                      <th className="text-right">Rate Per Lbs</th>
                      <th className="text-right">WT Per Mtr</th>
                      <th className="text-right">Cost Per Mtr</th>
                      <th className="text-right">TOT Lbs</th>
                      <th>Type Rej</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countGrid.map((row, i) => (
                      <tr key={row?.id ?? `ec-${i}`}>
                        <td className="mono text-[11px] text-center text-[var(--muted)]">{i + 1}</td>
                        <td><input name="count_code" list="pp-yarn-counts" className={gridCellCls} defaultValue={row?.code ?? ""} style={{ width: 60 }} /></td>
                        <td><input name="count_desc" className={gridCellCls} defaultValue={row?.code ? (ppCountDescByCode.get(String(row.code)) ?? "") : ""} readOnly tabIndex={-1} style={{ minWidth: 140, background: "#f3f4f6" }} /></td>
                        <td><input name="count_type" className={gridCellCls} defaultValue={row?.type ?? ""} style={{ width: 80 }} /></td>
                        <td><input name="count_cal" type="number" step="any" className={gridCellNumCls} defaultValue={row?.calCount ?? ""} /></td>
                        <td><input name="count_ends" type="number" step="1" className={gridCellNumCls} defaultValue={row?.ends ?? ""} /></td>
                        <td><input name="count_rate" type="number" step="any" className={gridCellNumCls} defaultValue={row?.ratePerLbs ?? ""} /></td>
                        <td><input name="count_wt" type="number" step="any" className={gridCellNumCls} defaultValue={row?.wtPerMtr ?? ""} /></td>
                        <td><input name="count_cost" type="number" step="any" className={gridCellNumCls} defaultValue={row?.costPerMtr ?? ""} /></td>
                        <td><input name="count_tot" type="number" step="any" className={gridCellNumCls} defaultValue={row?.totLbs ?? ""} /></td>
                        <td>
                          {i === 0 ? (
                            <select name="type_rej" className={gridCellCls} defaultValue={formItem?.typeRej ?? ""}>
                              <option value="">—</option>
                              {TYPE_REJ_OPTIONS.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                              {formItem?.typeRej && !TYPE_REJ_OPTIONS.includes(formItem.typeRej) && (
                                <option value={formItem.typeRej}>{formItem.typeRej}</option>
                              )}
                            </select>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
              <a href="/external/grey/packi-parchi?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              <a href="/external/grey/packi-parchi" className="btn btn-outline btn-sm">Exit</a>
              <button type="button" className="btn btn-outline btn-sm">Conv Rate</button>
            </div>
          </form>
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            All Packi Parchis
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>V.Date</th>
                  <th>Purchase Party</th>
                  <th>Sale Party</th>
                  <th>PP.No</th>
                  <th className="text-right">Meter Re</th>
                  <th className="text-right">Meter Net</th>
                  <th className="text-right">Commission Total</th>
                </tr>
              </thead>
              <tbody>
                {parchis.map((p) => {
                  const isSel = p.id === selected?.id;
                  const href = `/external/grey/packi-parchi?id=${p.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={p.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{p.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{p.vDate}</a></td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {p.purchaseParty ?? "-"}
                          {p.purchaseParty && partyCodeByDesc.get(p.purchaseParty) && (
                            <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(p.purchaseParty)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {p.saleParty ?? "-"}
                          {p.saleParty && partyCodeByDesc.get(p.saleParty) && (
                            <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(p.saleParty)}</span>
                          )}
                        </a>
                      </td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{p.ppNo ?? "-"}</a></td>
                      <td className="text-right mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(p.meterRe)}</a></td>
                      <td className="text-right mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(p.meterNet)}</a></td>
                      <td className="text-right mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(p.commissionTotal)}</a></td>
                    </tr>
                  );
                })}
                {parchis.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-[13px] text-[var(--muted)] py-6">
                      No parchis. Click <b>New</b> above to create one.
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
