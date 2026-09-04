import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { RowAutoFill, AutoFill } from "@/components/auto-fill";
import { FindingPicker } from "@/components/finding-picker";
import { ProductionSetCalc } from "@/components/production-calc";
import { ThanSerialLive } from "@/components/than-serial-live";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today, nowTime } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num, intVal, txt, escLike } from "@/lib/form";

export const dynamic = "force-dynamic";

const SET_ROWS = 3;
const DETAIL_ROWS = 3;

const SELV_OPTIONS = ["LENO", "PLAIN", "TAPE", "CATCH", "TUCK-IN"];

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export default async function DailyProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";

  const findFilter = params.find?.trim();
  const escFind = findFilter != null ? escLike(findFilter) : undefined;
  const pat = escFind ? `%${escFind}%` : "";

  const list = findFilter
    ? await db
        .select()
        .from(schema.intDailyProduction)
        .where(sql`
          ${schema.intDailyProduction.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intDailyProduction.shedNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intDailyProduction.setNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intDailyProduction.designNo} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intDailyProduction.id))
    : await db.select().from(schema.intDailyProduction).orderBy(desc(schema.intDailyProduction.id));

  const selected = isEditing ? list.find((r) => r.id === idParam) ?? null : null;
  const editing = isAdding ? null : selected;

  const setRows = editing
    ? await db
        .select()
        .from(schema.intDailyProductionSet)
        .where(eq(schema.intDailyProductionSet.productionId, editing.id))
        .orderBy(schema.intDailyProductionSet.srNo)
    : [];

  const detailRows = editing
    ? await db
        .select()
        .from(schema.intDailyProductionDetail)
        .where(eq(schema.intDailyProductionDetail.productionId, editing.id))
        .orderBy(schema.intDailyProductionDetail.srNo)
    : [];

  const maxRow = await db
    .select({
      maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intDailyProduction.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.intDailyProduction)
    .where(sql`${schema.intDailyProduction.vNo} LIKE 'IDP-%'`);
  const nextNum = (maxRow[0]?.maxNum ?? 0) + 1;
  const upcomingVNo = `IDP-${String(nextNum).padStart(4, "0")}`;

  const beamStatusList = await db.select().from(schema.beamStatuses).orderBy(schema.beamStatuses.status);
  const beamCatalog = await db
    .select({
      beamNo: schema.beams.beamNo,
      ends: schema.beams.ends,
      length: schema.beams.length,
      beamSetNo: schema.beams.beamSetNo,
      setNo: schema.beams.setNo,
      setStatus: schema.beams.setStatus,
      statusWrk: schema.beams.statusWrk,
      contractNo: schema.beams.contractNo,
      loomNo: schema.beams.loomNo,
      knVno: schema.beams.knVno,
    })
    .from(schema.beams)
    .orderBy(schema.beams.beamNo);

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);
  const partyOpts = parties.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));

  const productList = await db
    .select({ code: schema.products.code, description: schema.products.description })
    .from(schema.products)
    .orderBy(schema.products.code);
  const productOpts = productList.map((p) => ({ value: String(p.code), label: `${p.code} — ${p.description}` }));

  const constructionList = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description, width: schema.greyConstruction.width })
    .from(schema.greyConstruction)
    .orderBy(schema.greyConstruction.code);
  const qualityOpts = constructionList.map((c) => ({
    value: c.description,
    label: c.width ? `${c.code} — ${c.width}" ${c.description}` : `${c.code} — ${c.description}`,
  }));

  const brandList = await db
    .select({ name: schema.yarnBrands.name })
    .from(schema.yarnBrands)
    .orderBy(schema.yarnBrands.name);

  const shedRows = await db
    .selectDistinct({ shed: schema.looms.shed })
    .from(schema.looms)
    .orderBy(schema.looms.shed);
  const shedList = shedRows.map((s) => s.shed).filter((s): s is string => !!s);

  // Per-beam accumulated Rcvd/Mtr = Σ(totalCount + rejCount) across ALL saved production
  // (excluding the current voucher so the live client math can add this row's own numbers).
  const accumRowsRaw = editing
    ? await db
        .select({
          beamNo: schema.intDailyProductionSet.beamNo,
          total: sql<number>`COALESCE(SUM(COALESCE(${schema.intDailyProductionSet.totalCount},0) + COALESCE(${schema.intDailyProductionSet.rejCount},0)),0)`,
        })
        .from(schema.intDailyProductionSet)
        .where(
          and(
            isNotNull(schema.intDailyProductionSet.beamNo),
            ne(schema.intDailyProductionSet.productionId, editing.id)
          )
        )
        .groupBy(schema.intDailyProductionSet.beamNo)
    : await db
        .select({
          beamNo: schema.intDailyProductionSet.beamNo,
          total: sql<number>`COALESCE(SUM(COALESCE(${schema.intDailyProductionSet.totalCount},0) + COALESCE(${schema.intDailyProductionSet.rejCount},0)),0)`,
        })
        .from(schema.intDailyProductionSet)
        .where(isNotNull(schema.intDailyProductionSet.beamNo))
        .groupBy(schema.intDailyProductionSet.beamNo);

  const beamStats: Record<string, { rcvd: number; length: number | null }> = {};
  for (const b of beamCatalog) {
    if (b.beamNo) beamStats[b.beamNo] = { rcvd: 0, length: b.length ?? null };
  }
  for (const r of accumRowsRaw) {
    if (!r.beamNo) continue;
    if (!beamStats[r.beamNo]) beamStats[r.beamNo] = { rcvd: 0, length: null };
    beamStats[r.beamNo].rcvd = Number(r.total ?? 0);
  }

  const beamFillMap: Record<string, Record<string, string | number | null>> = {};
  for (const b of beamCatalog) {
    if (!b.beamNo) continue;
    beamFillMap[b.beamNo] = {
      ends: b.ends ?? null,
      bLength: b.length ?? null,
      beamSetNo: b.beamSetNo ?? null,
      setHash: b.setNo ?? null,
      beamStatus: b.statusWrk ?? null,
      contNo: b.contractNo ?? null,
    };
  }

  // Mounted (RUNNING) beams — the SET NO LIST + loom→beam source.
  const runningBeams = beamCatalog.filter((b) => (b.statusWrk ?? "").toUpperCase() === "RUNNING");
  const beamPickerRows = runningBeams.map((b) => ({
    value: b.beamNo as string,
    code: b.beamNo as string,
    description: b.setNo ?? b.beamSetNo ?? "",
    cells: {
      beamSetNo: b.beamSetNo ?? "",
      setNo: b.setNo ?? "",
      beamNo: b.beamNo ?? "",
      setStatus: b.setStatus ?? "",
      statusWrk: b.statusWrk ?? "",
      ends: b.ends ?? "",
      beamLength: b.length ?? "",
      contNo: b.contractNo ?? "",
    },
  }));
  const beamCols = [
    { key: "beamSetNo", label: "Beam Set", width: 90 },
    { key: "setNo", label: "Set No", width: 70 },
    { key: "beamNo", label: "Beam No", width: 80 },
    { key: "setStatus", label: "Set Status", width: 90 },
    { key: "statusWrk", label: "Wrk", width: 80 },
    { key: "ends", label: "Ends", width: 70, align: "right" as const },
    { key: "beamLength", label: "Length", width: 75, align: "right" as const },
    { key: "contNo", label: "Cont No", width: 100 },
  ];
  const beamByLoom = new Map<number, (typeof runningBeams)[number]>();
  for (const b of runningBeams) if (b.loomNo != null && !beamByLoom.has(b.loomNo)) beamByLoom.set(b.loomNo, b);

  // Loom LOV (shed-scoped via filterKey) + fill map from each loom's RUNNING beam.
  const loomRows2 = await db
    .select({ loomNo: schema.looms.loomNo, shed: schema.looms.shed, rpm: schema.looms.rpm, statusWrk: schema.looms.statusWrk, currentContract: schema.looms.currentContract })
    .from(schema.looms)
    .orderBy(schema.looms.shed, schema.looms.loomNo);
  const loomPickerRows = loomRows2.map((lm) => {
    const b = beamByLoom.get(lm.loomNo);
    return {
      value: String(lm.loomNo),
      code: String(lm.loomNo),
      description: `Shed ${lm.shed}`,
      filterKey: lm.shed ?? "",
      cells: { loomNo: lm.loomNo, shed: lm.shed ?? "", rpm: lm.rpm ?? "", status: lm.statusWrk ?? "", beamNo: b?.beamNo ?? "", contNo: (lm.currentContract ?? b?.contractNo) ?? "" },
    };
  });
  const loomCols = [
    { key: "loomNo", label: "Loom", width: 60 },
    { key: "shed", label: "Shed", width: 60 },
    { key: "rpm", label: "RPM", width: 55, align: "right" as const },
    { key: "status", label: "Status", width: 85 },
    { key: "beamNo", label: "Beam", width: 85 },
    { key: "contNo", label: "Contract", width: 100 },
  ];
  const loomFillMap: Record<string, Record<string, string | number | null>> = {};
  for (const lm of loomRows2) {
    const b = beamByLoom.get(lm.loomNo);
    loomFillMap[String(lm.loomNo)] = {
      beamNo: b?.beamNo ?? null,
      beamSetNo: b?.beamSetNo ?? null,
      setHash: b?.setNo ?? null,
      beamStatus: b ? (b.statusWrk ?? "RUNNING") : null,
      ends: b?.ends ?? null,
      bLength: b?.length ?? null,
      contNo: (lm.currentContract ?? b?.contractNo) ?? null,
    };
  }

  // Grey conversion contract LOV (header) → product quality / brand / party.
  const convContracts = await db
    .select({
      id: schema.intGreyConversionContract.id,
      contNo: schema.intGreyConversionContract.contNo,
      party: schema.intGreyConversionContract.party,
      designNo: schema.intGreyConversionContract.designNo,
      productName: schema.intGreyConversionContract.productName,
      productQuality: schema.intGreyConversionContract.productQuality,
      grayQltyCode: schema.intGreyConversionContract.grayQltyCode,
      width: schema.intGreyConversionContract.width,
      read: schema.intGreyConversionContract.read,
      pick: schema.intGreyConversionContract.pick,
      qtyMtr: schema.intGreyConversionContract.qtyMtr,
    })
    .from(schema.intGreyConversionContract)
    .where(eq(schema.intGreyConversionContract.status, "R"))
    .orderBy(desc(schema.intGreyConversionContract.contDate));
  const warpBrandRows = await db
    .select({ contractId: schema.intGreyConversionWarp.contractId, brand: schema.intGreyConversionWarp.brand })
    .from(schema.intGreyConversionWarp);
  const brandByContract = new Map<number, string>();
  for (const w of warpBrandRows) if (w.brand && !brandByContract.has(w.contractId)) brandByContract.set(w.contractId, w.brand);
  const contractPickerRows = convContracts.map((c) => {
    const q = c.productQuality ?? c.productName ?? c.grayQltyCode ?? "";
    return {
      value: c.contNo,
      code: c.contNo,
      description: q,
      cells: {
        contNo: c.contNo,
        party: c.party ?? "",
        designNo: c.designNo ?? "",
        product: q,
        width: c.width ?? "",
        readPick: c.read != null && c.pick != null ? `${c.read}×${c.pick}` : "",
        qty: c.qtyMtr ?? "",
        brand: brandByContract.get(c.id) ?? "",
      },
    };
  });
  const contractCols = [
    { key: "contNo", label: "Cont No", width: 90 },
    { key: "party", label: "Party", width: 150 },
    { key: "designNo", label: "Design", width: 80 },
    { key: "product", label: "Product/Quality", width: 150 },
    { key: "width", label: "Width", width: 55, align: "right" as const },
    { key: "readPick", label: "R×P", width: 75 },
    { key: "qty", label: "Qty", width: 70, align: "right" as const },
    { key: "brand", label: "Brand", width: 100 },
  ];
  const contractFillMap: Record<string, Record<string, string | number | null>> = {};
  for (const c of convContracts) {
    contractFillMap[c.contNo] = {
      productQuality: c.productQuality ?? c.productName ?? c.grayQltyCode ?? "",
      productBrand: brandByContract.get(c.id) ?? "",
      convContParty: c.party ?? "",
    };
  }

  // Folding stock = Σ(totalCount) − Σ(despatched meters) for the voucher's conv party.
  let foldingStockCalc: number | null = null;
  if (editing?.convContParty) {
    const partyName = editing.convContParty;
    const prodSumRow = await db
      .select({
        s: sql<number>`COALESCE(SUM(COALESCE(${schema.intDailyProductionSet.totalCount},0)),0)`,
      })
      .from(schema.intDailyProductionSet)
      .innerJoin(
        schema.intDailyProduction,
        eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id)
      )
      .where(eq(schema.intDailyProduction.convContParty, partyName));
    const despSumRow = await db
      .select({
        s: sql<number>`COALESCE(SUM(COALESCE(${schema.intGreyDespatchLine.lengthMtrs},0)),0)`,
      })
      .from(schema.intGreyDespatchLine)
      .innerJoin(
        schema.intGreyDespatch,
        eq(schema.intGreyDespatchLine.despatchId, schema.intGreyDespatch.id)
      )
      .where(eq(schema.intGreyDespatch.party, partyName));
    foldingStockCalc = Number(prodSumRow[0]?.s ?? 0) - Number(despSumRow[0]?.s ?? 0);
  }

  // LV.No display = last saved max lvNo across all vouchers.
  const lvRow = await db
    .select({ m: sql<number>`COALESCE(MAX(${schema.intDailyProduction.lvNo}),0)` })
    .from(schema.intDailyProduction);
  const maxLvNo = Number(lvRow[0]?.m ?? 0);

  // Next mm/Than serial for the current month — drives the live per-row serials.
  const nowD = new Date();
  const thanPrefix = `${MONTH_ABBR[nowD.getMonth()] ?? "JAN"}-`;
  const thanSuffix = `-${String(nowD.getFullYear()).slice(-2)}`;
  const [thanMaxRow] = await db
    .select({
      m: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intDailyProductionSet.mmThanSrNo}, ${thanPrefix.length + 1}, LENGTH(${schema.intDailyProductionSet.mmThanSrNo}) - ${thanPrefix.length + thanSuffix.length}) AS INTEGER)), 0)`,
    })
    .from(schema.intDailyProductionSet)
    .where(sql`${schema.intDailyProductionSet.mmThanSrNo} LIKE ${`${thanPrefix}%${thanSuffix}`}`);
  const thanBase = Number(thanMaxRow?.m ?? 0) + 1;

  const totalRowsList = list.map((r) => ({ id: r.id }));

  const rowTotals = new Map<number, number>();
  if (totalRowsList.length) {
    const allSets = await db
      .select({
        productionId: schema.intDailyProductionSet.productionId,
        totalCount: schema.intDailyProductionSet.totalCount,
      })
      .from(schema.intDailyProductionSet);
    for (const s of allSets) {
      rowTotals.set(s.productionId, (rowTotals.get(s.productionId) ?? 0) + (s.totalCount ?? 0));
    }
  }

  async function saveAction(formData: FormData) {
    "use server";
    try {
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const header = {
      vDate: txt(formData.get("vDate")) ?? today(),
      lvNo: intVal(formData.get("lvNo")),
      time: txt(formData.get("time")),
      shedNo: txt(formData.get("shedNo")),
      foldingStock: num(formData.get("foldingStock")),
      designNo: txt(formData.get("designNo")),
      setNo: txt(formData.get("setNo")),
      lotNo: txt(formData.get("lotNo")),
      torOwn: txt(formData.get("torOwn")),
      grade: txt(formData.get("grade")),
      remarks: txt(formData.get("remarks")),
      prodCode: txt(formData.get("prodCode")),
      noOfWidths: intVal(formData.get("noOfWidths")),
      convContParty: txt(formData.get("convContParty")),
      beamContParty: txt(formData.get("beamContParty")),
      szgParty: txt(formData.get("szgParty")),
      productQuality: txt(formData.get("productQuality")),
      productBrand: txt(formData.get("productBrand")),
      productSlvag: txt(formData.get("productSlvag")),
      shiftInchargeTm: txt(formData.get("shiftInchargeTm")),
      shiftInchargePm: txt(formData.get("shiftInchargePm")),
      shiftInchargeA: txt(formData.get("shiftInchargeA")),
      shiftInchargeB: txt(formData.get("shiftInchargeB")),
      shiftInchargeC: txt(formData.get("shiftInchargeC")),
    };
    await assertPeriodOpen(header.vDate, "INVENTORY");

    const setHashArr = formData.getAll("setHash") as string[];
    const mmThanSrNoArr = formData.getAll("mmThanSrNo") as string[];
    const aCountArr = formData.getAll("aCount") as string[];
    const bCountArr = formData.getAll("bCount") as string[];
    const cCountArr = formData.getAll("cCount") as string[];
    const cpCountArr = formData.getAll("cpCount") as string[];
    const ppcCountArr = formData.getAll("ppcCount") as string[];
    const totalCountArr = formData.getAll("totalCount") as string[];
    const rejCountArr = formData.getAll("rejCount") as string[];
    const beamSetNoArr = formData.getAll("beamSetNo") as string[];
    const kSmTypeArr = formData.getAll("kSmType") as string[];
    const kSmDateArr = formData.getAll("kSmDate") as string[];
    const beamStatusArr = formData.getAll("beamStatus") as string[];
    const wastWtKgArr = formData.getAll("wastWtKg") as string[];
    const beamNoArr = formData.getAll("beamNo") as string[];
    const loomNoArr = formData.getAll("loomNo") as string[];
    const contNoArr = formData.getAll("contNo") as string[];
    const endsArr = formData.getAll("ends") as string[];
    const bLengthArr = formData.getAll("bLength") as string[];
    const rcvdMtrArr = formData.getAll("rcvdMtr") as string[];
    const diffArr = formData.getAll("diff") as string[];
    const shrinkageArr = formData.getAll("shrinkage") as string[];

    const validSets: {
      srNo: number;
      setHash: string | null;
      mmThanSrNo: string | null;
      aCount: number | null;
      bCount: number | null;
      cCount: number | null;
      cpCount: number | null;
      ppcCount: number | null;
      totalCount: number | null;
      rejCount: number | null;
      beamSetNo: string | null;
      kSmType: string | null;
      kSmDate: string | null;
      beamStatus: string | null;
      wastWtKg: number | null;
      beamNo: string | null;
      loomNo: number | null;
      contNo: string | null;
      ends: number | null;
      bLength: number | null;
      rcvdMtr: number | null;
      diff: number | null;
      shrinkage: number | null;
    }[] = [];
    for (let i = 0; i < setHashArr.length; i++) {
      const setHash = (setHashArr[i] || "").trim();
      const mmThanSrNo = (mmThanSrNoArr[i] || "").trim();
      const aC = num(aCountArr[i]);
      const bC = num(bCountArr[i]);
      const cC = num(cCountArr[i]);
      const cpC = num(cpCountArr[i]);
      const ppc = num(ppcCountArr[i]);
      const tc = num(totalCountArr[i]);
      const rc = num(rejCountArr[i]);
      const bsn = (beamSetNoArr[i] || "").trim();
      const kt = (kSmTypeArr[i] || "").trim();
      const kd = (kSmDateArr[i] || "").trim();
      const bs = (beamStatusArr[i] || "").trim();
      const ww = num(wastWtKgArr[i]);
      const bn = (beamNoArr[i] || "").trim();
      const ln = intVal(loomNoArr[i]);
      const cn = (contNoArr[i] || "").trim();
      const en = intVal(endsArr[i]);
      const bl = num(bLengthArr[i]);
      const rm = num(rcvdMtrArr[i]);
      const df = num(diffArr[i]);
      const sh = num(shrinkageArr[i]);
      if (!setHash && !mmThanSrNo && aC == null && bC == null && cC == null && cpC == null && ppc == null && tc == null && rc == null && !bsn && !kt && !kd && !bs && ww == null && !bn && ln == null && !cn && en == null && bl == null && rm == null && df == null && sh == null) continue;
      // Server-authoritative total: Total = A + B + C + CP + PPC. Any manually
      // typed totalCount is discarded — the client shows it as a readonly cell.
      const anyCount = aC != null || bC != null || cC != null || cpC != null || ppc != null;
      const authoritativeTotal = anyCount
        ? (aC ?? 0) + (bC ?? 0) + (cC ?? 0) + (cpC ?? 0) + (ppc ?? 0)
        : tc;
      validSets.push({
        srNo: validSets.length + 1,
        setHash: setHash || null,
        mmThanSrNo: mmThanSrNo || null,
        aCount: aC,
        bCount: bC,
        cCount: cC,
        cpCount: cpC,
        ppcCount: ppc,
        totalCount: authoritativeTotal,
        rejCount: rc,
        beamSetNo: bsn || null,
        kSmType: kt || null,
        kSmDate: kd || null,
        beamStatus: bs || null,
        wastWtKg: ww,
        beamNo: bn || null,
        loomNo: ln,
        contNo: cn || null,
        ends: en,
        bLength: bl,
        rcvdMtr: rm,
        diff: df,
        shrinkage: sh,
      });
    }

    // ---- validations ----
    const hasBeam = validSets.some((s) => (s.beamNo ?? "").trim().length > 0);
    if (!hasBeam) {
      const q = Number.isFinite(id) && id > 0 ? `?id=${id}&error=no_beam` : `?adding=1&error=no_beam`;
      redirect(`/inventory/daily-production${q}`);
    }
    const totalGrade = validSets.reduce((a, s) => a + (s.totalCount ?? 0), 0);
    if (totalGrade <= 0) {
      const q = Number.isFinite(id) && id > 0 ? `?id=${id}&error=no_grade` : `?adding=1&error=no_grade`;
      redirect(`/inventory/daily-production${q}`);
    }

    const vDateStr = header.vDate || today();
    const dParts = vDateStr.split("-");
    const yy = dParts[0] ? dParts[0].slice(-2) : "00";
    const monIdx = dParts[1] ? parseInt(dParts[1], 10) - 1 : 0;
    const monAbbr = MONTH_ABBR[monIdx] ?? "JAN";
    const monthPrefix = `${monAbbr}-`;
    const monthSuffix = `-${yy}`;

    // Cheap up-front duplicate check within the submitted grid (per row).
    const submittedSeen = new Set<string>();
    for (const s of validSets) {
      if (!s.mmThanSrNo) continue;
      if (submittedSeen.has(s.mmThanSrNo)) {
        const q = Number.isFinite(id) && id > 0 ? `?id=${id}&error=dup_than` : `?adding=1&error=dup_than`;
        redirect(`/inventory/daily-production${q}`);
      }
      submittedSeen.add(s.mmThanSrNo);
    }

    const detailDateArr = formData.getAll("detailDate") as string[];
    const aProdArr = formData.getAll("aProd") as string[];
    const bProdArr = formData.getAll("bProd") as string[];
    const cProdArr = formData.getAll("cProd") as string[];
    const totalProdArr = formData.getAll("totalProd") as string[];
    const prodCntArr = formData.getAll("prodCnt") as string[];
    const prodDiffArr = formData.getAll("prodDiff") as string[];
    const prodAddFactorArr = formData.getAll("prodAddFactor") as string[];

    const validDetails: {
      srNo: number;
      detailDate: string | null;
      aProd: number | null;
      bProd: number | null;
      cProd: number | null;
      totalProd: number | null;
      prodCnt: number | null;
      prodDiff: number | null;
      prodAddFactor: number | null;
    }[] = [];
    for (let i = 0; i < detailDateArr.length; i++) {
      const dd = (detailDateArr[i] || "").trim();
      const ap = num(aProdArr[i]);
      const bp = num(bProdArr[i]);
      const cp = num(cProdArr[i]);
      const tp = num(totalProdArr[i]);
      const pcnt = num(prodCntArr[i]);
      const pdf = num(prodDiffArr[i]);
      const paf = num(prodAddFactorArr[i]);
      if (!dd && ap == null && bp == null && cp == null && tp == null && pcnt == null && pdf == null && paf == null) continue;
      validDetails.push({
        srNo: validDetails.length + 1,
        detailDate: dd || null,
        aProd: ap,
        bProd: bp,
        cProd: cp,
        totalProd: tp,
        prodCnt: pcnt,
        prodDiff: pdf,
        prodAddFactor: paf,
      });
    }

    // ---- Folding grey stock GL inputs (DR 1.01.01.01.0013 / CR conv party) ----
    // amount = Σ produced meters × the row's grey-conversion contract rate.
    const FOLDING_STOCK_ACC = "1.01.25.01.0037";
    const [companyFy] = await db
      .select({ currentFy: schema.companyProfile.currentFy })
      .from(schema.companyProfile)
      .limit(1);
    const fyCode = companyFy?.currentFy ?? "";
    const foldingContNos = Array.from(new Set(validSets.map((s) => s.contNo).filter((x): x is string => !!x)));
    const convRateByCont = new Map<string, number>();
    const partyByCont = new Map<string, string>();
    if (foldingContNos.length) {
      const crows = await db
        .select({
          contNo: schema.intGreyConversionContract.contNo,
          conv: schema.intGreyConversionContract.convRatePerMtr,
          gray: schema.intGreyConversionContract.grayRatePerMtr,
          rm: schema.intGreyConversionContract.rateMtr,
          party: schema.intGreyConversionContract.party,
        })
        .from(schema.intGreyConversionContract)
        .where(inArray(schema.intGreyConversionContract.contNo, foldingContNos));
      for (const r of crows) {
        convRateByCont.set(r.contNo, r.conv ?? r.gray ?? r.rm ?? 0);
        if (r.party) partyByCont.set(r.contNo, r.party.trim());
      }
    }
    // No cross-party: every row's beam contract must share one party, and match the
    // header conv party when set ("contract koi or, beam koi or → party cross").
    const rowParties = new Set([...partyByCont.values()].filter(Boolean));
    const headerConvParty = (header.convContParty ?? "").trim();
    if (rowParties.size > 1 || (headerConvParty && [...rowParties].some((p) => p !== headerConvParty))) {
      const q = Number.isFinite(id) && id > 0 ? `?id=${id}&error=party_cross` : `?adding=1&error=party_cross`;
      redirect(`/inventory/daily-production${q}`);
    }
    const foldingAmount =
      Math.round(
        validSets.reduce((sum, s) => sum + (s.totalCount ?? 0) * (s.contNo ? convRateByCont.get(s.contNo) ?? 0 : 0), 0) * 100,
      ) / 100;
    // Credit party = header conv party; fall back to the row-contract's party so a
    // loom-only pick (contract auto from beam) still posts to the right party.
    let convPartyDesc = header.convContParty ?? "";
    if (!convPartyDesc && foldingContNos.length) {
      const [cp] = await db
        .select({ party: schema.intGreyConversionContract.party })
        .from(schema.intGreyConversionContract)
        .where(eq(schema.intGreyConversionContract.contNo, foldingContNos[0]))
        .limit(1);
      convPartyDesc = cp?.party ?? "";
    }
    let convPartyCode = "";
    if (convPartyDesc) {
      const sp = convPartyDesc.trim();
      if (/^\d+(\.\d+)+$/.test(sp)) convPartyCode = sp;
      else {
        const [pr] = await db
          .select({ code: schema.chartOfAccounts.code })
          .from(schema.chartOfAccounts)
          .where(eq(schema.chartOfAccounts.description, sp))
          .limit(1);
        convPartyCode = pr?.code ?? "";
      }
    }
    const canPostFolding = !!fyCode && !!convPartyCode && foldingAmount > 0;
    const foldingNarr = `FOLDING GREY STOCK — ${header.shedNo ?? ""}`.trim();

    const nowIso = new Date().toISOString();

    try {
      if (Number.isFinite(id) && id > 0) {
        await db.transaction(async (tx) => {
          // Snapshot old sets so we can (a) revert beam.statusWrk for beams the
          // new grid drops, (b) re-apply dlv_status='Y' for than serials this
          // voucher previously delivered, (c) collide-check mmThanSrNo against
          // ANY row not in this voucher.
          const oldSets = await tx
            .select({
              beamNo: schema.intDailyProductionSet.beamNo,
              beamStatus: schema.intDailyProductionSet.beamStatus,
              mmThanSrNo: schema.intDailyProductionSet.mmThanSrNo,
              dlvStatus: schema.intDailyProductionSet.dlvStatus,
            })
            .from(schema.intDailyProductionSet)
            .where(eq(schema.intDailyProductionSet.productionId, id));
          const oldBeamStatus = new Map<string, string | null>();
          const oldDelivered = new Map<string, string | null>();
          for (const os of oldSets) {
            if (os.beamNo) oldBeamStatus.set(os.beamNo, os.beamStatus ?? null);
            if (os.mmThanSrNo) oldDelivered.set(os.mmThanSrNo, os.dlvStatus ?? null);
          }

          await tx
            .update(schema.intDailyProduction)
            .set({ ...header, modifiedDate: nowIso })
            .where(eq(schema.intDailyProduction.id, id));
          await tx
            .delete(schema.intDailyProductionSet)
            .where(eq(schema.intDailyProductionSet.productionId, id));
          await tx
            .delete(schema.intDailyProductionDetail)
            .where(eq(schema.intDailyProductionDetail.productionId, id));

          // Generate mmThanSrNo inside the tx so the seq lookup and the insert
          // are atomic; unique collisions bubble out as UNIQUE errors.
          const monthMaxRow = await tx
            .select({
              m: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intDailyProductionSet.mmThanSrNo}, ${monthPrefix.length + 1}, LENGTH(${schema.intDailyProductionSet.mmThanSrNo}) - ${monthPrefix.length + monthSuffix.length}) AS INTEGER)),0)`,
            })
            .from(schema.intDailyProductionSet)
            .where(
              sql`${schema.intDailyProductionSet.mmThanSrNo} LIKE ${`${monthPrefix}%${monthSuffix}`}`
            );
          let seq = Number(monthMaxRow[0]?.m ?? 0);
          for (const s of validSets) {
            if (!s.mmThanSrNo && (s.beamNo || s.setHash || (s.totalCount ?? 0) > 0)) {
              seq += 1;
              s.mmThanSrNo = `${monAbbr}-${String(seq).padStart(4, "0")}-${yy}`;
            }
          }

          const inputSerials = validSets.map((s) => s.mmThanSrNo).filter((x): x is string => !!x);
          if (inputSerials.length) {
            const dupRows = await tx
              .select({ mm: schema.intDailyProductionSet.mmThanSrNo, pid: schema.intDailyProductionSet.productionId })
              .from(schema.intDailyProductionSet)
              .where(inArray(schema.intDailyProductionSet.mmThanSrNo, inputSerials));
            for (const d of dupRows) {
              if (!d.mm) continue;
              if (d.pid === id) continue;
              throw new Error("DUP_THAN");
            }
          }

          if (validSets.length) {
            await tx
              .insert(schema.intDailyProductionSet)
              .values(validSets.map((s) => ({ ...s, productionId: id })));
          }
          if (validDetails.length) {
            await tx
              .insert(schema.intDailyProductionDetail)
              .values(validDetails.map((d) => ({ ...d, productionId: id })));
          }

          // Re-stamp dlvStatus='Y' where the old voucher already delivered.
          const reDeliver = validSets
            .map((s) => s.mmThanSrNo)
            .filter((m): m is string => !!m && oldDelivered.get(m) === "Y");
          if (reDeliver.length) {
            await tx
              .update(schema.intDailyProductionSet)
              .set({ dlvStatus: "Y" })
              .where(
                and(
                  eq(schema.intDailyProductionSet.productionId, id),
                  inArray(schema.intDailyProductionSet.mmThanSrNo, reDeliver)
                )
              );
          }

          // Beam lifecycle: apply this voucher's beam statuses, then revert
          // beams the new grid dropped back to EMPTY (no history to restore to).
          for (const s of validSets) {
            if (!s.beamNo || !s.beamStatus) continue;
            const patch: { statusWrk: string; loomNo?: number | null } = { statusWrk: s.beamStatus };
            if (s.beamStatus.toUpperCase() === "EMPTY") patch.loomNo = null;
            await tx.update(schema.beams).set(patch).where(eq(schema.beams.beamNo, s.beamNo));
          }
          const newBeams = new Set(validSets.map((s) => s.beamNo).filter((b): b is string => !!b));
          for (const [oldBeam] of oldBeamStatus) {
            if (newBeams.has(oldBeam)) continue;
            await tx
              .update(schema.beams)
              .set({ statusWrk: "EMPTY", loomNo: null })
              .where(eq(schema.beams.beamNo, oldBeam));
          }
          // Auto "last roll → EMPTY": a beam whose cumulative woven meters reach
          // its total length is exhausted → force EMPTY + detach from loom.
          // No-ops when the beam has no length set, so it's safe until capacities
          // are entered.
          for (const beamNo of newBeams) {
            const [b] = await tx
              .select({ length: schema.beams.length, statusWrk: schema.beams.statusWrk })
              .from(schema.beams)
              .where(eq(schema.beams.beamNo, beamNo))
              .limit(1);
            if (!b?.length || b.length <= 0 || b.statusWrk === "EMPTY") continue;
            const [agg] = await tx
              .select({ woven: sql<number>`COALESCE(SUM(${schema.intDailyProductionSet.totalCount}), 0)` })
              .from(schema.intDailyProductionSet)
              .where(eq(schema.intDailyProductionSet.beamNo, beamNo));
            if ((agg?.woven ?? 0) >= b.length) {
              await tx.update(schema.beams).set({ statusWrk: "EMPTY", loomNo: null }).where(eq(schema.beams.beamNo, beamNo));
            }
          }

          // Folding grey stock GL (delete-before-guard): DR folding stock / CR conv party.
          await tx.delete(schema.transDetail).where(and(eq(schema.transDetail.vtype, "DP"), eq(schema.transDetail.vno, id)));
          await tx.delete(schema.transMain).where(and(eq(schema.transMain.vtype, "DP"), eq(schema.transMain.vno, id)));
          if (canPostFolding) {
            await tx.insert(schema.transMain).values({ fyCode, vtype: "DP", vno: id, vdate: header.vDate, accCode: FOLDING_STOCK_ACC, narration: foldingNarr, balanceAmount: foldingAmount });
            await tx.insert(schema.transDetail).values([
              { fyCode, vtype: "DP", vno: id, srno: 1, accCode: FOLDING_STOCK_ACC, partyCode: convPartyCode, narration: foldingNarr, debit: foldingAmount, credit: 0 },
              { fyCode, vtype: "DP", vno: id, srno: 2, accCode: convPartyCode, partyCode: FOLDING_STOCK_ACC, narration: foldingNarr, debit: 0, credit: foldingAmount },
            ]);
          }
        });
        revalidatePath("/inventory/daily-production");
        redirect(`/inventory/daily-production?id=${id}`);
      } else {
        const providedVNo = ((formData.get("vNo") as string) || "").trim();
        const newId = await db.transaction(async (tx) => {
          let vNo = providedVNo;
          if (!vNo) {
            const maxRes = await tx
              .select({
                maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intDailyProduction.vNo}, 5) AS INTEGER)), 0)`,
              })
              .from(schema.intDailyProduction)
              .where(sql`${schema.intDailyProduction.vNo} LIKE 'IDP-%'`);
            const n = (maxRes[0]?.maxNum ?? 0) + 1;
            vNo = `IDP-${String(n).padStart(4, "0")}`;
          }

          const monthMaxRow = await tx
            .select({
              m: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intDailyProductionSet.mmThanSrNo}, ${monthPrefix.length + 1}, LENGTH(${schema.intDailyProductionSet.mmThanSrNo}) - ${monthPrefix.length + monthSuffix.length}) AS INTEGER)),0)`,
            })
            .from(schema.intDailyProductionSet)
            .where(
              sql`${schema.intDailyProductionSet.mmThanSrNo} LIKE ${`${monthPrefix}%${monthSuffix}`}`
            );
          let seq = Number(monthMaxRow[0]?.m ?? 0);
          for (const s of validSets) {
            if (!s.mmThanSrNo && (s.beamNo || s.setHash || (s.totalCount ?? 0) > 0)) {
              seq += 1;
              s.mmThanSrNo = `${monAbbr}-${String(seq).padStart(4, "0")}-${yy}`;
            }
          }

          const inputSerials = validSets.map((s) => s.mmThanSrNo).filter((x): x is string => !!x);
          if (inputSerials.length) {
            const dupRows = await tx
              .select({ mm: schema.intDailyProductionSet.mmThanSrNo })
              .from(schema.intDailyProductionSet)
              .where(inArray(schema.intDailyProductionSet.mmThanSrNo, inputSerials));
            if (dupRows.some((r) => !!r.mm)) throw new Error("DUP_THAN");
          }

          const inserted = await tx
            .insert(schema.intDailyProduction)
            .values({ ...header, vNo, postedDate: nowIso })
            .returning({ id: schema.intDailyProduction.id });
          const insertedId = inserted[0].id;
          if (validSets.length) {
            await tx
              .insert(schema.intDailyProductionSet)
              .values(validSets.map((s) => ({ ...s, productionId: insertedId })));
          }
          if (validDetails.length) {
            await tx
              .insert(schema.intDailyProductionDetail)
              .values(validDetails.map((d) => ({ ...d, productionId: insertedId })));
          }
          for (const s of validSets) {
            if (!s.beamNo || !s.beamStatus) continue;
            const patch: { statusWrk: string; loomNo?: number | null } = { statusWrk: s.beamStatus };
            if (s.beamStatus.toUpperCase() === "EMPTY") patch.loomNo = null;
            await tx.update(schema.beams).set(patch).where(eq(schema.beams.beamNo, s.beamNo));
          }
          // Auto "last roll → EMPTY" (see update path for rationale). No-ops
          // until beam length is set.
          const insBeams = new Set(validSets.map((s) => s.beamNo).filter((b): b is string => !!b));
          for (const beamNo of insBeams) {
            const [b] = await tx
              .select({ length: schema.beams.length, statusWrk: schema.beams.statusWrk })
              .from(schema.beams)
              .where(eq(schema.beams.beamNo, beamNo))
              .limit(1);
            if (!b?.length || b.length <= 0 || b.statusWrk === "EMPTY") continue;
            const [agg] = await tx
              .select({ woven: sql<number>`COALESCE(SUM(${schema.intDailyProductionSet.totalCount}), 0)` })
              .from(schema.intDailyProductionSet)
              .where(eq(schema.intDailyProductionSet.beamNo, beamNo));
            if ((agg?.woven ?? 0) >= b.length) {
              await tx.update(schema.beams).set({ statusWrk: "EMPTY", loomNo: null }).where(eq(schema.beams.beamNo, beamNo));
            }
          }

          // Folding grey stock GL: DR folding stock / CR conv party.
          if (canPostFolding) {
            await tx.insert(schema.transMain).values({ fyCode, vtype: "DP", vno: insertedId, vdate: header.vDate, accCode: FOLDING_STOCK_ACC, narration: foldingNarr, balanceAmount: foldingAmount });
            await tx.insert(schema.transDetail).values([
              { fyCode, vtype: "DP", vno: insertedId, srno: 1, accCode: FOLDING_STOCK_ACC, partyCode: convPartyCode, narration: foldingNarr, debit: foldingAmount, credit: 0 },
              { fyCode, vtype: "DP", vno: insertedId, srno: 2, accCode: convPartyCode, partyCode: FOLDING_STOCK_ACC, narration: foldingNarr, debit: 0, credit: foldingAmount },
            ]);
          }
          return insertedId;
        });
        revalidatePath("/inventory/daily-production");
        redirect(`/inventory/daily-production?id=${newId}`);
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "unknown";
      if (msg === "DUP_THAN") {
        const q = Number.isFinite(id) && id > 0 ? `?id=${id}&error=dup_than` : `?adding=1&error=dup_than`;
        redirect(`/inventory/daily-production${q}`);
      }
      if (/UNIQUE|constraint/i.test(msg)) {
        if (/mm_than_sr_no|mmThanSrNo/i.test(msg)) {
          const q = Number.isFinite(id) && id > 0 ? `?id=${id}&error=dup_than` : `?adding=1&error=dup_than`;
          redirect(`/inventory/daily-production${q}`);
        }
        redirect(`/inventory/daily-production?error=code_exists`);
      }
      throw e;
    }
    } catch (e) {
      const err = e as { message?: string; digest?: string };
      if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
      const thru = parseLockedThroughFromError(err.message ?? "");
      if (thru) redirect(`/inventory/daily-production?error=period_locked&thru=${thru}`);
      throw e;
    }
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const session = await getSession();
    if (session?.roleName !== "ADMIN") redirect("/inventory/daily-production?error=admin_only");
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      const oldSets = await tx
        .select({ beamNo: schema.intDailyProductionSet.beamNo })
        .from(schema.intDailyProductionSet)
        .where(eq(schema.intDailyProductionSet.productionId, id));
      for (const os of oldSets) {
        if (!os.beamNo) continue;
        await tx
          .update(schema.beams)
          .set({ statusWrk: "EMPTY", loomNo: null })
          .where(eq(schema.beams.beamNo, os.beamNo));
      }
      await tx.delete(schema.transDetail).where(and(eq(schema.transDetail.vtype, "DP"), eq(schema.transDetail.vno, id)));
      await tx.delete(schema.transMain).where(and(eq(schema.transMain.vtype, "DP"), eq(schema.transMain.vno, id)));
      await tx.delete(schema.intDailyProductionSet).where(eq(schema.intDailyProductionSet.productionId, id));
      await tx.delete(schema.intDailyProductionDetail).where(eq(schema.intDailyProductionDetail.productionId, id));
      await tx.delete(schema.intDailyProduction).where(eq(schema.intDailyProduction.id, id));
    });
    revalidatePath("/inventory/daily-production");
    redirect(`/inventory/daily-production`);
  }

  const showForm = !!editing || isAdding;

  return (
    <Shell active="production">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">DAILY PRODUCTION ( WVG )</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {list.length} entr{list.length === 1 ? "y" : "ies"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={list.map((r) => ({
              vNo: r.vNo,
              vDate: r.vDate,
              lvNo: r.lvNo,
              shedNo: r.shedNo,
              setNo: r.setNo,
              designNo: r.designNo,
              grade: r.grade,
              foldingStock: r.foldingStock,
              productQuality: r.productQuality,
              productBrand: r.productBrand,
              convContParty: r.convContParty,
              beamContParty: r.beamContParty,
              szgParty: r.szgParty,
              lotNo: r.lotNo,
              totalCount: rowTotals.get(r.id) ?? 0,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "lvNo", label: "LV.No" },
              { key: "shedNo", label: "Shed" },
              { key: "setNo", label: "Set#" },
              { key: "designNo", label: "Design#" },
              { key: "grade", label: "Grade" },
              { key: "foldingStock", label: "Folding Stock" },
              { key: "productQuality", label: "Product Quality" },
              { key: "productBrand", label: "Product (Brand)" },
              { key: "convContParty", label: "Conv Cont Party" },
              { key: "beamContParty", label: "Beam Cont Party" },
              { key: "szgParty", label: "Szg Party" },
              { key: "lotNo", label: "Lot#" },
              { key: "totalCount", label: "Total" },
            ]}
            filename="daily-production"
            sheetName="DailyProduction"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Voucher number already exists. Try again.
          </div>
        )}
        {params.error === "period_locked" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Period is locked. Cannot save vouchers for this date
            {params.thru && (
              <> — locked through <span className="mono">{params.thru}</span></>
            )}
            .
          </div>
        )}
        {params.error === "dup_than" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Duplicate mm/Than Sr No — already used by another production entry.
          </div>
        )}
        {params.error === "no_beam" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            At least one Set# row must have a Beam #.
          </div>
        )}
        {params.error === "party_cross" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Party cross — every beam&apos;s contract must belong to the same conversion party. Fix the loom/contract selection.
          </div>
        )}
        {params.error === "no_grade" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Total grade production must be greater than 0.
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can delete vouchers.
          </div>
        )}

        <form id="idp-find-form" method="GET" action="/inventory/daily-production" className="hidden" />

        <div className="border border-black p-4 mb-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New — DAILY PRODUCTION" : editing ? `Edit — ${editing.vNo}` : "DAILY PRODUCTION"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/daily-production?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="idp-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              {editing ? (
                <form action={deleteAction} className="inline">
                  <input type="hidden" name="id" value={editing.id} />
                  <ConfirmButton message={`Delete production voucher ${editing.vNo}? This cannot be undone.`}>Delete</ConfirmButton>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled
                  title="Save the voucher first to enable delete"
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Delete
                </button>
              )}
              <a href="/inventory/daily-production" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>

          {showForm && (
            <form id="idp-save-form" action={saveAction}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <ProductionSetCalc beamStats={beamStats} />
              <ThanSerialLive base={thanBase} prefix={thanPrefix} suffix={thanSuffix} />
              <RowAutoFill watch="beamNo" map={beamFillMap} />
              <RowAutoFill watch="loomNo" map={loomFillMap} />
              <AutoFill watch="conv_contract" map={contractFillMap} combos={["productQuality", "convContParty"]} inputs={["productBrand"]} />
              <datalist id="beams-list">
                {beamCatalog.map((b) => (
                  <option key={b.beamNo ?? ""} value={b.beamNo ?? ""}>
                    {b.beamSetNo ? `set ${b.beamSetNo}` : ""} {b.length != null ? `— ${b.length}m` : ""}
                  </option>
                ))}
              </datalist>
              <datalist id="dp-sheds">
                {shedList.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <datalist id="dp-brands">
                {brandList.map((b) => (
                  <option key={b.name} value={b.name} />
                ))}
              </datalist>

              <div className="border border-black p-4 mb-3">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">HEADER</div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3 gform">
                  <div className="md:col-span-2">
                    <label className="label block mb-1">Date</label>
                    <input name="vDate" type="date" className="input-box mono" defaultValue={editing?.vDate ?? today()} required />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label block mb-1">No.</label>
                    <input name="vNo" className="input-box mono bg-gray-100" defaultValue={editing?.vNo ?? upcomingVNo} readOnly />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label block mb-1">LV.No</label>
                    <input name="lvNo" type="number" step="1" className="input-box mono bg-gray-100" defaultValue={editing?.lvNo ?? maxLvNo} readOnly tabIndex={-1} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label block mb-1">Time</label>
                    <input name="time" className="input-box mono bg-gray-100" defaultValue={editing?.time ?? nowTime()} readOnly />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label block mb-1">Posted</label>
                    <input className="input-box mono bg-gray-100 text-[12px]" defaultValue={editing?.postedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label block mb-1">Modified</label>
                    <input className="input-box mono bg-gray-100 text-[12px]" defaultValue={editing?.modifiedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                  </div>

                  <div className="md:col-span-3">
                    <label className="label block mb-1">Shed No</label>
                    <input name="shedNo" list="dp-sheds" className="input-box mono" defaultValue={editing?.shedNo ?? ""} />
                  </div>
                  <div className="md:col-span-3">
                    <label className="label block mb-1">Folding Stock</label>
                    <input
                      name="foldingStock"
                      type="number"
                      step="0.01"
                      className="input-box mono text-right bg-gray-100"
                      defaultValue={foldingStockCalc ?? editing?.foldingStock ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="label block mb-1">Set#</label>
                    <input name="setNo" className="input-box mono" defaultValue={editing?.setNo ?? ""} />
                  </div>
                  <div className="md:col-span-3">
                    <label className="label block mb-1">Design#</label>
                    <input name="designNo" className="input-box mono" defaultValue={editing?.designNo ?? ""} />
                  </div>

                  <div className="md:col-span-6">
                    <label className="label block mb-1">Conv Contract (F9) — fills quality / brand / party</label>
                    <FindingPicker
                      name="conv_contract"
                      defaultValue=""
                      rows={contractPickerRows}
                      columns={contractCols}
                      title="CONTRACT LIST — GREY CONVERSION"
                      placeholder="F9 grey conversion contract"
                      className="input-box mono cursor-pointer"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="label block mb-1">Grade</label>
                    <input name="grade" className="input-box mono" defaultValue={editing?.grade ?? ""} />
                  </div>
                  <div className="md:col-span-3">
                    <label className="label block mb-1">Remarks</label>
                    <input name="remarks" className="input-box" defaultValue={editing?.remarks ?? ""} />
                  </div>
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-3 mono">
                  ALT-E to edit next section. F9 opens LOV on Set# / Design#.
                </div>
              </div>

              <div className="border border-black mb-3">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold p-3 border-b-2 border-black bg-gray-50">
                  SET# GRID — mm/Than Sr No, Counts, Beam Details
                </div>
                <div className="overflow-x-auto">
                  <table style={{ minWidth: "2200px" }}>
                    <thead>
                      <tr>
                        <th style={{ width: 34 }}>Sr#</th>
                        <th style={{ width: 70 }}>Set#</th>
                        <th style={{ width: 110 }}>mm/Than Sr No</th>
                        <th className="text-right" style={{ width: 55 }}>A</th>
                        <th className="text-right" style={{ width: 55 }}>B</th>
                        <th className="text-right" style={{ width: 55 }}>C</th>
                        <th className="text-right" style={{ width: 55 }}>CP</th>
                        <th className="text-right" style={{ width: 55 }}>PPC</th>
                        <th className="text-right" style={{ width: 65 }}>Total</th>
                        <th className="text-right" style={{ width: 55 }}>Rej</th>
                        <th style={{ width: 80 }}>Beam Set#</th>
                        <th style={{ width: 55 }}>Type</th>
                        <th style={{ width: 115 }}>K/S/M Date</th>
                        <th style={{ width: 100 }}>Beam Status</th>
                        <th className="text-right" style={{ width: 75 }}>Wast WT KG</th>
                        <th style={{ width: 160 }}>Loom# (F9)</th>
                        <th style={{ width: 160 }}>Beam # (F9)</th>
                        <th style={{ width: 100 }}>Cont No</th>
                        <th className="text-right" style={{ width: 60 }}>Ends</th>
                        <th className="text-right" style={{ width: 75 }}>B.Length</th>
                        <th className="text-right" style={{ width: 75 }}>Rcvd/Mtr</th>
                        <th className="text-right" style={{ width: 65 }}>Diff</th>
                        <th className="text-right" style={{ width: 75 }}>Shrinkage</th>
                      </tr>
                    </thead>
                    <tbody id="idp-set-rows">
                      {Array.from({ length: Math.max(SET_ROWS, setRows.length + 2) }).map((_, i) => {
                        const s = setRows[i];
                        return (
                          <tr key={i}>
                            <td className="mono text-[12px] text-center">{i + 1}</td>
                            <td><input name="setHash" className="input-box mono text-[12px]" defaultValue={s?.setHash ?? ""} /></td>
                            <td><input name="mmThanSrNo" className="input-box mono text-[12px]" defaultValue={s?.mmThanSrNo ?? ""} /></td>
                            <td><input name="aCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.aCount ?? ""} /></td>
                            <td><input name="bCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.bCount ?? ""} /></td>
                            <td><input name="cCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.cCount ?? ""} /></td>
                            <td><input name="cpCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.cpCount ?? ""} /></td>
                            <td><input name="ppcCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.ppcCount ?? ""} /></td>
                            <td><input name="totalCount" type="number" step="0.01" className="input-box mono text-[12px] text-right bg-gray-100" defaultValue={s?.totalCount ?? ""} readOnly tabIndex={-1} /></td>
                            <td><input name="rejCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.rejCount ?? ""} /></td>
                            <td><input name="beamSetNo" className="input-box mono text-[12px]" defaultValue={s?.beamSetNo ?? ""} /></td>
                            <td>
                              <select name="kSmType" className="input-box mono text-[12px]" defaultValue={s?.kSmType ?? ""}>
                                <option value=""></option>
                                <option value="K">K</option>
                                <option value="S">S</option>
                                <option value="M">M</option>
                              </select>
                            </td>
                            <td><input name="kSmDate" type="date" className="input-box mono text-[12px]" defaultValue={s?.kSmDate ?? ""} /></td>
                            <td>
                              <select name="beamStatus" className="input-box mono text-[12px]" defaultValue={s?.beamStatus ?? ""}>
                                <option value=""></option>
                                {beamStatusList.map((bs) => (
                                  <option key={bs.id} value={bs.status}>{bs.status}</option>
                                ))}
                                {s?.beamStatus && !beamStatusList.some((bs) => bs.status === s.beamStatus) && (
                                  <option value={s.beamStatus}>{s.beamStatus}</option>
                                )}
                              </select>
                            </td>
                            <td><input name="wastWtKg" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.wastWtKg ?? ""} /></td>
                            <td>
                              <FindingPicker
                                name="loomNo"
                                defaultValue={s?.loomNo != null ? String(s.loomNo) : ""}
                                rows={loomPickerRows}
                                columns={loomCols}
                                filterByField="shedNo"
                                title="LOOM LIST"
                                placeholder="F9 loom"
                                className="input-box mono text-[12px] cursor-pointer"
                              />
                            </td>
                            <td>
                              <FindingPicker
                                name="beamNo"
                                defaultValue={s?.beamNo ?? ""}
                                rows={beamPickerRows}
                                columns={beamCols}
                                title="SET NO LIST — RUNNING BEAMS"
                                placeholder="F9 beam"
                                className="input-box mono text-[12px] cursor-pointer"
                              />
                              <span data-near-empty className="mono text-[9px] text-[var(--danger)] font-bold ml-1"></span>
                            </td>
                            <td>
                              <input name="contNo" className="input-box mono text-[12px] bg-gray-50" defaultValue={s?.contNo ?? ""} readOnly tabIndex={-1} />
                            </td>
                            <td><input name="ends" type="number" step="1" className="input-box mono text-[12px] text-right" defaultValue={s?.ends ?? ""} /></td>
                            <td><input name="bLength" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.bLength ?? ""} /></td>
                            <td><input name="rcvdMtr" type="number" step="0.01" className="input-box mono text-[12px] text-right bg-gray-100" defaultValue={s?.rcvdMtr ?? ""} readOnly tabIndex={-1} /></td>
                            <td><input name="diff" type="number" step="0.01" className="input-box mono text-[12px] text-right bg-gray-100" defaultValue={s?.diff ?? ""} readOnly tabIndex={-1} /></td>
                            <td><input name="shrinkage" type="number" step="0.01" className="input-box mono text-[12px] text-right bg-gray-100" defaultValue={s?.shrinkage ?? ""} readOnly tabIndex={-1} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-[var(--muted)] p-2 border-t border-black mono">
                  Empty rows are ignored on save. Ctrl+Page Down to advance.
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7">
                  <div className="border border-black">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold p-3 border-b-2 border-black bg-gray-50">
                      ALT+Z — PROD DETAIL
                    </div>
                    <div className="overflow-x-auto">
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: "34px" }}>Sr#</th>
                            <th>Date</th>
                            <th className="text-right">A Prod</th>
                            <th className="text-right">B Prod</th>
                            <th className="text-right">C Prod</th>
                            <th className="text-right">Total Prod</th>
                            <th className="text-right">Prod CNT</th>
                            <th className="text-right">Prod Diff</th>
                            <th className="text-right">Prod.Add.Factor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: Math.max(DETAIL_ROWS, detailRows.length + 2) }).map((_, i) => {
                            const d = detailRows[i];
                            return (
                              <tr key={i}>
                                <td className="mono text-[12px] text-center">{i + 1}</td>
                                <td><input name="detailDate" type="date" className="input-box mono text-[12px]" defaultValue={d?.detailDate ?? ""} /></td>
                                <td><input name="aProd" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={d?.aProd ?? ""} /></td>
                                <td><input name="bProd" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={d?.bProd ?? ""} /></td>
                                <td><input name="cProd" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={d?.cProd ?? ""} /></td>
                                <td><input name="totalProd" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={d?.totalProd ?? ""} /></td>
                                <td><input name="prodCnt" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={d?.prodCnt ?? ""} /></td>
                                <td><input name="prodDiff" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={d?.prodDiff ?? ""} /></td>
                                <td><input name="prodAddFactor" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={d?.prodAddFactor ?? ""} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-[10px] text-[var(--muted)] p-2 border-t border-black mono">
                      Empty rows are ignored on save.
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">PRODUCT</div>
                    <div className="grid grid-cols-1 gap-3 gform">
                      <div>
                        <label className="label block mb-1">Product Quality</label>
                        <Combobox name="productQuality" options={qualityOpts} defaultValue={editing?.productQuality ?? ""} className="input-box" placeholder="Select quality" />
                      </div>
                      <div>
                        <label className="label block mb-1">Product (Brand)</label>
                        <input name="productBrand" list="dp-brands" className="input-box" defaultValue={editing?.productBrand ?? ""} />
                      </div>
                      <div>
                        <label className="label block mb-1">Product Slvag</label>
                        <select name="productSlvag" className="input-box mono" defaultValue={editing?.productSlvag ?? ""}>
                          <option value=""></option>
                          {SELV_OPTIONS.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                          {editing?.productSlvag && !SELV_OPTIONS.includes(editing.productSlvag) && (
                            <option value={editing.productSlvag}>{editing.productSlvag}</option>
                          )}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">PARTIES</div>
                    <div className="grid grid-cols-1 gap-3 gform">
                      <div>
                        <label className="label block mb-1">Conv Cont Party</label>
                        <Combobox name="convContParty" options={partyOpts} defaultValue={editing?.convContParty ?? ""} placeholder="Select party" />
                      </div>
                      <div>
                        <label className="label block mb-1">Beam Cont Party</label>
                        <Combobox name="beamContParty" options={partyOpts} defaultValue={editing?.beamContParty ?? ""} placeholder="Select party" />
                      </div>
                      <div>
                        <label className="label block mb-1">Szg Party</label>
                        <Combobox name="szgParty" options={partyOpts} defaultValue={editing?.szgParty ?? ""} placeholder="Select party" />
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">SHIFT INCHARGE</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-3 gform">
                      <div>
                        <label className="label block mb-1">TM</label>
                        <select name="shiftInchargeTm" className="input-box mono" defaultValue={editing?.shiftInchargeTm ?? ""}>
                          <option value=""></option>
                          <option value="TEC">TEC</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="S14">S14</option>
                          <option value="S12">S12</option>
                          <option value="S13">S13</option>
                        </select>
                      </div>
                      <div>
                        <label className="label block mb-1">PM</label>
                        <select name="shiftInchargePm" className="input-box mono" defaultValue={editing?.shiftInchargePm ?? ""}>
                          <option value=""></option>
                          <option value="TEC">TEC</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="S14">S14</option>
                          <option value="S12">S12</option>
                          <option value="S13">S13</option>
                        </select>
                      </div>
                      <div>
                        <label className="label block mb-1">A (1)</label>
                        <select name="shiftInchargeA" className="input-box mono" defaultValue={editing?.shiftInchargeA ?? ""}>
                          <option value=""></option>
                          <option value="TEC">TEC</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="S14">S14</option>
                          <option value="S12">S12</option>
                          <option value="S13">S13</option>
                        </select>
                      </div>
                      <div>
                        <label className="label block mb-1">B (2)</label>
                        <select name="shiftInchargeB" className="input-box mono" defaultValue={editing?.shiftInchargeB ?? ""}>
                          <option value=""></option>
                          <option value="TEC">TEC</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="S14">S14</option>
                          <option value="S12">S12</option>
                          <option value="S13">S13</option>
                        </select>
                      </div>
                      <div>
                        <label className="label block mb-1">C (3)</label>
                        <select name="shiftInchargeC" className="input-box mono" defaultValue={editing?.shiftInchargeC ?? ""}>
                          <option value=""></option>
                          <option value="TEC">TEC</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="S14">S14</option>
                          <option value="S12">S12</option>
                          <option value="S13">S13</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">CODES</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-3 gform">
                      <div>
                        <label className="label block mb-1">No of widths</label>
                        <input name="noOfWidths" type="number" step="1" className="input-box mono text-right" defaultValue={editing?.noOfWidths ?? ""} />
                      </div>
                      <div>
                        <label className="label block mb-1">Prd Code</label>
                        <Combobox name="prodCode" options={productOpts} defaultValue={editing?.prodCode ?? ""} className="input-box mono" placeholder="Select product" />
                      </div>
                      <div>
                        <label className="label block mb-1">Lot#</label>
                        <input name="lotNo" className="input-box mono" defaultValue={editing?.lotNo ?? ""} />
                      </div>
                      <div>
                        <label className="label block mb-1">TOR OWN</label>
                        <select name="torOwn" className="input-box mono" defaultValue={editing?.torOwn ?? ""}>
                          <option value=""></option>
                          <option value="TOR">TOR</option>
                          <option value="OWN">OWN</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                <button type="submit" className="btn btn-sm">Save</button>
                <a href="/inventory/daily-production?adding=1" className="btn btn-outline btn-sm">New</a>
                <a href="/inventory/daily-production" className="btn btn-outline btn-sm">Exit</a>
                <div className="ml-auto flex items-end gap-4">
                  <div>
                    <label className="label block mb-1">Password</label>
                    <input className="input-box mono" placeholder="password" type="password" />
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="border border-black">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Recent Production Entries</div>
            <form className="flex gap-2" id="find-form" method="GET" action="/inventory/daily-production">
              <input name="find" className="input-box mono" defaultValue={params.find ?? ""} placeholder="Find V.No / Shed / Set# / Design#" />
              <button className="btn btn-outline btn-sm" type="submit">Find</button>
            </form>
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>Date</th>
                  <th>Shed</th>
                  <th>Set#</th>
                  <th>Design#</th>
                  <th>Grade</th>
                  <th>Product Quality</th>
                  <th>Product (Brand)</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const isSel = r.id === selected?.id;
                  const href = `/inventory/daily-production?id=${r.id}`;
                  const style = { color: isSel ? "white" : "inherit" } as const;
                  const total = rowTotals.get(r.id) ?? 0;
                  return (
                    <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={style}>{r.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.vDate}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.shedNo ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.setNo ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.designNo ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.grade ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>{r.productQuality ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>{r.productBrand ?? "-"}</a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{total || "-"}</a></td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-[13px] text-[var(--muted)] py-6">No entries. Click <b>New</b> above to create one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
