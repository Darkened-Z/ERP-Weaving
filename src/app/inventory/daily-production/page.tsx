import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { RowAutoFill, AutoFill } from "@/components/auto-fill";
import { FindingPicker } from "@/components/finding-picker";
import { ProductionSetCalc, LoomBeamsFill, BeamPartyFill, RowErase, HideEmptyRows } from "@/components/production-calc";
import { ThanSerialLive } from "@/components/than-serial-live";
import { loadConvContracts } from "@/lib/conv-contracts";
import { thanLetter } from "@/lib/than-serial";
import { WVG_CONVERSION_PREFIX } from "@/lib/coa-heads";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today, nowTime } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num, intVal, txt, escLike } from "@/lib/form";
import { DateBox } from "@/components/date-box";

export const dynamic = "force-dynamic";

const SET_ROWS = 8;

const SELV_OPTIONS = ["LENO", "PLAIN", "TAPE", "CATCH", "TUCK-IN"];

const infoCls = "input-box mono text-[12px] bg-gray-100";


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

  const maxRow = await db
    .select({
      maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intDailyProduction.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.intDailyProduction)
    .where(sql`${schema.intDailyProduction.vNo} LIKE 'IDP-%'`);
  const nextNum = (maxRow[0]?.maxNum ?? 0) + 1;
  const upcomingVNo = `IDP-${String(nextNum).padStart(4, "0")}`;

  // Beam Status choices (owner: only these five, Oracle list)
  const BEAM_STATUS_CHOICES = ["F-ROLL", "L-ROLL", "R-CUT", "RE-KNOT", "RUNNING"];
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
      shed: schema.beams.shed,
      knVno: schema.beams.knVno,
      partyTrade: schema.beams.partyTrade,
      szgParty: schema.beams.szgParty,
      brVno: schema.beams.brVno,
    })
    .from(schema.beams)
    .orderBy(schema.beams.beamNo);

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);
  // PARTIES section (owner): only the mill's own conversion parties (786 weaving
  // and friends under DEBTORS-CONVERSION WVG 1.01.01.01.*) — other contractors'
  // accounts must not appear in these dropdowns.
  const convPartyOpts = parties
    .filter((p) => String(p.code).startsWith(WVG_CONVERSION_PREFIX))
    .map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  // Szg Party is a SIZING creditor (CREDITOR - SIZING COMMERCIAL), not a
  // conversion debtor — same head the Warped Beam Receiving "Beam Receiving From"
  // picker uses, so a beam's sizing party can round-trip into this form.
  const [sizingHead] = await db
    .select({ code: schema.chartOfAccounts.code })
    .from(schema.chartOfAccounts)
    .where(
      sql`${schema.chartOfAccounts.level} = 4 AND upper(${schema.chartOfAccounts.description}) LIKE '%SIZING%COMMERCIAL%'`
    )
    .limit(1);
  const sizingPrefix = sizingHead?.code ? `${sizingHead.code}.` : null;
  const szgPartyOpts = sizingPrefix
    ? parties
        .filter((p) => String(p.code).startsWith(sizingPrefix))
        .map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }))
    : convPartyOpts;
  const descByCode = new Map(parties.map((p) => [String(p.code), p.description]));
  // Beams carry no party of their own yet — the warped-beam receiving bill that
  // brought the beam in holds both (sizing party = who sized it, bm sale party =
  // the conversion party it was bought for), keyed by the beam's brVno.
  const receivingParties = new Map<string, { szg: string | null; sale: string | null }>();
  {
    const recv = await db
      .select({
        vNo: schema.intWarpedBeamReceiving.vNo,
        from: schema.intWarpedBeamReceiving.beamReceivingFrom,
        sale: schema.intWarpedBeamReceiving.bmSaleParty,
      })
      .from(schema.intWarpedBeamReceiving);
    for (const r of recv) {
      receivingParties.set(r.vNo, {
        szg: r.from ? descByCode.get(r.from) ?? r.from : null,
        sale: r.sale ? descByCode.get(r.sale) ?? r.sale : null,
      });
    }
  }


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

  // Rcvd/Mtr opening balance = the Rcvd/Mtr the LAST saved voucher stamped on that
  // beam (owner), which the new voucher's own meters then build on. Rows come back
  // oldest-first so the last write per beam wins. Falls back to the accumulated sum
  // for beams whose earlier vouchers predate the stored rcvdMtr.
  const lastRcvdRows = await db
    .select({
      beamNo: schema.intDailyProductionSet.beamNo,
      rcvdMtr: schema.intDailyProductionSet.rcvdMtr,
    })
    .from(schema.intDailyProductionSet)
    .where(
      editing
        ? and(
            isNotNull(schema.intDailyProductionSet.beamNo),
            isNotNull(schema.intDailyProductionSet.rcvdMtr),
            ne(schema.intDailyProductionSet.productionId, editing.id)
          )
        : and(
            isNotNull(schema.intDailyProductionSet.beamNo),
            isNotNull(schema.intDailyProductionSet.rcvdMtr)
          )
    )
    .orderBy(schema.intDailyProductionSet.id);

  const beamStats: Record<string, { rcvd: number; length: number | null }> = {};
  for (const b of beamCatalog) {
    if (b.beamNo) beamStats[b.beamNo] = { rcvd: 0, length: b.length ?? null };
  }
  for (const r of accumRowsRaw) {
    if (!r.beamNo) continue;
    if (!beamStats[r.beamNo]) beamStats[r.beamNo] = { rcvd: 0, length: null };
    beamStats[r.beamNo].rcvd = Number(r.total ?? 0);
  }
  for (const r of lastRcvdRows) {
    if (!r.beamNo) continue;
    if (!beamStats[r.beamNo]) beamStats[r.beamNo] = { rcvd: 0, length: null };
    beamStats[r.beamNo].rcvd = Number(r.rcvdMtr ?? 0);
  }

  const beamFillMap: Record<string, Record<string, string | number | null>> = {};
  const beamByNo = new Map<string, (typeof beamCatalog)[0]>();
  for (const b of beamCatalog) {
    if (!b.beamNo) continue;
    beamByNo.set(b.beamNo, b);
    beamFillMap[b.beamNo] = {
      ends: b.ends ?? null,
      bLength: b.length ?? null,
      beamSetNo: b.beamSetNo ?? null,
      setHash: b.setNo ?? null,
      // Beam picked into production → its status moves to PRODUCTION on save
      // (the grid's Beam Status is applied to the beam; operator can override).
      beamStatus: "RUNNING",
      contNo: b.contractNo ?? null,
    };
  }
  // Map beamNo → every party the beam knows, for BeamPartyFill (header PARTIES
  // auto-fill). The beam's own columns win; its receiving bill fills the gaps.
  const partiesOfBeam = (b: (typeof beamCatalog)[number]) => {
    const recv = b.brVno ? receivingParties.get(b.brVno) : undefined;
    return {
      beamContParty: b.partyTrade ?? recv?.sale ?? null,
      szgParty: b.szgParty ?? recv?.szg ?? null,
    };
  };
  const beamPartyMap: Record<string, { beamContParty: string | null; szgParty: string | null; contNo: string | null }> = {};
  for (const b of beamCatalog) {
    if (b.beamNo) beamPartyMap[b.beamNo] = { ...partiesOfBeam(b), contNo: b.contractNo ?? null };
  }

  // Mounted beams — KNOTTING after the knotting bill, PRODUCTION once already in
  // production, RUNNING kept for pre-lifecycle records. The SET NO LIST + loom→beam source.
  // A beam is ON a loom from the moment knotting mounts it until production
  // empties it. That includes every status daily production itself assigns
  // (BEAM_STATUS_CHOICES) — a beam at L-ROLL is still on the loom being woven, so
  // leaving those out made it vanish from the picker mid-run. Only EMPTY (freed)
  // and LOADED (received, never knotted) are not mounted.
  const MOUNTED = new Set(["KNOTTING", "PRODUCTION", ...BEAM_STATUS_CHOICES]);
  const runningBeams = beamCatalog.filter((b) => MOUNTED.has((b.statusWrk ?? "").toUpperCase()));
  const beamPickerRows = runningBeams.map((b) => ({
    value: b.beamNo as string,
    code: b.beamNo as string,
    description: b.setNo ?? b.beamSetNo ?? "",
    // Scoped to the header Loom# — the list must offer only the beams mounted on
    // THAT loom. A beam missing its shed/loom stamp carries no key and stays
    // visible, so a half-recorded beam is never silently unpickable.
    filterKey: b.shed && b.loomNo != null ? `${b.shed}|${b.loomNo}` : "",
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
  // Loom → mounted beams. Loom numbers REPEAT across sheds (shed 1 loom 1, shed 2
  // loom 1, …), so lookups are scoped by "shed|loomNo" first, with a loomNo-only
  // fallback for legacy beams mounted before the shed was stamped. A loom can
  // carry SEVERAL knotted beams — the header Loom# pick opens all of them.
  const beamsByLoom = new Map<string, (typeof runningBeams)[number][]>();
  const beamsByLoomNo = new Map<number, (typeof runningBeams)[number][]>();
  for (const b of runningBeams) {
    if (b.loomNo == null) continue;
    if (b.shed) {
      const k = `${b.shed}|${b.loomNo}`;
      (beamsByLoom.get(k) ?? beamsByLoom.set(k, []).get(k)!).push(b);
    }
    (beamsByLoomNo.get(b.loomNo) ?? beamsByLoomNo.set(b.loomNo, []).get(b.loomNo)!).push(b);
  }
  // Loom numbers repeat across sheds, so the shed-scoped key is the answer. The
  // loomNo-only fallback exists ONLY for legacy beams that carry no shed stamp —
  // it must never widen to another shed's beams. It used to fall back whenever
  // the scoped lookup was empty, so an emptied Shed 1 Loom 7 offered Shed 2 Loom
  // 7's beam.
  const beamsForLoom = (shed: string | null, loomNo: number) => {
    const scoped = (shed ? beamsByLoom.get(`${shed}|${loomNo}`) : undefined) ?? [];
    const unshedded = (beamsByLoomNo.get(loomNo) ?? []).filter((b) => !b.shed);
    return [...scoped, ...unshedded];
  };
  const firstBeamForLoom = (shed: string | null, loomNo: number) => beamsForLoom(shed, loomNo)[0];

  // Loom LOV (shed-scoped via filterKey) + fill map from each loom's RUNNING beam.
  const loomRows2 = await db
    .select({ loomNo: schema.looms.loomNo, shed: schema.looms.shed, rpm: schema.looms.rpm, statusWrk: schema.looms.statusWrk, currentContract: schema.looms.currentContract, currentBeam: schema.looms.currentBeam })
    .from(schema.looms)
    .orderBy(schema.looms.shed, schema.looms.loomNo);
  const loomPickerRows = loomRows2.map((lm) => {
    // Use looms.currentBeam (authoritative — set by knotting) over beams.loomNo lookup.
    const b = (lm.currentBeam ? beamByNo.get(lm.currentBeam) : undefined) ?? firstBeamForLoom(lm.shed, lm.loomNo);
    return {
      // Composite "shed|loomNo" value (same convention as the knotting loom
      // picker) — loom numbers repeat across sheds, so a bare loomNo is ambiguous.
      value: `${lm.shed ?? ""}|${lm.loomNo}`,
      // Reads "Shed 1 — Loom 24"; the value still carries the composite.
      code: `Shed ${lm.shed ?? ""}`,
      description: `Loom ${lm.loomNo}`,
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
  // Header Loom# (F9) pick → ALL mounted beams of that loom fill the beam grid
  // (row 1 = first beam, row 2 = second, …). The first beam's setNo echoes into
  // the header Set# field (Oracle parity).
  const loomBeamsMap: Record<
    string,
    {
      beamNo: string | null;
      beamSetNo: string | null;
      setHash: string | null;
      beamStatus: string | null;
      ends: number | null;
      bLength: number | null;
      contNo: string | null;
      setNo?: string | null;
      partyTrade?: string | null;
      szgParty?: string | null;
    }[]
  > = {};
  for (const lm of loomRows2) {
    // Owner: a loom pick opens the beams MOUNTED on that loom (knotted there —
    // including ones already past knotting into production, since daily
    // production runs on the same beam daily). A loom with no mounted beams
    // fills nothing. In EDIT mode this voucher's own beams stay included so a
    // re-pick never wipes saved rows.
    const voucherBeamNos = new Set(
      setRows.map((s) => (s.beamNo ?? "").trim()).filter(Boolean)
    );
    // looms.currentBeam is the authoritative beam for this loom (set by knotting).
    // Use it as primary; supplement with beams.loomNo lookup for additional knotted beams.
    const primaryBeam = lm.currentBeam ? beamByNo.get(lm.currentBeam) : undefined;
    const byLoomNo = beamsForLoom(lm.shed, lm.loomNo);
    const allForLoom = primaryBeam
      ? [primaryBeam, ...byLoomNo.filter((b) => b.beamNo !== primaryBeam.beamNo)]
      : byLoomNo;
    loomBeamsMap[`${lm.shed ?? ""}|${lm.loomNo}`] = allForLoom
      .filter((b) => {
        if (editing != null && voucherBeamNos.has((b.beamNo ?? "").trim())) return true;
        return MOUNTED.has((b.statusWrk ?? "").toUpperCase());
      })
      .map((b) => ({
        beamNo: b.beamNo ?? null,
        beamSetNo: b.beamSetNo ?? null,
        setHash: b.setNo ?? null,
        beamStatus: "RUNNING",
        ends: b.ends ?? null,
        bLength: b.length ?? null,
        contNo: b.contractNo ?? null,
        setNo: b.setNo ?? null,
        partyTrade: partiesOfBeam(b).beamContParty,
        szgParty: partiesOfBeam(b).szgParty,
      }));
  }

  // Folding Stock by conv party — the header's Folding Stock box is readonly and
  // auto-fills when a Conv Cont Party is picked (server recomputes on save too).
  const foldingByParty: Record<string, Record<string, string | number | null>> = {};
  {
    const prodByParty = await db
      .select({
        party: schema.intDailyProduction.convContParty,
        s: sql<number>`COALESCE(SUM(COALESCE(${schema.intDailyProductionSet.totalCount},0)),0)`,
      })
      .from(schema.intDailyProductionSet)
      .innerJoin(schema.intDailyProduction, eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id))
      .groupBy(schema.intDailyProduction.convContParty);
    const despByParty = await db
      .select({
        party: schema.intGreyDespatch.party,
        s: sql<number>`COALESCE(SUM(COALESCE(${schema.intGreyDespatchLine.lengthMtrs},0)),0)`,
      })
      .from(schema.intGreyDespatchLine)
      .innerJoin(schema.intGreyDespatch, eq(schema.intGreyDespatchLine.despatchId, schema.intGreyDespatch.id))
      .groupBy(schema.intGreyDespatch.party);
    const despMap = new Map(despByParty.map((d) => [d.party ?? "", Number(d.s ?? 0)]));
    for (const p of prodByParty) {
      if (!p.party) continue;
      const val = Math.round((Number(p.s ?? 0) - (despMap.get(p.party) ?? 0)) * 100) / 100;
      foldingByParty[p.party] = { foldingStock: val };
    }
  }

  // Grey conversion contract LOV — from BOTH internal (IGCC) and external (GCC)
  // tables, scoped to the mill's OWN conversion parties only (1.01.01.01.*, e.g.
  // 786 weaving) — other contractors' contracts must not appear (owner).
  const convPartyCodes = new Set(
    parties
      .filter((p) => String(p.code).startsWith(WVG_CONVERSION_PREFIX))
      .map((p) => p.description)
  );
  const convContracts = (await loadConvContracts()).filter(
    (c) => c.party && convPartyCodes.has(c.party.trim())
  );

  // Yarn spec per contract — READ × PICK off the contract head, warp/weft yarn
  // descriptions off its count grids. Shown under the PARTIES boxes (owner) so the
  // operator can see what the beam on the loom is actually weaving.
  const yarnSpecByCont: Record<string, { yarnReadPick: string; yarnWarpInfo: string; yarnWeftInfo: string; beamWeftInfo: string }> = {};
  {
    type YarnRow = { contractId: number; count: string | null; descr: string | null; brand: string | null; ends: number | null };
    const yarnCols = <T extends typeof schema.intGreyConversionWarp | typeof schema.intGreyConversionWeft | typeof schema.extGreyConvWarp | typeof schema.extGreyConvWeft>(t: T) => ({
      contractId: t.contractId, count: t.count, descr: t.descr, brand: t.brand, ends: t.ends,
    });
    const [intIds, extIds, intWarp, intWeft, extWarp, extWeft] = await Promise.all([
      db.select({ id: schema.intGreyConversionContract.id, contNo: schema.intGreyConversionContract.contNo }).from(schema.intGreyConversionContract),
      db.select({ id: schema.extGreyConvContract.id, contNo: schema.extGreyConvContract.contNo }).from(schema.extGreyConvContract),
      db.select(yarnCols(schema.intGreyConversionWarp)).from(schema.intGreyConversionWarp).orderBy(schema.intGreyConversionWarp.srNo),
      db.select(yarnCols(schema.intGreyConversionWeft)).from(schema.intGreyConversionWeft).orderBy(schema.intGreyConversionWeft.srNo),
      db.select(yarnCols(schema.extGreyConvWarp)).from(schema.extGreyConvWarp).orderBy(schema.extGreyConvWarp.srNo),
      db.select(yarnCols(schema.extGreyConvWeft)).from(schema.extGreyConvWeft).orderBy(schema.extGreyConvWeft.srNo),
    ]);
    const collect = (rows: YarnRow[], idToCont: Map<number, string>, withEnds: boolean) => {
      const out = new Map<string, string[]>();
      for (const r of rows) {
        const cn = idToCont.get(r.contractId);
        if (!cn) continue;
        const head = [r.count ? `${r.count}.` : "", r.descr ?? "", r.brand ?? ""].filter(Boolean).join(" ").trim();
        const text = withEnds && r.ends != null ? `${head} — ${r.ends} E` : head;
        if (text) (out.get(cn) ?? out.set(cn, []).get(cn)!).push(text);
      }
      return out;
    };
    const intMap = new Map(intIds.map((c) => [c.id, c.contNo]));
    const extMap = new Map(extIds.map((c) => [c.id, c.contNo]));
    // Ends on BOTH sides: a contract often carries the same yarn on warp and weft,
    // so without them the two lines read as duplicates when they are not (warp
    // ends vs weft pick × width).
    const warpByCont = new Map([...collect(intWarp, intMap, true), ...collect(extWarp, extMap, true)]);
    const weftByCont = new Map([...collect(intWeft, intMap, true), ...collect(extWeft, extMap, true)]);
    for (const c of convContracts) {
      const weft = (weftByCont.get(c.contNo) ?? []).join("  +  ");
      yarnSpecByCont[c.contNo] = {
        yarnReadPick: c.read != null && c.pick != null ? `${c.read} × ${c.pick}` : "",
        yarnWarpInfo: (warpByCont.get(c.contNo) ?? []).join("  +  "),
        yarnWeftInfo: weft,
        beamWeftInfo: weft,
      };
    }
  }
  // Beams carry no contract in practice, so a beam pick alone can't reach the
  // spec. When a party runs exactly ONE conversion contract the spec is still
  // unambiguous — fill it from the party. Parties with several contracts wait for
  // the contract pick rather than showing one of them at random.
  const partySpecMap: Record<string, Record<string, string>> = {};
  {
    const byParty = new Map<string, string[]>();
    for (const c of convContracts) {
      const p = c.party?.trim();
      if (!p) continue;
      (byParty.get(p) ?? byParty.set(p, []).get(p)!).push(c.contNo);
    }
    for (const [party, contNos] of byParty) {
      if (contNos.length !== 1) continue;
      const spec = yarnSpecByCont[contNos[0]];
      if (spec) partySpecMap[party] = { ...spec };
    }
  }
  const SPEC_INPUTS = ["beamWeftInfo", "yarnWarpInfo", "yarnWeftInfo", "yarnReadPick"];

  // Edit mode: the voucher stores its contract per beam row, so the spec boxes can
  // be rendered server-side from the first row that carries one.
  const editingContNo = setRows.find((s) => (s.contNo ?? "").trim())?.contNo?.trim() ?? "";
  // Neither the header Loom# nor the Conv Contract has a column of its own, so on
  // edit they came back blank. Recover both from what the rows DO store: the
  // contract off the first row that carries one, the loom off the first beam that
  // is actually mounted (a beam never knotted onto a loom still yields nothing).
  const editingLoom = (() => {
    for (const r of setRows) {
      const b = r.beamNo ? beamByNo.get(r.beamNo) : undefined;
      if (b?.shed && b.loomNo != null) return `${b.shed}|${b.loomNo}`;
    }
    return "";
  })();
  const editingSpec = yarnSpecByCont[editingContNo] ?? { yarnReadPick: "", yarnWarpInfo: "", yarnWeftInfo: "", beamWeftInfo: "" };
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
        brand: c.brand ?? "",
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
      productBrand: c.brand ?? "",
      convContParty: c.party ?? "",
      ...yarnSpecByCont[c.contNo],
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

  // LV.No = the voucher's own ledger number. A new voucher shows the one it is
  // about to take (max + 1), the same way V.No shows upcomingVNo — it used to
  // show MAX(lvNo) and nothing ever assigned it, so every voucher saved 0.
  const lvRow = await db
    .select({ m: sql<number>`COALESCE(MAX(${schema.intDailyProduction.lvNo}),0)` })
    .from(schema.intDailyProduction);
  const maxLvNo = Number(lvRow[0]?.m ?? 0);


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
      billNo: txt(formData.get("billNo")),
      billDate: txt(formData.get("billDate")),
      billingStatus: txt(formData.get("billingStatus")),
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
    const contNoArr = formData.getAll("contNo") as string[];
    // The row's contract comes off its beam, but beams carry no contract in
    // practice — so the header's picked contract stands in. Without it every set
    // row saves with cont_no NULL, which leaves grey despatch unable to scope
    // thans by contract and the folding-stock rate lookup with nothing to find.
    const headerContract = txt(formData.get("conv_contract")) ?? "";
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
    // Grid row index per saved set — blank rows are skipped, so a set's position
    // in validSets is not its row. The than letter must follow the ROW the
    // operator typed into, exactly as ThanSerialLive numbered it on screen.
    const gridRowOf: number[] = [];
    // Bound by the mm/Than serial column (always rendered). Set# and Loom# were
    // removed from the grid (owner) — setHash stays null; the loom lives in the
    // header and only its mounted beams fill the beam rows.
    for (let i = 0; i < mmThanSrNoArr.length; i++) {
      const setHash: string | null = (setHashArr[i] || "").trim() || null;
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
      // Loom moved to the header (owner) — rows no longer carry a loom cell; the
      // beam's loom stays whatever the knotting mount stamped on the beam.
      const ln: number | null = null;
      const cn = (contNoArr[i] || "").trim() || headerContract;
      const en = intVal(endsArr[i]);
      const bl = num(bLengthArr[i]);
      const rm = num(rcvdMtrArr[i]);
      const df = num(diffArr[i]);
      const sh = num(shrinkageArr[i]);
      // A row counts only when it carries something of its own. Two fields are
      // NOT substance: the pre-filled than serial, and contNo — the contract is
      // stamped across the grid, so a blank row still carries it. Counting contNo
      // saved a blank row per grid slot, which then re-rendered with the contract
      // still on it and saved itself again on every edit.
      const hasSubstance =
        !!setHash || aC != null || bC != null || cC != null || cpC != null || ppc != null ||
        tc != null || rc != null || !!bsn || !!kt || !!kd || !!bs || ww != null || !!bn ||
        en != null || bl != null || rm != null || df != null || sh != null;
      if (!hasSubstance) continue;
      // Server-authoritative total: Total = A + B + C + CP + PPC. Any manually
      // typed totalCount is discarded — the client shows it as a readonly cell.
      const anyCount = aC != null || bC != null || cC != null || cpC != null || ppc != null;
      const authoritativeTotal = anyCount
        ? (aC ?? 0) + (bC ?? 0) + (cC ?? 0) + (cpC ?? 0) + (ppc ?? 0)
        : tc;
      gridRowOf.push(i);
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

    // Shed/loom come off the BEAM. Shed No is no longer a field on this form and
    // the grid's loom cell is only filled when the beam was picked with a loom,
    // so without this every saved row lands with shed_no and loom_no NULL and the
    // production reports cannot group by shed at all. Stamp both from the beam
    // the row names, and give the header the shed of its first beam.
    const namedBeams = Array.from(
      new Set(validSets.map((s) => (s.beamNo ?? "").trim()).filter(Boolean)),
    );
    if (namedBeams.length) {
      const beamRows = await db
        .select({ beamNo: schema.beams.beamNo, shed: schema.beams.shed, loomNo: schema.beams.loomNo })
        .from(schema.beams)
        .where(inArray(schema.beams.beamNo, namedBeams));
      const byBeam = new Map(beamRows.map((b) => [b.beamNo, b]));
      for (const st of validSets) {
        const b = byBeam.get((st.beamNo ?? "").trim());
        if (!b) continue;
        if (st.loomNo == null && b.loomNo != null) st.loomNo = b.loomNo;
      }
      if (!header.shedNo) {
        const firstShed = validSets
          .map((st) => byBeam.get((st.beamNo ?? "").trim())?.shed)
          .find((x) => !!x);
        if (firstShed) header.shedNo = firstShed;
      }
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

    const formVNo = ((formData.get("vNo") as string) || "").trim();

    // ALT+Z PROD DETAIL grid removed (owner) — the detail table is no longer
    // written; its columns stay in the schema untouched.

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
      const wanted = new Set(foldingContNos);
      for (const r of await loadConvContracts()) {
        if (!wanted.has(r.contNo)) continue;
        convRateByCont.set(r.contNo, r.convRatePerMtr ?? r.grayRatePerMtr ?? r.rateMtr ?? 0);
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
    // Beam party must match conv party when both are set.
    const beamPartyHeader = (header.beamContParty ?? "").trim();
    if (headerConvParty && beamPartyHeader && headerConvParty !== beamPartyHeader) {
      const q = Number.isFinite(id) && id > 0 ? `?id=${id}&error=party_mismatch` : `?adding=1&error=party_mismatch`;
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

    // Folding Stock is SERVER-computed (owner: auto, not editable) — production −
    // despatch for the voucher's conv party, written back into the header row.
    if (convPartyDesc) {
      const prodRow = await db
        .select({ s: sql<number>`COALESCE(SUM(COALESCE(${schema.intDailyProductionSet.totalCount},0)),0)` })
        .from(schema.intDailyProductionSet)
        .innerJoin(schema.intDailyProduction, eq(schema.intDailyProductionSet.productionId, schema.intDailyProduction.id))
        .where(eq(schema.intDailyProduction.convContParty, convPartyDesc));
      const despRow = await db
        .select({ s: sql<number>`COALESCE(SUM(COALESCE(${schema.intGreyDespatchLine.lengthMtrs},0)),0)` })
        .from(schema.intGreyDespatchLine)
        .innerJoin(schema.intGreyDespatch, eq(schema.intGreyDespatchLine.despatchId, schema.intGreyDespatch.id))
        .where(eq(schema.intGreyDespatch.party, convPartyDesc));
      header.foldingStock =
        Math.round((Number(prodRow[0]?.s ?? 0) - Number(despRow[0]?.s ?? 0)) * 100) / 100;
    }

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
          // Per-ROW delivery memory (serial + beam) — rows of one voucher share a
          // serial now, so a serial-only key would cross-mark the A/B/C thans.
          const oldDelivered = new Map<string, string | null>();
          for (const os of oldSets) {
            if (os.beamNo) oldBeamStatus.set(os.beamNo, os.beamStatus ?? null);
            if (os.mmThanSrNo) oldDelivered.set(`${os.mmThanSrNo}::${os.beamNo ?? ""}`, os.dlvStatus ?? null);
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

          validSets.forEach((s, k) => {
            if (!s.mmThanSrNo && (s.beamNo || s.setHash || (s.totalCount ?? 0) > 0)) {
              s.mmThanSrNo = `${formVNo}/${thanLetter(gridRowOf[k])}`;
            }
          });

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

          // Re-stamp dlvStatus='Y' per ROW where the old voucher already delivered.
          for (const s of validSets) {
            if (!s.mmThanSrNo) continue;
            if (oldDelivered.get(`${s.mmThanSrNo}::${s.beamNo ?? ""}`) !== "Y") continue;
            await tx
              .update(schema.intDailyProductionSet)
              .set({ dlvStatus: "Y" })
              .where(
                and(
                  eq(schema.intDailyProductionSet.productionId, id),
                  eq(schema.intDailyProductionSet.mmThanSrNo, s.mmThanSrNo),
                  s.beamNo
                    ? eq(schema.intDailyProductionSet.beamNo, s.beamNo)
                    : isNotNull(schema.intDailyProductionSet.beamNo)
                )
              );
          }

          // Beam lifecycle: apply this voucher's beam statuses, then revert
          // beams the new grid dropped back to EMPTY (no history to restore to).
          for (const s of validSets) {
            if (!s.beamNo || !s.beamStatus) continue;
            // L-ROLL is the LAST roll — the beam is finished, so it comes off the
            // loom exactly like EMPTY and the loom is free for the next knotting.
            // (F-ROLL / R-CUT / RE-KNOT are mid-run and keep the beam mounted.)
            const done = ["EMPTY", "L-ROLL"].includes(s.beamStatus.toUpperCase());
            const patch: { statusWrk: string; loomNo?: number | null } = {
              statusWrk: done ? "EMPTY" : s.beamStatus,
            };
            if (done) patch.loomNo = null;
            const [was] = done
              ? await tx
                  .select({ shed: schema.beams.shed, loomNo: schema.beams.loomNo })
                  .from(schema.beams)
                  .where(eq(schema.beams.beamNo, s.beamNo))
                  .limit(1)
              : [undefined];
            await tx.update(schema.beams).set(patch).where(eq(schema.beams.beamNo, s.beamNo));
            if (done && was?.shed && was.loomNo != null) {
              await tx
                .update(schema.looms)
                .set({ statusWrk: "S", currentBeam: null, currentContract: null })
                .where(and(eq(schema.looms.loomNo, was.loomNo), eq(schema.looms.shed, was.shed)));
            }
          }
          const newBeams = new Set(validSets.map((s) => s.beamNo).filter((b): b is string => !!b));
          // Beams the new grid dropped: revert to the knotting mount (KNOTTING)
          // when the beam still carries its knotting voucher — EMPTY only for
          // beams that were never knotted. Prevents a deleted production voucher
          // from un-mounting a beam that knotting mounted.
          const droppedBeams = [...oldBeamStatus.keys()].filter((b) => !newBeams.has(b));
          const droppedKnot = new Map<string, boolean>();
          if (droppedBeams.length) {
            const rows0 = await tx
              .select({ beamNo: schema.beams.beamNo, knVno: schema.beams.knVno })
              .from(schema.beams)
              .where(sql`${schema.beams.beamNo} IN (${sql.join(droppedBeams.map((b) => sql`${b}`), sql`, `)})`);
            for (const r of rows0) droppedKnot.set(r.beamNo, !!r.knVno);
          }
          for (const oldBeam of droppedBeams) {
            const knotted = droppedKnot.get(oldBeam) ?? false;
            await tx
              .update(schema.beams)
              .set(knotted ? { statusWrk: "KNOTTING" } : { statusWrk: "EMPTY", loomNo: null })
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
              // Last roll: the beam is spent, so free the LOOM too — otherwise it
              // keeps pointing at an exhausted beam and never reads as available
              // for the next knotting.
              const [spent] = await tx
                .select({ shed: schema.beams.shed, loomNo: schema.beams.loomNo })
                .from(schema.beams)
                .where(eq(schema.beams.beamNo, beamNo))
                .limit(1);
              await tx.update(schema.beams).set({ statusWrk: "EMPTY", loomNo: null }).where(eq(schema.beams.beamNo, beamNo));
              if (spent?.shed && spent.loomNo != null) {
                await tx
                  .update(schema.looms)
                  .set({ statusWrk: "S", currentBeam: null, currentContract: null })
                  .where(and(eq(schema.looms.loomNo, spent.loomNo), eq(schema.looms.shed, spent.shed)));
              }
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
        const newId = await db.transaction(async (tx) => {
          let vNo = formVNo;
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

          validSets.forEach((s, k) => {
            if (!s.mmThanSrNo && (s.beamNo || s.setHash || (s.totalCount ?? 0) > 0)) {
              s.mmThanSrNo = `${vNo}/${thanLetter(gridRowOf[k])}`;
            }
          });

          const inputSerials = validSets.map((s) => s.mmThanSrNo).filter((x): x is string => !!x);
          if (inputSerials.length) {
            const dupRows = await tx
              .select({ mm: schema.intDailyProductionSet.mmThanSrNo })
              .from(schema.intDailyProductionSet)
              .where(inArray(schema.intDailyProductionSet.mmThanSrNo, inputSerials));
            if (dupRows.some((r) => !!r.mm)) throw new Error("DUP_THAN");
          }

          const lvRows = await tx
            .select({ lv: schema.intDailyProduction.lvNo })
            .from(schema.intDailyProduction);
          const nextLv = lvRows.reduce((m, r) => Math.max(m, r.lv ?? 0), 0) + 1;
          const inserted = await tx
            .insert(schema.intDailyProduction)
            .values({ ...header, vNo, lvNo: nextLv, postedDate: nowIso })
            .returning({ id: schema.intDailyProduction.id });
          const insertedId = inserted[0].id;
          if (validSets.length) {
            await tx
              .insert(schema.intDailyProductionSet)
              .values(validSets.map((s) => ({ ...s, productionId: insertedId })));
          }
          for (const s of validSets) {
            if (!s.beamNo || !s.beamStatus) continue;
            // L-ROLL is the LAST roll — the beam is finished, so it comes off the
            // loom exactly like EMPTY and the loom is free for the next knotting.
            // (F-ROLL / R-CUT / RE-KNOT are mid-run and keep the beam mounted.)
            const done = ["EMPTY", "L-ROLL"].includes(s.beamStatus.toUpperCase());
            const patch: { statusWrk: string; loomNo?: number | null } = {
              statusWrk: done ? "EMPTY" : s.beamStatus,
            };
            if (done) patch.loomNo = null;
            const [was] = done
              ? await tx
                  .select({ shed: schema.beams.shed, loomNo: schema.beams.loomNo })
                  .from(schema.beams)
                  .where(eq(schema.beams.beamNo, s.beamNo))
                  .limit(1)
              : [undefined];
            await tx.update(schema.beams).set(patch).where(eq(schema.beams.beamNo, s.beamNo));
            if (done && was?.shed && was.loomNo != null) {
              await tx
                .update(schema.looms)
                .set({ statusWrk: "S", currentBeam: null, currentContract: null })
                .where(and(eq(schema.looms.loomNo, was.loomNo), eq(schema.looms.shed, was.shed)));
            }
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
              // Last roll: the beam is spent, so free the LOOM too — otherwise it
              // keeps pointing at an exhausted beam and never reads as available
              // for the next knotting.
              const [spent] = await tx
                .select({ shed: schema.beams.shed, loomNo: schema.beams.loomNo })
                .from(schema.beams)
                .where(eq(schema.beams.beamNo, beamNo))
                .limit(1);
              await tx.update(schema.beams).set({ statusWrk: "EMPTY", loomNo: null }).where(eq(schema.beams.beamNo, beamNo));
              if (spent?.shed && spent.loomNo != null) {
                await tx
                  .update(schema.looms)
                  .set({ statusWrk: "S", currentBeam: null, currentContract: null })
                  .where(and(eq(schema.looms.loomNo, spent.loomNo), eq(schema.looms.shed, spent.shed)));
              }
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
      // Deleting the voucher releases its beams, but a beam mounted by a knotting
      // bill goes back to KNOTTING (not EMPTY) — the mount must survive.
      const delBeams = oldSets.map((os) => os.beamNo).filter((b): b is string => !!b);
      const delKnot = new Map<string, boolean>();
      if (delBeams.length) {
        const rows0 = await tx
          .select({ beamNo: schema.beams.beamNo, knVno: schema.beams.knVno })
          .from(schema.beams)
          .where(sql`${schema.beams.beamNo} IN (${sql.join(delBeams.map((b) => sql`${b}`), sql`, `)})`);
        for (const r of rows0) delKnot.set(r.beamNo, !!r.knVno);
      }
      for (const os of oldSets) {
        if (!os.beamNo) continue;
        const knotted = delKnot.get(os.beamNo) ?? false;
        await tx
          .update(schema.beams)
          .set(knotted ? { statusWrk: "KNOTTING" } : { statusWrk: "EMPTY", loomNo: null })
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
            At least one row must have a Beam # (fill it in BEAM DETAILS below, or pick a header Loom#).
          </div>
        )}
        {params.error === "party_cross" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Party cross — every beam&apos;s contract must belong to the same conversion party. Fix the loom/contract selection.
          </div>
        )}
        {params.error === "party_mismatch" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Party mismatch — Conv Contract Party and Beam Cost Party must be the same. Check the Parties section before saving.
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
              {/* Blank rows auto-hide — only rows in use stay visible (min 1) */}
              <HideEmptyRows tbodyIds={["idp-beam-rows", "idp-count-rows"]} />
              <ThanSerialLive vNo={editing?.vNo ?? upcomingVNo} />
              <RowAutoFill watch="beamNo" map={beamFillMap} />
              {/* Beam pick (manual or via loom) → fills header Beam Cost Party */}
              <BeamPartyFill map={beamPartyMap} />
              {/* Header Loom# pick → ALL of that loom's knotted beams open in the beam grid */}
              <LoomBeamsFill map={loomBeamsMap} maxRows={SET_ROWS} />
              {/* ✕ buttons erase the whole logical row across both containers */}
              <RowErase tbodyId="idp-beam-rows" pairTbodyId="idp-count-rows" />
              <RowErase tbodyId="idp-count-rows" pairTbodyId="idp-beam-rows" />
              {/* Folding Stock auto-fills from the picked conv party — readonly box */}
              <AutoFill watch="convContParty" map={foldingByParty} inputs={["foldingStock"]} />
              <AutoFill
                watch="conv_contract"
                map={contractFillMap}
                combos={["productQuality", "convContParty"]}
                inputs={["productBrand", ...SPEC_INPUTS]}
              />
              {/* A beam pick reaches only the parties, so the spec follows the party
                  too whenever that party runs a single conversion contract. */}
              <AutoFill watch="beamContParty" map={partySpecMap} inputs={SPEC_INPUTS} />
              <AutoFill watch="convContParty" map={partySpecMap} inputs={SPEC_INPUTS} />
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
                    <DateBox name="vDate" className="input-box mono" defaultValue={editing?.vDate ?? today()} required />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label block mb-1">No.</label>
                    <input name="vNo" className="input-box mono bg-gray-100" defaultValue={editing?.vNo ?? upcomingVNo} readOnly />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label block mb-1">LV.No</label>
                    <input name="lvNo" type="number" step="1" className="input-box mono bg-gray-100" defaultValue={editing?.lvNo ?? maxLvNo + 1} readOnly tabIndex={-1} />
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

                  <div className="md:col-span-2">
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
                  <div className="md:col-span-4">
                    <label className="label block mb-1">Loom# (F9) <span className="text-[9px] text-[var(--muted)]">(mounted beams auto-fill below)</span></label>
                    <FindingPicker
                      name="headerLoom"
                      defaultValue={editingLoom}
                      rows={loomPickerRows}
                      columns={loomCols}
                      filterByField="shedNo"
                      title="LOOM LIST"
                      placeholder="F9 loom — fills its beams below"
                      className="input-box mono cursor-pointer"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label block mb-1">Design#</label>
                    <input name="designNo" className="input-box mono" defaultValue={editing?.designNo ?? ""} />
                  </div>

                  <div className="md:col-span-6">
                    <label className="label block mb-1">Conv Contract (F9) — fills quality / brand / party</label>
                    <FindingPicker
                      name="conv_contract"
                      defaultValue={editingContNo}
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
                  {/* Owner: Shed No, Bill No/Date/Status and the SHIFT INCHARGE +
                      CODES sections are off the form. Kept as hidden inputs so a
                      saved voucher does not lose them on an edit. */}
                  <input type="hidden" name="shedNo" defaultValue={editing?.shedNo ?? ""} />
                  <input type="hidden" name="billNo" defaultValue={editing?.billNo ?? ""} />
                  <input type="hidden" name="billDate" defaultValue={editing?.billDate ?? ""} />
                  <input type="hidden" name="billingStatus" defaultValue={editing?.billingStatus ?? ""} />
                  <input type="hidden" name="shiftInchargeTm" defaultValue={editing?.shiftInchargeTm ?? ""} />
                  <input type="hidden" name="shiftInchargePm" defaultValue={editing?.shiftInchargePm ?? ""} />
                  <input type="hidden" name="shiftInchargeA" defaultValue={editing?.shiftInchargeA ?? ""} />
                  <input type="hidden" name="shiftInchargeB" defaultValue={editing?.shiftInchargeB ?? ""} />
                  <input type="hidden" name="shiftInchargeC" defaultValue={editing?.shiftInchargeC ?? ""} />
                  <input type="hidden" name="noOfWidths" defaultValue={editing?.noOfWidths ?? ""} />
                  <input type="hidden" name="prodCode" defaultValue={editing?.prodCode ?? ""} />
                  <input type="hidden" name="lotNo" defaultValue={editing?.lotNo ?? ""} />
                  <input type="hidden" name="torOwn" defaultValue={editing?.torOwn ?? ""} />
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-3 mono">
                  ALT-E to edit next section. F9 opens LOV on Loom# / Design#.
                </div>
              </div>

              <div className="border border-black mb-3">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold p-3 border-b-2 border-black bg-gray-50">
                  BEAM DETAILS — Beam Set# → Shrinkage (auto-fills from header Loom#)
                </div>
                <div className="overflow-x-auto">
                  <table style={{ minWidth: "1560px" }}>
                    <thead>
                      <tr>
                        <th style={{ width: 34 }}>Sr#</th>
                        <th style={{ width: 30 }} title="Erase the whole row">✕</th>
                        <th style={{ width: 170 }}>Beam # (F9)</th>
                        <th style={{ width: 90 }}>Beam Set#</th>
                        <th style={{ width: 60 }}>Type</th>
                        <th style={{ width: 120 }}>K/S/M Date</th>
                        <th style={{ width: 105 }}>Beam Status</th>
                        <th className="text-right" style={{ width: 80 }}>Wast WT KG</th>
                        <th className="text-right" style={{ width: 65 }}>Ends</th>
                        <th className="text-right" style={{ width: 80 }}>B.Length</th>
                        <th className="text-right" style={{ width: 80 }}>Rcvd/Mtr</th>
                        <th className="text-right" style={{ width: 70 }}>Diff</th>
                        <th className="text-right" style={{ width: 80 }}>Shrinkage</th>
                      </tr>
                    </thead>
                    <tbody id="idp-beam-rows">
                      {Array.from({ length: Math.max(SET_ROWS, setRows.length + 2) }).map((_, i) => {
                        const s = setRows[i];
                        
                        return (
                          <tr key={i}>
                            <td className="mono text-[12px] text-center">{i + 1}</td>
                            <td className="text-center">
                              <button
                                type="button"
                                data-row-erase
                                title="Erase this whole row (both containers)"
                                className="mono text-[12px] font-bold cursor-pointer hover:text-white"
                                style={{ color: "var(--danger)", background: "none", border: "none", padding: "0 4px" }}
                              >
                                ✕
                              </button>
                            </td>
                            <td>
                              <FindingPicker
                                name="beamNo"
                                defaultValue={s?.beamNo ?? ""}
                                rows={beamPickerRows}
                                columns={beamCols}
                                filterByField="headerLoom"
                                title="SET NO LIST — MOUNTED BEAMS"
                                placeholder="F9 beam"
                                className="input-box mono text-[12px] cursor-pointer"
                              />
                              <span data-near-empty className="mono text-[9px] text-[var(--danger)] font-bold ml-1"></span>
                              <input type="hidden" name="contNo" defaultValue={s?.contNo ?? ""} />
                            </td>
                            <td><input name="beamSetNo" className="input-box mono text-[12px]" defaultValue={s?.beamSetNo ?? ""} /></td>
                            <td>
                              <select name="kSmType" className="input-box mono text-[12px]" defaultValue={s?.kSmType ?? ""}>
                                <option value=""></option>
                                <option value="K">K</option>
                                <option value="S">S</option>
                                <option value="M">M</option>
                              </select>
                            </td>
                            <td><DateBox name="kSmDate" className="input-box mono text-[12px]" defaultValue={s?.kSmDate ?? ""} /></td>
                            <td>
                              <select name="beamStatus" className="input-box mono text-[12px]" defaultValue={s?.beamStatus ?? ""}>
                                <option value=""></option>
                                {BEAM_STATUS_CHOICES.map((st) => (
                                  <option key={st} value={st}>{st}</option>
                                ))}
                                {s?.beamStatus && !BEAM_STATUS_CHOICES.includes(s.beamStatus) && (
                                  <option value={s.beamStatus}>{s.beamStatus}</option>
                                )}
                              </select>
                            </td>
                            <td><input name="wastWtKg" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.wastWtKg ?? ""} /></td>
                            <td><input name="ends" type="number" step="1" className="input-box mono text-[12px] text-right" defaultValue={s?.ends ?? ""} /></td>
                            <td><input name="bLength" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.bLength ?? ""} /></td>
                            <td><input name="rcvdMtr" type="number" step="0.01" className="input-box mono text-[12px] text-right bg-gray-100" defaultValue={s?.rcvdMtr ?? ""} readOnly tabIndex={-1} title="Auto: total woven on this beam incl. this voucher" /></td>
                            <td><input name="diff" type="number" step="0.01" className="input-box mono text-[12px] text-right bg-gray-100" defaultValue={s?.diff ?? ""} readOnly tabIndex={-1} /></td>
                            <td><input name="shrinkage" type="number" step="0.01" className="input-box mono text-[12px] text-right bg-gray-100" defaultValue={s?.shrinkage ?? ""} readOnly tabIndex={-1} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-[var(--muted)] p-2 border-t border-black mono">
                  Pick the Loom# in the header — all of its knotted beams auto-fill here (1, 2, however many).
                </div>
              </div>

<div className="border border-black mb-3">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold p-3 border-b-2 border-black bg-gray-50">
                  COUNTS GRID — mm/Than Sr No, A / B / C / CP / PPC, Total, Rej
                </div>
                <div className="overflow-x-auto">
                  <table style={{ minWidth: "760px" }}>
                    <thead>
                      <tr>
                        <th style={{ width: 34 }}>Sr#</th>
                        <th style={{ width: 30 }} title="Erase the whole row">✕</th>
                        <th style={{ width: 110 }}>mm/Than Sr No</th>
                        <th className="text-right" style={{ width: 70 }}>A</th>
                        <th className="text-right" style={{ width: 70 }}>B</th>
                        <th className="text-right" style={{ width: 70 }}>C</th>
                        <th className="text-right" style={{ width: 70 }}>CP</th>
                        <th className="text-right" style={{ width: 70 }}>PPC</th>
                        <th className="text-right" style={{ width: 75 }}>Total</th>
                        <th className="text-right" style={{ width: 70 }}>Rej</th>
                      </tr>
                    </thead>
                    <tbody id="idp-count-rows">
                      {Array.from({ length: Math.max(SET_ROWS, setRows.length + 2) }).map((_, i) => {
                        const s = setRows[i];
                        return (
                          <tr key={i}>
                            <td className="mono text-[12px] text-center">{i + 1}</td>
                            <td className="text-center">
                              <button
                                type="button"
                                data-row-erase
                                title="Erase this whole row (both containers)"
                                className="mono text-[12px] font-bold cursor-pointer hover:text-white"
                                style={{ color: "var(--danger)", background: "none", border: "none", padding: "0 4px" }}
                              >
                                ✕
                              </button>
                            </td>
                            <td><input name="mmThanSrNo" className="input-box mono text-[12px]" defaultValue={s?.mmThanSrNo ?? ""} /></td>
                            <td><input name="aCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.aCount ?? ""} /></td>
                            <td><input name="bCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.bCount ?? ""} /></td>
                            <td><input name="cCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.cCount ?? ""} /></td>
                            <td><input name="cpCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.cpCount ?? ""} /></td>
                            <td><input name="ppcCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.ppcCount ?? ""} /></td>
                            <td><input name="totalCount" type="number" step="0.01" className="input-box mono text-[12px] text-right bg-gray-100" defaultValue={s?.totalCount ?? ""} readOnly tabIndex={-1} /></td>
                            <td><input name="rejCount" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={s?.rejCount ?? ""} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-black text-white font-bold">
                        <td className="mono text-[12px] text-center" id="idp-tot-cnt"></td>
                        <td></td>
                        <td className="mono text-[12px] px-1">TOTAL THAN</td>
                        <td className="mono text-[12px] text-right px-1" id="idp-tot-a"></td>
                        <td className="mono text-[12px] text-right px-1" id="idp-tot-b"></td>
                        <td className="mono text-[12px] text-right px-1" id="idp-tot-c"></td>
                        <td className="mono text-[12px] text-right px-1" id="idp-tot-cp"></td>
                        <td className="mono text-[12px] text-right px-1" id="idp-tot-ppc"></td>
                        <td className="mono text-[12px] text-right px-1" id="idp-tot-total"></td>
                        <td className="mono text-[12px] text-right px-1" id="idp-tot-rej"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="text-[10px] text-[var(--muted)] p-2 border-t border-black mono">
                  Row 1 here = Row 1 in BEAM DETAILS above. Than serial auto-fills per row — /A, /B, /C by row, one beam can weave many thans.
                </div>              </div>
              <div className="space-y-6">
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
                    {/* One box per party, each carrying its own yarn spec. Plain
                        grids — a gform here would force label-left, 2 per row. */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="border border-black p-3 space-y-2">
                        <div>
                          <label className="label block mb-1">Beam Cost Party <span className="text-[9px] text-[var(--muted)]">(weaving)</span></label>
                          <Combobox name="beamContParty" options={convPartyOpts} defaultValue={editing?.beamContParty ?? ""} placeholder="Select party" />
                        </div>
                        <div>
                          <label className="label block mb-1">Weft</label>
                          <input name="beamWeftInfo" className={infoCls} defaultValue={editingSpec.beamWeftInfo} readOnly tabIndex={-1} />
                        </div>
                      </div>
                      <div className="border border-black p-3 space-y-2">
                        <div>
                          <label className="label block mb-1">Yarn Cost Party</label>
                          <Combobox name="convContParty" options={convPartyOpts} defaultValue={editing?.convContParty ?? ""} placeholder="Select party" />
                        </div>
                        <div>
                          <label className="label block mb-1">Warp</label>
                          <input name="yarnWarpInfo" className={infoCls} defaultValue={editingSpec.yarnWarpInfo} readOnly tabIndex={-1} />
                        </div>
                        <div>
                          <label className="label block mb-1">Weft</label>
                          <input name="yarnWeftInfo" className={infoCls} defaultValue={editingSpec.yarnWeftInfo} readOnly tabIndex={-1} />
                        </div>
                        <div>
                          <label className="label block mb-1">Read × Pick</label>
                          <input name="yarnReadPick" className={infoCls} defaultValue={editingSpec.yarnReadPick} readOnly tabIndex={-1} />
                        </div>
                      </div>
                      <div className="border border-black p-3 space-y-2">
                        <div>
                          <label className="label block mb-1">Szg Party</label>
                          <Combobox name="szgParty" options={szgPartyOpts} defaultValue={editing?.szgParty ?? ""} placeholder="Select sizing party" />
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
                  <th>Bill Status</th>
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
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.billingStatus ?? "-"}</a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{total || "-"}</a></td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={10} className="text-center text-[13px] text-[var(--muted)] py-6">No entries. Click <b>New</b> above to create one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
