import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { WhatsAppModal } from "@/components/whatsapp-modal";
import { Combobox } from "@/components/combobox";
import { GreyQualityPicker } from "@/components/grey-quality-picker";
import { AutoFill, RowAutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { DespatchAmountCalc, CountGridFiller } from "@/components/production-calc";
import { db, schema } from "@/db";
import { and, eq, inArray, isNotNull, ne, or, sql, desc } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today, nowTime } from "@/lib/time";
import { acc } from "@/lib/gl-accounts";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const VTYPE = "GDP";

const LOOM_TYPES = ["RAPIER", "AIR_JET", "WATER_JET", "PROJECTILE", "SHUTTLE", "SULZER", "TSUDAKOMA"];
const SELV_TYPES = ["LENO", "PLAIN", "TAPE", "CATCH", "TUCK-IN"];

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
const round2 = (v: number) => Math.round(v * 100) / 100;

function nextVNoFromRows(rows: { vNo: string }[], prefix: string): string {
  const nums = rows
    .map((r) => {
      const m = r.vNo?.match(new RegExp("^" + prefix + "-(\\d+)$"));
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + "-" + String(next).padStart(4, "0");
}

const LINE_ROWS = 4;
const COUNT_ROWS = 5;

export default async function GreyDespatchPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; pending?: string; contract?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";

  const findFilter = params.find?.trim();
  const escFind = findFilter?.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = escFind ? `%${escFind}%` : "";

  const despatches = findFilter
    ? await db
        .select()
        .from(schema.intGreyDespatch)
        .where(sql`
          ${schema.intGreyDespatch.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatch.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatch.doParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatch.despatchTo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatch.gpNo} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intGreyDespatch.id))
    : await db
        .select()
        .from(schema.intGreyDespatch)
        .orderBy(desc(schema.intGreyDespatch.id));

  const selected = isEditing ? despatches.find((d) => d.id === idParam) ?? null : null;
  const formItem = isAdding ? null : selected;

  const lineRows = formItem
    ? await db
        .select()
        .from(schema.intGreyDespatchLine)
        .where(eq(schema.intGreyDespatchLine.despatchId, formItem.id))
        .orderBy(schema.intGreyDespatchLine.srNo)
    : [];

  const countRows = formItem
    ? await db
        .select()
        .from(schema.intGreyDespatchUpdateCount)
        .where(eq(schema.intGreyDespatchUpdateCount.despatchId, formItem.id))
        .orderBy(schema.intGreyDespatchUpdateCount.id)
    : [];

  const lineGrid = Array.from({ length: Math.max(LINE_ROWS, lineRows.length) }, (_, i) => lineRows[i] ?? null);
  const countGrid = Array.from({ length: Math.max(COUNT_ROWS, countRows.length) }, (_, i) => countRows[i] ?? null);

  const meterSums = await db
    .select({
      despatchId: schema.intGreyDespatchLine.despatchId,
      meters: sql<number>`coalesce(sum(${schema.intGreyDespatchLine.lengthMtrs}), 0)`,
    })
    .from(schema.intGreyDespatchLine)
    .groupBy(schema.intGreyDespatchLine.despatchId);
  const metersById = new Map(meterSums.map((m) => [m.despatchId, m.meters]));

  const upcomingVNo = nextVNoFromRows(despatches, "IGD");

  // LV.No / L.No display = last saved max, read-only.
  const lNoRow = await db
    .select({ m: sql<number>`COALESCE(MAX(${schema.intGreyDespatch.lNo}),0)` })
    .from(schema.intGreyDespatch);
  const maxLNo = Number(lNoRow[0]?.m ?? 0);

  // Parties (level>=4).
  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);
  const partyOpts = parties.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));

  const yarnCountList = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts)
    .where(eq(schema.yarnCounts.status, "A"))
    .orderBy(schema.yarnCounts.countCode);
  const ucCountFillMap: Record<string, Record<string, string>> = {};
  for (const c of yarnCountList) {
    for (let i = 1; i <= 12; i++) {
      (ucCountFillMap[String(c.countCode)] ??= {})[`uc_desc_${i}`] = c.description ?? "";
      (ucCountFillMap[String(c.countCode)] ??= {})[`uc_type_${i}`] = c.type ?? "";
    }
  }

  // Grey construction master → GreyQualityPicker rows + count labels (Oracle FINDING GREY QUALITY parity).
  const greyList = await db
    .select({
      code: schema.greyConstruction.code,
      description: schema.greyConstruction.description,
      reed: schema.greyConstruction.reed,
      pick: schema.greyConstruction.pick,
      width: schema.greyConstruction.width,
      warpCount: schema.greyConstruction.warpCount,
      warp2: schema.greyConstruction.warp2,
      warp3: schema.greyConstruction.warp3,
      warp4: schema.greyConstruction.warp4,
      warp5: schema.greyConstruction.warp5,
      warp6: schema.greyConstruction.warp6,
      warp7: schema.greyConstruction.warp7,
      warp8: schema.greyConstruction.warp8,
      weftCount: schema.greyConstruction.weftCount,
      weft2: schema.greyConstruction.weft2,
      weft3: schema.greyConstruction.weft3,
      weft4: schema.greyConstruction.weft4,
      weft5: schema.greyConstruction.weft5,
      weft6: schema.greyConstruction.weft6,
      weft7: schema.greyConstruction.weft7,
      weft8: schema.greyConstruction.weft8,
      status: schema.greyConstruction.status,
    })
    .from(schema.greyConstruction)
    .orderBy(schema.greyConstruction.code);
  const greyPickerRows = greyList.map((g) => ({
    code: g.code,
    reed: (g.reed ?? null) as number | null,
    pick: (g.pick ?? null) as number | null,
    width: (g.width ?? null) as number | null,
    description: g.description ?? "",
    warpCounts: [g.warpCount, g.warp2, g.warp3, g.warp4, g.warp5, g.warp6, g.warp7, g.warp8].map((x) => (x ?? "") as string),
    weftCounts: [g.weftCount, g.weft2, g.weft3, g.weft4, g.weft5, g.weft6, g.weft7, g.weft8].map((x) => (x ?? "") as string),
    status: (g.status ?? "A") as string,
  }));
  const greyCountLabels: Record<string, string> = Object.fromEntries(
    yarnCountList.map((y) => [
      String(y.countCode).trim().toLowerCase(),
      `${y.countCode} — ${y.description}${y.type ? ` ${y.type}` : ""}`,
    ])
  );

  // Yarn masters → blend / brand datalists.
  const blendList = await db
    .select({ description: schema.yarnBlends.description })
    .from(schema.yarnBlends)
    .orderBy(schema.yarnBlends.description);
  const brandList = await db
    .select({ name: schema.yarnBrands.name })
    .from(schema.yarnBrands)
    .orderBy(schema.yarnBrands.name);

  // Running conv contracts + warp/weft rows for count-grid auto-populate.
  const contracts = await db
    .select()
    .from(schema.intGreyConversionContract)
    .where(eq(schema.intGreyConversionContract.status, "R"))
    .orderBy(schema.intGreyConversionContract.contNo);
  const contractOpts = contracts.map((c) => ({
    value: c.contNo,
    label: `${c.contNo} — ${c.party ?? ""}`,
    desc: c.party ?? "",
    filterKey: c.party ?? "",
  }));
  const contractFillMap: Record<string, Record<string, string | number | null>> = {};
  const contractPartyMap: Record<string, string | null> = {};
  for (const c of contracts) {
    contractFillMap[c.contNo] = {
      party: c.party ?? "",
      do_party: c.party ?? "",
      conv_rate: c.convRatePerMtr ?? 1, // Default conv rate = 1 when contract chosen.
      design_no: c.designNo ?? "",
      grey_code: c.grayCode ?? "",
      width: c.width ?? "",
      product_brand: c.productName ?? "",
      loom_type: c.loomType ?? "",
      ft_weave: c.weaveFrame ?? "",
      gst_rate: 0,
      ftx_rate: 0,
    };
    contractPartyMap[c.contNo] = c.party ?? null;
  }
  const warpRows = contracts.length
    ? await db
        .select()
        .from(schema.intGreyConversionWarp)
        .where(inArray(schema.intGreyConversionWarp.contractId, contracts.map((c) => c.id)))
        .orderBy(schema.intGreyConversionWarp.contractId, schema.intGreyConversionWarp.srNo)
    : [];
  const weftRows = contracts.length
    ? await db
        .select()
        .from(schema.intGreyConversionWeft)
        .where(inArray(schema.intGreyConversionWeft.contractId, contracts.map((c) => c.id)))
        .orderBy(schema.intGreyConversionWeft.contractId, schema.intGreyConversionWeft.srNo)
    : [];
  const contractRowsByContNo: Record<string, {
    count?: string | null;
    calCount?: number | null;
    ends?: number | null;
    ratePerLbs?: number | null;
    wtPerMtr?: number | null;
    costPerMtr?: number | null;
  }[]> = {};
  const idToContNo = new Map(contracts.map((c) => [c.id, c.contNo]));
  const push = (r: typeof warpRows[number]) => {
    const cn = idToContNo.get(r.contractId);
    if (!cn) return;
    (contractRowsByContNo[cn] ||= []).push({
      count: r.count ?? null,
      calCount: r.calCount ?? null,
      ends: r.ends ?? null,
      ratePerLbs: r.ratePerLbs ?? null,
      wtPerMtr: r.wtPerMtr ?? null,
      costPerMtr: r.costPerMtr ?? null,
    });
  };
  for (const w of warpRows) push(w);
  for (const w of weftRows) push(w);

  // Prior distinct values → datalists.
  const priorSup = await db
    .selectDistinct({ v: schema.intGreyDespatch.supervisor })
    .from(schema.intGreyDespatch)
    .where(isNotNull(schema.intGreyDespatch.supervisor));
  const priorVeh = await db
    .selectDistinct({ v: schema.intGreyDespatch.vehicleNo })
    .from(schema.intGreyDespatch)
    .where(isNotNull(schema.intGreyDespatch.vehicleNo));
  const priorDrv = await db
    .selectDistinct({ v: schema.intGreyDespatch.driver })
    .from(schema.intGreyDespatch)
    .where(isNotNull(schema.intGreyDespatch.driver));
  const priorGp = await db
    .selectDistinct({ v: schema.intGreyDespatch.gpNo })
    .from(schema.intGreyDespatch)
    .where(isNotNull(schema.intGreyDespatch.gpNo));
  const shedList = await db
    .selectDistinct({ v: schema.looms.shed })
    .from(schema.looms)
    .orderBy(schema.looms.shed);

  // Pending thans panel: show for the selected contract on a saved voucher, or via ?pending=1&contract=.
  const pendingContract =
    (formItem?.convContNo && formItem.convContNo.trim()) ||
    (params.pending === "1" ? params.contract?.trim() ?? "" : "");
  const pendingParty = pendingContract ? contractPartyMap[pendingContract] ?? null : null;
  const pendingThans = pendingParty
    ? await db
        .select({
          mm: schema.intDailyProductionSet.mmThanSrNo,
          totalCount: schema.intDailyProductionSet.totalCount,
          beamNo: schema.intDailyProductionSet.beamNo,
          setHash: schema.intDailyProductionSet.setHash,
          vNo: schema.intDailyProduction.vNo,
          vDate: schema.intDailyProduction.vDate,
        })
        .from(schema.intDailyProductionSet)
        .innerJoin(
          schema.intDailyProduction,
          eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id)
        )
        .where(
          and(
            eq(schema.intDailyProduction.convContParty, pendingParty),
            isNotNull(schema.intDailyProductionSet.mmThanSrNo),
            or(
              sql`${schema.intDailyProductionSet.dlvStatus} IS NULL`,
              ne(schema.intDailyProductionSet.dlvStatus, "Y")
            )
          )
        )
        .orderBy(schema.intDailyProductionSet.mmThanSrNo)
    : [];


  async function saveDespatch(formData: FormData) {
    "use server";
    try {
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const isUpdate = Number.isFinite(id) && id > 0;
    await assertPeriodOpen(txt(formData.get("v_date")) ?? today(), "INVENTORY");

    const data = {
      vDate: txt(formData.get("v_date")) ?? today(),
      time: txt(formData.get("time")),
      lNo: intVal(formData.get("l_no")),
      doVNoFrom: txt(formData.get("do_v_no_from")),
      doVNoTo: txt(formData.get("do_v_no_to")),
      setHashAllThanPrdHashSetHash: txt(formData.get("set_hash_all_than_prd_hash_set_hash")),
      despatchTo: txt(formData.get("despatch_to")),
      despatchLocation: txt(formData.get("despatch_location")),
      despatchFrom: txt(formData.get("despatch_from")),
      convContNo: txt(formData.get("conv_cont_no")),
      postLotNo: txt(formData.get("post_lot_no")),
      shedNo: txt(formData.get("shed_no")),
      party: txt(formData.get("party")),
      doParty: txt(formData.get("do_party")),
      thanQty: num(formData.get("than_qty")),
      convRate: num(formData.get("conv_rate")),
      // amnt / gst / further / amt_tot are always recomputed server-side below.
      amnt: 0 as number | null,
      gst: 0 as number | null,
      further: 0 as number | null,
      gpNo: txt(formData.get("gp_no")),
      gpDate: txt(formData.get("gp_date")),
      dateFrom: txt(formData.get("date_from")),
      dateTo: txt(formData.get("date_to")),
      amtTot: 0 as number | null,
      ftWeave: txt(formData.get("ft_weave")),
      designNo: txt(formData.get("design_no")),
      lbMtr: num(formData.get("lb_mtr")),
      encCode: txt(formData.get("enc_code")),
      supervisor: txt(formData.get("supervisor")),
      vehicleNo: txt(formData.get("vehicle_no")),
      driver: txt(formData.get("driver")),
      transAdda: txt(formData.get("trans_adda")),
      silvagQuality: txt(formData.get("silvag_quality")),
      brkgPerMtr: num(formData.get("brkg_per_mtr")),
      agePercent: num(formData.get("age_percent")),
      comm: num(formData.get("comm")),
      productBrand: txt(formData.get("product_brand")),
      loomType: txt(formData.get("loom_type")),
      blend: txt(formData.get("blend")),
      greyCode: txt(formData.get("grey_code")),
      width: num(formData.get("width")),
      type: txt(formData.get("type")) ?? "FRS",
      remarks: txt(formData.get("remarks")),
      updateCountBlock: txt(formData.get("update_count_block")),
      modifiedDate: new Date().toISOString(),
    };

    // Collect line rows once so we can validate + drive than consumption below.
    type LineIn = { i: number; tSrNo: string | null; a: number | null; b: number | null; c: number | null; cp: number | null; rej: number | null; lengthMtrs: number | null };
    const inLines: LineIn[] = [];
    let maxLineIdx = LINE_ROWS;
    for (const key of formData.keys()) {
      const m = key.match(/^line_t_sr_(\d+)$/);
      if (m) maxLineIdx = Math.max(maxLineIdx, parseInt(m[1], 10));
    }
    for (let i = 1; i <= maxLineIdx; i++) {
      const raw = (formData.get(`line_t_sr_${i}`) as string | null)?.trim() ?? "";
      const tSrNo = raw || null;
      const a = num(formData.get(`line_a_${i}`));
      const b = num(formData.get(`line_b_${i}`));
      const c = num(formData.get(`line_c_${i}`));
      const cp = num(formData.get(`line_cp_${i}`));
      const rej = num(formData.get(`line_rej_${i}`));
      const lengthMtrs = num(formData.get(`line_len_${i}`));
      if (tSrNo || a !== null || b !== null || c !== null || cp !== null || rej !== null || lengthMtrs !== null) {
        inLines.push({ i, tSrNo, a, b, c, cp, rej, lengthMtrs });
      }
    }
    const filledLineCount = inLines.length;
    const summedMtrs = inLines.reduce((acc, l) => acc + (l.lengthMtrs ?? 0), 0);
    if (data.thanQty != null && Math.round((data.thanQty as number) * 100) !== Math.round(filledLineCount * 100)) {
      const q = isUpdate ? `?id=${id}&error=than_count` : `?adding=1&error=than_count`;
      redirect("/inventory/grey-despatch" + q);
    }
    if (data.thanQty != null && Math.round(summedMtrs * 100) === 0 && data.thanQty > 0) {
      const q = isUpdate ? `?id=${id}&error=mtrs_zero` : `?adding=1&error=mtrs_zero`;
      redirect("/inventory/grey-despatch" + q);
    }
    // Optional explicit qty_mtrs form field (from live calc) may override; otherwise use summedMtrs.
    const declaredMtrs = num(formData.get("qty_mtrs_calc"));
    if (declaredMtrs != null && Math.round(declaredMtrs * 100) !== Math.round(summedMtrs * 100)) {
      const q = isUpdate ? `?id=${id}&error=mtrs_mismatch` : `?adding=1&error=mtrs_mismatch`;
      redirect("/inventory/grey-despatch" + q);
    }

    // Server-authoritative recompute — ignore any amnt/gst/further/amt_tot the
    // client submitted. Meters come from summedMtrs (Σ line lengths).
    const gstRate = num(formData.get("gst_rate")) ?? 0;
    const ftxRate = num(formData.get("ftx_rate")) ?? 0;
    const convRateVal = data.convRate ?? 0;
    const amntVal = round2(summedMtrs * convRateVal);
    const gstVal = round2((amntVal * gstRate) / 100);
    const furtherVal = round2((amntVal * ftxRate) / 100);
    const amtTotVal = round2(amntVal + gstVal + furtherVal);
    data.amnt = amntVal;
    data.gst = gstVal;
    data.further = furtherVal;
    data.amtTot = amtTotVal;

    const inputThanSerials = inLines.map((l) => l.tSrNo).filter((s): s is string => !!s);
    const seenSerials = new Set<string>();
    for (const s of inputThanSerials) {
      if (seenSerials.has(s)) {
        const q = isUpdate ? `?id=${id}&error=dup_than_line` : `?adding=1&error=dup_than_line`;
        redirect("/inventory/grey-despatch" + q);
      }
      seenSerials.add(s);
    }

    // For UPDATE we need to know which serials THIS voucher previously consumed so we
    // don't flag them as "used by another voucher". Fetch old lines up-front.
    let previouslyConsumed: string[] = [];
    if (isUpdate) {
      const oldLines = await db
        .select({ tSrNo: schema.intGreyDespatchLine.tSrNo })
        .from(schema.intGreyDespatchLine)
        .where(eq(schema.intGreyDespatchLine.despatchId, id));
      previouslyConsumed = oldLines
        .map((r) => (r.tSrNo as unknown as string | null))
        .filter((s): s is string => !!s);
    }
    if (inputThanSerials.length) {
      const existing = await db
        .select({ mm: schema.intDailyProductionSet.mmThanSrNo, dlv: schema.intDailyProductionSet.dlvStatus })
        .from(schema.intDailyProductionSet)
        .where(inArray(schema.intDailyProductionSet.mmThanSrNo, inputThanSerials));
      for (const row of existing) {
        if (!row.mm) continue;
        const isDelivered = row.dlv === "Y";
        const ours = previouslyConsumed.includes(row.mm);
        if (isDelivered && !ours) {
          const q = isUpdate ? `?id=${id}&error=than_used` : `?adding=1&error=than_used`;
          redirect("/inventory/grey-despatch" + q);
        }
      }
    }

    const [company] = await db
      .select({ currentFy: schema.companyProfile.currentFy })
      .from(schema.companyProfile)
      .limit(1);
    const fyCode = company?.currentFy ?? "";

    const partyRowsAll = await db
      .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
      .from(schema.chartOfAccounts)
      .where(sql`${schema.chartOfAccounts.level} >= 5`);
    const codeByDescGl = new Map(partyRowsAll.map((p) => [p.description, p.code]));
    const resolvePartyCoa = (partyDesc: string | null | undefined): string => {
      if (!partyDesc) return "";
      const s = partyDesc.trim();
      if (!s) return "";
      if (/^\d+(\.\d+)+$/.test(s)) return s;
      return codeByDescGl.get(s) ?? "";
    };
    const partyCoa = resolvePartyCoa(data.party);
    const greySaleAcc = await acc("GREY_SALE_INCOME");
    const gstOutAcc = await acc("GST_OUTPUT");
    const furtherTaxAcc = await acc("FURTHER_TAX");

    let uniqueError = false;
    let savedId: number | null = null;

    try {
      savedId = await db.transaction(async (tx) => {
        let did: number;
        let vno = 0;
        if (isUpdate) {
          if (data.lNo == null) {
            const [existingRow] = await tx
              .select({ lNo: schema.intGreyDespatch.lNo })
              .from(schema.intGreyDespatch)
              .where(eq(schema.intGreyDespatch.id, id));
            vno = Number(existingRow?.lNo ?? 0);
          } else {
            vno = data.lNo;
          }
          await tx.update(schema.intGreyDespatch).set(data).where(eq(schema.intGreyDespatch.id, id));
          did = id;
          // Reset dlvStatus for serials this voucher previously consumed before rewriting.
          if (previouslyConsumed.length) {
            await tx
              .update(schema.intDailyProductionSet)
              .set({ dlvStatus: null })
              .where(inArray(schema.intDailyProductionSet.mmThanSrNo, previouslyConsumed));
          }
          await tx.delete(schema.intGreyDespatchLine).where(eq(schema.intGreyDespatchLine.despatchId, did));
          await tx.delete(schema.intGreyDespatchUpdateCount).where(eq(schema.intGreyDespatchUpdateCount.despatchId, did));
        } else {
          const existing = await tx.select({ vNo: schema.intGreyDespatch.vNo }).from(schema.intGreyDespatch);
          const [lRowIn] = await tx
            .select({ m: sql<number>`COALESCE(MAX(${schema.intGreyDespatch.lNo}),0)` })
            .from(schema.intGreyDespatch);
          const nextLNo = Number(lRowIn?.m ?? 0) + 1;
          const providedVNo = txt(formData.get("v_no"));
          const vNo = providedVNo ?? nextVNoFromRows(existing, "IGD");
          const savedLNo = data.lNo ?? nextLNo;
          const [ins] = await tx
            .insert(schema.intGreyDespatch)
            .values({
              ...data,
              vNo,
              lNo: savedLNo,
              postedDate: new Date().toISOString(),
            })
            .returning({ id: schema.intGreyDespatch.id });
          did = ins.id;
          vno = savedLNo;
        }

        const lineValues: (typeof schema.intGreyDespatchLine.$inferInsert)[] = [];
        for (const l of inLines) {
          lineValues.push({
            despatchId: did,
            srNo: l.i,
            // SQLite has dynamic type affinity; we intentionally store the full mm/Than
            // Sr No text here so `dlvStatus` can be matched precisely.
            tSrNo: (l.tSrNo as unknown) as number | null,
            a: l.a,
            b: l.b,
            c: l.c,
            cp: l.cp,
            rej: l.rej,
            cpRej: l.cp != null || l.rej != null ? (l.cp ?? 0) + (l.rej ?? 0) : null,
            lengthMtrs: l.lengthMtrs,
          });
        }
        if (lineValues.length) await tx.insert(schema.intGreyDespatchLine).values(lineValues);

        // Mark than serials as delivered.
        if (inputThanSerials.length) {
          await tx
            .update(schema.intDailyProductionSet)
            .set({ dlvStatus: "Y" })
            .where(inArray(schema.intDailyProductionSet.mmThanSrNo, inputThanSerials));
        }

        const countValues: (typeof schema.intGreyDespatchUpdateCount.$inferInsert)[] = [];
        let maxCountIdx = COUNT_ROWS;
        for (const key of formData.keys()) {
          const mm = key.match(/^uc_code_(\d+)$/);
          if (mm) maxCountIdx = Math.max(maxCountIdx, parseInt(mm[1], 10));
        }
        for (let i = 1; i <= maxCountIdx; i++) {
          const countCode = txt(formData.get(`uc_code_${i}`));
          const countDescription = txt(formData.get(`uc_desc_${i}`));
          const type = txt(formData.get(`uc_type_${i}`));
          const calCount = num(formData.get(`uc_cal_${i}`));
          const ends = intVal(formData.get(`uc_ends_${i}`));
          const ratePerLbs = num(formData.get(`uc_rate_${i}`));
          const wtPerMtr = num(formData.get(`uc_wt_${i}`));
          const costPerMtr = num(formData.get(`uc_cost_${i}`));
          const totLbs = num(formData.get(`uc_tot_${i}`));
          const amount = num(formData.get(`uc_amt_${i}`));
          const typeRej = txt(formData.get(`uc_typerej_${i}`));
          if (
            countCode ||
            countDescription ||
            type ||
            calCount !== null ||
            ends !== null ||
            ratePerLbs !== null ||
            wtPerMtr !== null ||
            costPerMtr !== null ||
            totLbs !== null ||
            amount !== null ||
            typeRej
          ) {
            countValues.push({
              despatchId: did,
              countCode,
              countDescription,
              type,
              calCount,
              ends,
              ratePerLbs,
              wtPerMtr,
              costPerMtr,
              totLbs,
              amount,
              typeRej,
            });
          }
        }
        if (countValues.length) await tx.insert(schema.intGreyDespatchUpdateCount).values(countValues);

        if (partyCoa && fyCode && vno > 0) {
          await tx.delete(schema.transDetail).where(
            and(eq(schema.transDetail.vtype, VTYPE), eq(schema.transDetail.vno, vno))
          );
          await tx.delete(schema.transMain).where(
            and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.vno, vno))
          );

          await tx.insert(schema.transMain).values({
            fyCode,
            vtype: VTYPE,
            vno,
            vdate: data.vDate,
            accCode: partyCoa,
            narration: `GP#${data.gpNo ?? ""} ${data.party ?? ""}`.trim(),
            vtime: nowTime(),
            balanceAmount: data.amtTot,
          });

          const details: (typeof schema.transDetail.$inferInsert)[] = [];
          details.push({
            fyCode,
            vtype: VTYPE,
            vno,
            srno: 1,
            accCode: partyCoa,
            partyCode: partyCoa,
            contNo: data.convContNo,
            narration: `Grey despatch ${data.gpNo ?? ""}`.trim(),
            debit: data.amtTot ?? 0,
            credit: 0,
          });
          details.push({
            fyCode,
            vtype: VTYPE,
            vno,
            srno: 2,
            accCode: greySaleAcc,
            partyCode: partyCoa,
            debit: 0,
            credit: data.amnt ?? 0,
          });
          if ((data.gst ?? 0) > 0) {
            details.push({
              fyCode,
              vtype: VTYPE,
              vno,
              srno: 3,
              accCode: gstOutAcc,
              partyCode: partyCoa,
              debit: 0,
              credit: data.gst ?? 0,
            });
          }
          if ((data.further ?? 0) > 0) {
            details.push({
              fyCode,
              vtype: VTYPE,
              vno,
              srno: 4,
              accCode: furtherTaxAcc,
              partyCode: partyCoa,
              debit: 0,
              credit: data.further ?? 0,
            });
          }
          const totalDebit = details.reduce((s, x) => s + (x.debit ?? 0), 0);
          const totalCredit = details.reduce((s, x) => s + (x.credit ?? 0), 0);
          if (Math.abs(totalDebit - totalCredit) >= 0.01) throw new Error("Unbalanced voucher");
          await tx.insert(schema.transDetail).values(details);
        }

        return did;
      });
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? "");
      const errCode = String((e as { code?: string })?.code ?? "");
      if (msg.includes("UNIQUE") || errCode === "SQLITE_CONSTRAINT_UNIQUE") {
        uniqueError = true;
      } else {
        throw e;
      }
    }

    if (uniqueError) {
      const q = isUpdate ? `?id=${id}&error=code_exists` : `?adding=1&error=code_exists`;
      redirect("/inventory/grey-despatch" + q);
    }
    if (savedId === null) return;

    revalidatePath("/inventory/grey-despatch");
    redirect(`/inventory/grey-despatch?id=${savedId}`);
    } catch (e) {
      const err = e as { message?: string; digest?: string };
      if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
      const thru = parseLockedThroughFromError(err.message ?? "");
      if (thru) redirect(`/inventory/grey-despatch?error=period_locked&thru=${thru}`);
      throw e;
    }
  }

  async function deleteDespatch(formData: FormData) {
    "use server";
    const session = await getSession();
    if (session?.roleName !== "ADMIN") redirect("/inventory/grey-despatch?error=admin_only");
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
      const [voucherRow] = await tx
        .select({ lNo: schema.intGreyDespatch.lNo })
        .from(schema.intGreyDespatch)
        .where(eq(schema.intGreyDespatch.id, id));
      const vno = Number(voucherRow?.lNo ?? 0);
      if (vno > 0) {
        await tx.delete(schema.transDetail).where(
          and(eq(schema.transDetail.vtype, VTYPE), eq(schema.transDetail.vno, vno))
        );
        await tx.delete(schema.transMain).where(
          and(eq(schema.transMain.vtype, VTYPE), eq(schema.transMain.vno, vno))
        );
      }
      const oldLines = await tx
        .select({ tSrNo: schema.intGreyDespatchLine.tSrNo })
        .from(schema.intGreyDespatchLine)
        .where(eq(schema.intGreyDespatchLine.despatchId, id));
      const serials = oldLines
        .map((r) => (r.tSrNo as unknown as string | null))
        .filter((s): s is string => !!s);
      if (serials.length) {
        await tx
          .update(schema.intDailyProductionSet)
          .set({ dlvStatus: null })
          .where(inArray(schema.intDailyProductionSet.mmThanSrNo, serials));
      }
      await tx.delete(schema.intGreyDespatchLine).where(eq(schema.intGreyDespatchLine.despatchId, id));
      await tx.delete(schema.intGreyDespatchUpdateCount).where(eq(schema.intGreyDespatchUpdateCount.despatchId, id));
      await tx.delete(schema.intGreyDespatch).where(eq(schema.intGreyDespatch.id, id));
    });
    revalidatePath("/inventory/grey-despatch");
    redirect("/inventory/grey-despatch");
  }

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const totals = despatches.reduce(
    (a, d) => {
      a.than += d.thanQty ?? 0;
      a.amt += d.amtTot ?? 0;
      return a;
    },
    { than: 0, amt: 0 }
  );

  const gCls = "input-box mono text-[13px] py-1";
  const gCellNum = "input-box mono text-[13px] py-1 text-right";

  return (
    <Shell active="grey-despatch">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">GREY CLOTH DESPATCH (WVG)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {despatches.length} despatch{despatches.length === 1 ? "" : "es"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={despatches.map((d) => ({
              vNo: d.vNo,
              vDate: d.vDate,
              party: d.party,
              doParty: d.doParty,
              despatchTo: d.despatchTo,
              thanQty: d.thanQty,
              convRate: d.convRate,
              amtTot: d.amtTot,
              gpNo: d.gpNo,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "party", label: "Party" },
              { key: "doParty", label: "Do Party" },
              { key: "despatchTo", label: "Despatch To" },
              { key: "thanQty", label: "Than" },
              { key: "convRate", label: "Conv Rate" },
              { key: "amtTot", label: "Amt Tot" },
              { key: "gpNo", label: "GP No" },
            ]}
            filename="grey-cloth-despatch"
            sheetName="GreyDespatch"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-3">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{despatches.length}</div>
            <div className="stat-label">Total Despatches</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{formatNum(totals.than)}</div>
            <div className="stat-label">Total Than</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{formatNum(totals.amt)}</div>
            <div className="stat-label">Amt Total</div>
          </div>
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            V.No already exists. Try again.
          </div>
        )}
        {params.error === "than_used" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            One of the entered mm/Than Sr No values is already delivered on another despatch.
          </div>
        )}
        {params.error === "than_count" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Than/Qty must equal the number of filled line rows.
          </div>
        )}
        {params.error === "mtrs_zero" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Line lengths sum to zero — enter Length (Mtrs) on the line rows.
          </div>
        )}
        {params.error === "mtrs_mismatch" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            qty (Mtrs) does not equal Σ line lengths.
          </div>
        )}
        {params.error === "dup_than_line" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Duplicate mm/Than Sr No entered in line grid.
          </div>
        )}
        {params.error === "period_locked" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Period is locked. Cannot save for this date
            {params.thru && (
              <> — locked through <span className="mono">{params.thru}</span></>
            )}
            .
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can delete vouchers.
          </div>
        )}

        <form id="gd-find-form" method="GET" action="/inventory/grey-despatch" className="hidden"></form>

        {pendingContract && (
          <div className="border border-black mb-3">
            <div className="flex items-center justify-between px-4 py-2 border-b-2 border-black bg-gray-50">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                Pending Thans — contract {pendingContract} · party {pendingParty ?? "-"}
              </div>
              <div className="text-[10px] text-[var(--muted)] mono">
                {pendingThans.length} pending. Copy the mm/Than Sr No values into the line grid&apos;s T.Sr# column.
              </div>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: "30vh", overflowY: "auto" }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-yellow-50">
                    <th className="px-2 py-1 border-b border-black">mm/Than Sr No</th>
                    <th className="px-2 py-1 border-b border-black text-right">Total</th>
                    <th className="px-2 py-1 border-b border-black">Beam#</th>
                    <th className="px-2 py-1 border-b border-black">Set#</th>
                    <th className="px-2 py-1 border-b border-black">Prod V.No</th>
                    <th className="px-2 py-1 border-b border-black">Prod Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingThans.map((p) => (
                    <tr key={p.mm ?? ""}>
                      <td className="px-2 py-0.5 mono font-bold">{p.mm}</td>
                      <td className="px-2 py-0.5 mono text-right">{p.totalCount ?? "-"}</td>
                      <td className="px-2 py-0.5 mono">{p.beamNo ?? "-"}</td>
                      <td className="px-2 py-0.5 mono">{p.setHash ?? "-"}</td>
                      <td className="px-2 py-0.5 mono">{p.vNo}</td>
                      <td className="px-2 py-0.5 mono">{p.vDate}</td>
                    </tr>
                  ))}
                  {pendingThans.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-[12px] text-[var(--muted)] py-4">
                        No pending thans for this contract&apos;s party.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="border border-black p-4 mb-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — GREY CLOTH DESPATCH (WVG)"
                : formItem
                ? `Edit — ${formItem.vNo}`
                : "GREY CLOTH DESPATCH (WVG)"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/grey-despatch?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="gd-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              <a href="/inventory/grey-despatch" className="btn btn-outline btn-sm">Exit</a>
              {formItem ? (
                <form action={deleteDespatch} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <ConfirmButton message={`Delete despatch ${formItem.vNo}? This releases its consumed than serials.`}>Delete</ConfirmButton>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled
                  title="Save the despatch first to enable delete"
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          <form id="gd-save-form" action={saveDespatch}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}
            <DespatchAmountCalc countRows={COUNT_ROWS} lineRows={LINE_ROWS} />
            <CountGridFiller contractRows={contractRowsByContNo} rows={COUNT_ROWS} />
            <AutoFill
              watch="conv_cont_no"
              map={contractFillMap}
              combos={["party", "do_party"]}
              inputs={["conv_rate", "design_no", "grey_code", "width", "product_brand", "loom_type", "ft_weave", "gst_rate", "ftx_rate"]}
            />
            <input type="hidden" name="qty_mtrs_calc" defaultValue="" />
            <input type="hidden" name="than_qty_calc" defaultValue="" />
            <datalist id="thans-list">
              {pendingThans.map((t) => (
                <option key={t.mm ?? ""} value={t.mm ?? ""}>
                  {t.beamNo ?? ""} · {t.totalCount ?? 0}m · {t.vNo}
                </option>
              ))}
            </datalist>
            <datalist id="supervisors-list">
              {priorSup.map((r) => (
                <option key={r.v ?? ""} value={r.v ?? ""} />
              ))}
            </datalist>
            <datalist id="vehicles-list">
              {priorVeh.map((r) => (
                <option key={r.v ?? ""} value={r.v ?? ""} />
              ))}
            </datalist>
            <datalist id="drivers-list">
              {priorDrv.map((r) => (
                <option key={r.v ?? ""} value={r.v ?? ""} />
              ))}
            </datalist>
            <datalist id="gp-list">
              {priorGp.map((r) => (
                <option key={r.v ?? ""} value={r.v ?? ""} />
              ))}
            </datalist>
            <datalist id="sheds-list">
              {shedList.map((r) => (
                <option key={r.v ?? ""} value={r.v ?? ""} />
              ))}
            </datalist>
            <datalist id="gd-yarn-counts">
              {yarnCountList.map((c) => (
                <option key={c.countCode} value={c.countCode}>{c.countCode} — {c.description}{c.type ? ` ${c.type}` : ""}</option>
              ))}
            </datalist>
            <datalist id="gd-blends">
              {blendList.map((b) => (
                <option key={b.description} value={b.description} />
              ))}
            </datalist>
            <datalist id="gd-brands">
              {brandList.map((b) => (
                <option key={b.name} value={b.name} />
              ))}
            </datalist>
            {Array.from({ length: 12 }, (_, k) => k + 1).map((i) => (
              <RowAutoFill key={`uc-cf-${i}`} watch={`uc_code_${i}`} map={ucCountFillMap} />
            ))}

            <div className="grid grid-cols-12 gap-3 mb-2">
              <div className="col-span-2">
                <label className="label block mb-1">Date</label>
                <input name="v_date" type="date" className="input-box mono" defaultValue={formItem?.vDate ?? today()} required />
              </div>
              <div className="col-span-1">
                <label className="label block mb-1">Time</label>
                <input name="time" className="input-box mono" defaultValue={formItem?.time ?? nowTime()} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">V.No</label>
                <input name="v_no" className="input-box mono bg-gray-100" defaultValue={formItem?.vNo ?? upcomingVNo} readOnly />
              </div>
              <div className="col-span-1">
                <label className="label block mb-1">LNo</label>
                <input name="l_no" type="number" className="input-box mono bg-gray-100 text-center" defaultValue={formItem?.lNo ?? maxLNo} readOnly tabIndex={-1} />
              </div>
              <div className="col-span-1 flex items-end">
                <button type="button" className="btn btn-outline btn-sm w-full" title="Clear OK">OK</button>
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Posted Date</label>
                <input className="input-box mono bg-gray-100 text-[11px]" defaultValue={formItem?.postedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Find</label>
                <div className="flex gap-2">
                  <input form="gd-find-form" name="find" className="input-box mono flex-1" defaultValue={params.find ?? ""} placeholder="V.No / party / GP" />
                  <button form="gd-find-form" type="submit" className="btn btn-outline btn-sm">Find</button>
                </div>
              </div>
            </div>

            <div className="border border-black p-3 mb-2 bg-gray-50">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">DO-DETAIL</div>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-2">
                  <label className="label block mb-1">V.No From</label>
                  <input name="do_v_no_from" className="input-box mono" defaultValue={formItem?.doVNoFrom ?? ""} />
                </div>
                <div className="col-span-2">
                  <label className="label block mb-1">V.No To</label>
                  <input name="do_v_no_to" className="input-box mono" defaultValue={formItem?.doVNoTo ?? ""} />
                </div>
                <div className="col-span-6">
                  <label className="label block mb-1">Set All Than / Prd# / Set#</label>
                  <input name="set_hash_all_than_prd_hash_set_hash" className="input-box mono" defaultValue={formItem?.setHashAllThanPrdHashSetHash ?? ""} />
                </div>
                <div className="col-span-2 flex items-end">
                  <button type="button" className="btn btn-outline btn-sm w-full">DO-DETAIL</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-4 mb-2">
              <div className="col-span-7">
                <div className="border border-black">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-yellow-50">
                        <th className="px-1 py-1 border-b border-black" style={{ width: 32 }}>Sr#</th>
                        <th className="px-1 py-1 border-b border-black">T.Sr#</th>
                        <th className="px-1 py-1 border-b border-black text-right">A</th>
                        <th className="px-1 py-1 border-b border-black text-right">B</th>
                        <th className="px-1 py-1 border-b border-black text-right">C</th>
                        <th className="px-1 py-1 border-b border-black text-right">CP</th>
                        <th className="px-1 py-1 border-b border-black text-right">Rej</th>
                        <th className="px-1 py-1 border-b border-black text-right">Length (Mtrs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineGrid.map((r, idx) => {
                        const i = idx + 1;
                        const cpDefault = r?.cp ?? (r?.cpRej != null && r?.rej == null ? r.cpRej : "");
                        const rejDefault = r?.rej ?? "";
                        return (
                          <tr key={i}>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-center">{i}</td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name={`line_t_sr_${i}`} type="text" list="thans-list" className={gCls} defaultValue={(r?.tSrNo as unknown as string) ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name={`line_a_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.a ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name={`line_b_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.b ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name={`line_c_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.c ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name={`line_cp_${i}`} type="number" step="any" className={gCellNum} defaultValue={cpDefault} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name={`line_rej_${i}`} type="number" step="any" className={gCellNum} defaultValue={rejDefault} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name={`line_len_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.lengthMtrs ?? ""} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-1">
                  {LINE_ROWS} rows. Empty rows are ignored on save.
                </div>
              </div>

              <div className="col-span-5 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1">Despatch To</label>
                    <input name="despatch_to" className="input-box mono text-[12px]" defaultValue={formItem?.despatchTo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Despatch Location</label>
                    <input name="despatch_location" className="input-box mono text-[12px]" defaultValue={formItem?.despatchLocation ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1">Despatch From</label>
                    <input name="despatch_from" className="input-box mono text-[12px]" defaultValue={formItem?.despatchFrom ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">
                      Conv.Cont No <span className="text-[9px] text-[var(--muted)]">F9</span>
                    </label>
                    <Combobox
                      name="conv_cont_no"
                      options={contractOpts}
                      defaultValue={formItem?.convContNo ?? ""}
                      placeholder="Select conv contract"
                      className="input-box mono text-[12px]"
                      filterByField="party"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="label block mb-1">Post Lot No</label>
                    <input name="post_lot_no" className="input-box mono text-[12px]" defaultValue={formItem?.postLotNo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Type</label>
                    <select name="type" className="input-box mono text-[12px]" defaultValue={formItem?.type ?? "FRS"}>
                      <option value="FRS">FRS</option>
                      <option value="REJ">REJ</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Shed No</label>
                    <input name="shed_no" list="sheds-list" className="input-box mono text-[12px]" defaultValue={formItem?.shedNo ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1">Party</label>
                    <Combobox name="party" options={partyOpts} defaultValue={formItem?.party ?? ""} placeholder="Select party" className="input-box mono text-[12px]" />
                  </div>
                  <div>
                    <label className="label block mb-1">Do Party</label>
                    <Combobox name="do_party" options={partyOpts} defaultValue={formItem?.doParty ?? ""} placeholder="Select do party" className="input-box mono text-[12px]" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="label block mb-1">Than / Qty</label>
                    <input name="than_qty" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue={formItem?.thanQty ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Conv Rate</label>
                    <input name="conv_rate" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue={formItem?.convRate ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Amnt</label>
                    <input name="amnt" type="number" step="any" className="input-box mono text-right text-[12px] bg-gray-100" defaultValue={formItem?.amnt ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="label block mb-1">GST %</label>
                    <input name="gst_rate" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue="0" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="label block mb-1">Ftx %</label>
                    <input name="ftx_rate" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue="0" />
                  </div>
                  <div>
                    <label className="label block mb-1">GST</label>
                    <input name="gst" type="number" step="any" className="input-box mono text-right text-[12px] bg-gray-100" defaultValue={formItem?.gst ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="label block mb-1">Further</label>
                    <input name="further" type="number" step="any" className="input-box mono text-right text-[12px] bg-gray-100" defaultValue={formItem?.further ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="label block mb-1">Amt Tot</label>
                    <input name="amt_tot" type="number" step="any" className="input-box mono text-right text-[12px] bg-red-50" defaultValue={formItem?.amtTot ?? ""} readOnly tabIndex={-1} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1">GP No</label>
                    <input name="gp_no" list="gp-list" className="input-box mono text-[12px]" defaultValue={formItem?.gpNo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">GP Date</label>
                    <input name="gp_date" type="date" className="input-box mono text-[12px]" defaultValue={formItem?.gpDate ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1">Date From</label>
                    <input name="date_from" type="date" className="input-box mono text-[12px]" defaultValue={formItem?.dateFrom ?? "2020-11-01"} />
                  </div>
                  <div>
                    <label className="label block mb-1">Date To</label>
                    <input name="date_to" type="date" className="input-box mono text-[12px]" defaultValue={formItem?.dateTo ?? today()} />
                  </div>
                </div>
                <div className="flex items-end gap-2 pt-1">
                  <button type="button" className="btn btn-outline btn-sm">Post Lot No</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-3 mb-3">
              <div className="col-span-2">
                <label className="label block mb-1">F.T Weave</label>
                <input name="ft_weave" className="input-box mono text-[12px]" defaultValue={formItem?.ftWeave ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Design No</label>
                <input name="design_no" className="input-box mono text-[12px]" defaultValue={formItem?.designNo ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">L.B/Mtr</label>
                <input name="lb_mtr" type="number" step="any" className="input-box mono text-[12px] text-right" defaultValue={formItem?.lbMtr ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">
                  Brk Code <span className="text-[9px] text-[var(--muted)]">F9</span>
                </label>
                <Combobox name="enc_code" options={partyOpts} defaultValue={formItem?.encCode ?? ""} placeholder="Select party" className="input-box mono text-[12px]" />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Supervisor</label>
                <input name="supervisor" list="supervisors-list" className="input-box mono text-[12px]" defaultValue={formItem?.supervisor ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Vehicle No</label>
                <input name="vehicle_no" list="vehicles-list" className="input-box mono text-[12px]" defaultValue={formItem?.vehicleNo ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Driver</label>
                <input name="driver" list="drivers-list" className="input-box mono text-[12px]" defaultValue={formItem?.driver ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Trans Adda</label>
                <input name="trans_adda" className="input-box mono text-[12px]" defaultValue={formItem?.transAdda ?? ""} />
              </div>

              <div className="col-span-3">
                <label className="label block mb-1">Silvag Quality</label>
                <select name="silvag_quality" className="input-box mono text-[12px]" defaultValue={formItem?.silvagQuality ?? ""}>
                  <option value="">—</option>
                  {SELV_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  {formItem?.silvagQuality && !SELV_TYPES.includes(formItem.silvagQuality) && (
                    <option value={formItem.silvagQuality}>{formItem.silvagQuality}</option>
                  )}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Brkg Per Mtr</label>
                <input name="brkg_per_mtr" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue={formItem?.brkgPerMtr ?? ""} />
              </div>
              <div className="col-span-1">
                <label className="label block mb-1">%age</label>
                <input name="age_percent" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue={formItem?.agePercent ?? ""} />
              </div>
              <div className="col-span-1">
                <label className="label block mb-1">Comm</label>
                <input name="comm" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue={formItem?.comm ?? ""} />
              </div>
              <div className="col-span-5">
                <label className="label block mb-1">Product Brand</label>
                <input name="product_brand" list="gd-brands" className="input-box mono text-[12px]" defaultValue={formItem?.productBrand ?? ""} />
              </div>

              <div className="col-span-3">
                <label className="label block mb-1">Loom Type</label>
                <select name="loom_type" className="input-box mono text-[12px]" defaultValue={formItem?.loomType ?? ""}>
                  <option value="">—</option>
                  {LOOM_TYPES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  {formItem?.loomType && !LOOM_TYPES.includes(formItem.loomType) && (
                    <option value={formItem.loomType}>{formItem.loomType}</option>
                  )}
                </select>
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Blend</label>
                <input name="blend" list="gd-blends" className="input-box mono text-[12px]" defaultValue={formItem?.blend ?? ""} />
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Gray Code</label>
                <GreyQualityPicker name="grey_code" defaultValue={formItem?.greyCode ?? ""} rows={greyPickerRows} countLabels={greyCountLabels} />
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Width</label>
                <input name="width" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue={formItem?.width ?? ""} />
              </div>

              <div className="col-span-12">
                <label className="label block mb-1">Remarks</label>
                <input name="remarks" className="input-box text-[12px]" defaultValue={formItem?.remarks ?? ""} />
              </div>
            </div>

            <div className="border border-black">
              <div className="bg-gray-100 border-b border-black px-3 py-1 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.1em] font-bold">Update Count</div>
                <div className="text-[10px] text-[var(--muted)] mono">
                  Ycg Lotno
                  <input name="update_count_block" className="input-box mono ml-2 text-[11px]" style={{ display: "inline-block", width: 140, padding: "2px 4px" }} defaultValue={formItem?.updateCountBlock ?? ""} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-1 py-1 border-b border-black">Count Code</th>
                      <th className="px-1 py-1 border-b border-black">Count Description</th>
                      <th className="px-1 py-1 border-b border-black">Type</th>
                      <th className="px-1 py-1 border-b border-black text-right">Cal Count</th>
                      <th className="px-1 py-1 border-b border-black text-right">Ends</th>
                      <th className="px-1 py-1 border-b border-black text-right">Rate Per Lbs</th>
                      <th className="px-1 py-1 border-b border-black text-right">WT Per Mtr</th>
                      <th className="px-1 py-1 border-b border-black text-right">Cost Per Mtr</th>
                      <th className="px-1 py-1 border-b border-black text-right">TOT Lbs</th>
                      <th className="px-1 py-1 border-b border-black text-right">Amount</th>
                      <th className="px-1 py-1 border-b border-black">Type Rej</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countGrid.map((r, idx) => {
                      const i = idx + 1;
                      return (
                        <tr key={i}>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_code_${i}`} list="gd-yarn-counts" className={gCls} defaultValue={r?.countCode ?? ""} style={{ width: 60 }} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_desc_${i}`} className={gCls} defaultValue={r?.countDescription ?? ""} readOnly tabIndex={-1} style={{ minWidth: 140, background: "#f3f4f6" }} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_type_${i}`} className={gCls} defaultValue={r?.type ?? ""} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_cal_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.calCount ?? ""} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_ends_${i}`} type="number" step="1" className={gCellNum} defaultValue={r?.ends ?? ""} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_rate_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.ratePerLbs ?? ""} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_wt_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.wtPerMtr ?? ""} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_cost_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.costPerMtr ?? ""} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_tot_${i}`} type="number" step="any" className={`${gCellNum} bg-gray-100`} defaultValue={r?.totLbs ?? ""} readOnly tabIndex={-1} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_amt_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.amount ?? ""} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_typerej_${i}`} className={gCls} defaultValue={r?.typeRej ?? ""} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-end gap-2 mt-5 flex-wrap">
              <button type="submit" className="btn btn-sm">Save</button>
              <a href="/inventory/grey-despatch?adding=1" className="btn btn-outline btn-sm">New</a>
              <PrintButton />
              <a href="/inventory/grey-despatch" className="btn btn-outline btn-sm">Exit</a>
              <div className="ml-auto flex items-end gap-2">
                <div>
                  <label className="label block mb-1">Password</label>
                  <input className="input-box mono" placeholder="password" type="password" />
                </div>
                {formItem ? (
                  <form action={deleteDespatch} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message={`Delete despatch ${formItem.vNo}? This releases its consumed than serials.`}>Delete</ConfirmButton>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled
                    title="Save the despatch first to enable delete"
                    style={{ opacity: 0.5, cursor: "not-allowed" }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            Despatch Records
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>Date</th>
                  <th>Party</th>
                  <th>Do Party</th>
                  <th>Despatch To</th>
                  <th className="text-right">Than</th>
                  <th className="text-right">Conv Rate</th>
                  <th className="text-right">Amt Tot</th>
                  <th>GP No</th>
                  <th>Vehicle</th>
                  <th className="text-right">Chalan</th>
                  <th className="text-right">Notify</th>
                </tr>
              </thead>
              <tbody>
                {despatches.map((d) => {
                  const isSel = d.id === selected?.id;
                  const href = `/inventory/grey-despatch?id=${d.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={d.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono font-bold text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{d.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{d.vDate}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>
                        <div>{d.party ?? "-"}</div>
                        {d.party && partyCodeByDesc.get(d.party) && (
                          <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(d.party)}</div>
                        )}
                      </a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>
                        <div>{d.doParty ?? "-"}</div>
                        {d.doParty && partyCodeByDesc.get(d.doParty) && (
                          <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(d.doParty)}</div>
                        )}
                      </a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{d.despatchTo ?? "-"}</a></td>
                      <td className="text-right mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(d.thanQty)}</a></td>
                      <td className="text-right mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(d.convRate)}</a></td>
                      <td className="text-right mono text-[13px] font-bold"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(d.amtTot)}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{d.gpNo ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{d.vehicleNo ?? "-"}</a></td>
                      <td className="text-right">
                        <a
                          href={`/inventory/grey-despatch/${d.id}/chalan`}
                          target="_blank"
                          className="btn btn-outline btn-sm"
                        >
                          Chalan
                        </a>
                      </td>
                      <td className="text-right">
                        <WhatsAppModal
                          party={d.party ?? d.doParty ?? "-"}
                          despatchNo={d.vNo}
                          date={d.vDate}
                          vehicleNo={d.vehicleNo}
                          meters={metersById.get(d.id) ?? null}
                          rolls={d.thanQty}
                        />
                      </td>
                    </tr>
                  );
                })}
                {despatches.length === 0 && (
                  <tr>
                    <td colSpan={12} className="text-center text-[13px] text-[var(--muted)] py-6">
                      No despatches. Click <b>New</b> to create one.
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
