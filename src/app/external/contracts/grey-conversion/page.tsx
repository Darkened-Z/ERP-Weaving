import { Shell } from "@/components/shell";
import { ImageAttach } from "@/components/image-attach";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { AutoFill, RowAutoFill } from "@/components/auto-fill";
import { GreyInfoPanel } from "@/components/grey-info-panel";
import { GreyQualityPicker } from "@/components/grey-quality-picker";
import { PartyCountGrid } from "@/components/party-count-grid";
import { FindingPicker } from "@/components/finding-picker";
import { ConfirmButton } from "@/components/confirm-button";
import { GreyConvCalc } from "@/components/grey-conv-calc";
import { db, schema } from "@/db";
import { and, eq, or, sql } from "drizzle-orm";
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

const int = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v as string, 10);
  return Number.isFinite(n) ? n : null;
};

const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

const round = (v: number, d: number) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};

const ERROR_MESSAGES: Record<string, string> = {
  code_exists: "Contract No already exists. Save again to auto-assign a fresh number.",
  design_exists: "This party already has a contract with this Design No.",
  rate_required: "Either Rate Per Pick or Rate/Mtr must be greater than 0.",
  read_required: "Read must be greater than 0.",
  pick_required: "Pick must be greater than 0.",
  width_required: "Width must be greater than 0.",
  period_locked: "Period locked. Nothing was saved.",
  admin_only: "Only ADMIN can delete contracts.",
};

const LOOM_TYPES = ["RAPIER", "AIR_JET", "WATER_JET", "PROJECTILE", "SHUTTLE", "SULZER", "TSUDAKOMA"];
const SELV_TYPES = ["LENO", "PLAIN", "TAPE", "CATCH", "TUCK-IN"];
const SEASON_TYPES = ["SUMMER", "WINTER", "ALL SEASON", "SPRING", "AUTUMN"];

export default async function GreyConvContractPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; fparty?: string; fgrey?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isAdding = params.adding === "1";
  const findFilter = params.find?.trim();

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);
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
  const productList = await db
    .select({ code: schema.products.code, description: schema.products.description })
    .from(schema.products)
    .orderBy(schema.products.description);

  // Yarn count master — used by the WARP/WEFT grid so entering a count auto-fills
  // its description and blend/brand (Oracle-parity behavior).
  const yarnCountList = await db
    .select({
      countCode: schema.yarnCounts.countCode,
      description: schema.yarnCounts.description,
      type: schema.yarnCounts.type,
    })
    .from(schema.yarnCounts)
    .where(eq(schema.yarnCounts.status, "A"))
    .orderBy(schema.yarnCounts.countCode);
  const greyCountLabels: Record<string, string> = Object.fromEntries(
    yarnCountList.map((y) => [
      String(y.countCode).trim().toLowerCase(),
      `${y.countCode} — ${y.description}${y.type ? ` ${y.type}` : ""}`,
    ])
  );
  // Desc auto-fill = full count description incl. blend (e.g. "30/S MVS PV 65;35"),
  // as written in the count master. Brand is NOT auto-filled — the operator picks
  // from the full brand list (gc-brands datalist) below.
  const yarnCountFillMap: Record<string, Record<string, string>> = {};
  for (const c of yarnCountList) {
    yarnCountFillMap[String(c.countCode)] = {
      descr: `${c.description ?? ""}${c.type ? ` ${c.type}` : ""}`.trim(),
    };
  }
  const warpCountFillMap: Record<string, Record<string, string>> = {};
  const weftCountFillMap: Record<string, Record<string, string>> = {};
  for (const [code, v] of Object.entries(yarnCountFillMap)) {
    for (let i = 1; i <= 8; i++) {
      (warpCountFillMap[code] ??= {})[`warp_descr_${i}`] = v.descr;
      (weftCountFillMap[code] ??= {})[`weft_descr_${i}`] = v.descr;
    }
  }
  const brandList = await db.select({ name: schema.yarnBrands.name }).from(schema.yarnBrands).orderBy(schema.yarnBrands.name);

  // Party-count master: restrict the WARP/WEFT count list to the selected
  // party's counts and auto-fill Cal Count (warp/weft) + Rate Per Lbs per row.
  const pcRows = await db
    .select({
      partyCode: schema.partyCounts.partyCode,
      calWarp: schema.partyCounts.calCountWarp,
      calWeft: schema.partyCounts.calCountWeft,
      rate: schema.partyCounts.ratePerLbs,
      visibleCode: schema.yarnCounts.countCode,
      desc: schema.yarnCounts.description,
      type: schema.yarnCounts.type,
    })
    .from(schema.partyCounts)
    .leftJoin(schema.yarnCounts, eq(schema.partyCounts.countCode, schema.yarnCounts.id));
  const partyCountData: Record<
    string,
    { counts: Array<{ code: string; label: string }>; byCount: Record<string, { calWarp: number | null; calWeft: number | null; rate: number | null }> }
  > = {};
  for (const r of pcRows) {
    if (!r.visibleCode) continue;
    const code = String(r.visibleCode);
    const label = `${code} — ${r.desc ?? ""}${r.type ? ` ${r.type}` : ""}`;
    const entry = (partyCountData[r.partyCode] ??= { counts: [], byCount: {} });
    if (!entry.byCount[code]) entry.counts.push({ code, label });
    entry.byCount[code] = { calWarp: r.calWarp, calWeft: r.calWeft, rate: r.rate };
  }
  const allCountOpts = yarnCountList.map((y) => ({
    code: String(y.countCode),
    label: `${y.countCode} — ${y.description}${y.type ? ` ${y.type}` : ""}`,
  }));
  const partyCodeByDescObj: Record<string, string> = Object.fromEntries(parties.map((p) => [p.description, p.code]));

  // Finding: text find + party-wise + grey-construction-wise. Fetch then filter
  // in JS so the three filters compose cleanly (contract volume is modest).
  const fParty = (params.fparty ?? "").trim();
  const fGrey = (params.fgrey ?? "").trim();
  const findL = (findFilter ?? "").toLowerCase();
  const allContracts = await db
    .select()
    .from(schema.extGreyConvContract)
    .orderBy(sql`cont_date desc`);
  const contracts = allContracts.filter((c) => {
    if (fParty && c.party !== fParty) return false;
    if (fGrey && c.grayCode !== fGrey && c.grayQltyCode !== fGrey) return false;
    if (findL) {
      const hay = `${c.contNo ?? ""} ${c.party ?? ""} ${c.grayCode ?? ""} ${c.productName ?? ""}`.toLowerCase();
      if (!hay.includes(findL)) return false;
    }
    return true;
  });

  const selected = Number.isFinite(idParam)
    ? contracts.find((c) => c.id === idParam) ?? null
    : null;
  const formItem = isAdding ? null : selected;

  const warpRows = selected
    ? await db
        .select()
        .from(schema.extGreyConvWarp)
        .where(eq(schema.extGreyConvWarp.contractId, selected.id))
        .orderBy(schema.extGreyConvWarp.srNo)
    : [];

  const weftRows = selected
    ? await db
        .select()
        .from(schema.extGreyConvWeft)
        .where(eq(schema.extGreyConvWeft.contractId, selected.id))
        .orderBy(schema.extGreyConvWeft.srNo)
    : [];

  const warpGrid = Array.from({ length: 4 }, (_, i) => warpRows.find((r) => r.srNo === i + 1) ?? null);
  const weftGrid = Array.from({ length: 4 }, (_, i) => weftRows.find((r) => r.srNo === i + 1) ?? null);

  const today = pkToday();
  const [lRow] = await db
    .select({ maxL: sql<number>`coalesce(max(l_cont_no), 0)` })
    .from(schema.extGreyConvContract);
  const maxLContNo = lRow?.maxL ?? 0;

  const partyOpts = parties.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  // Full-page finding list rows for the Party field (value stays the description
  // so save + PartyCountGrid keep working).
  const partyFindRows = parties.map((p) => ({ value: p.description, code: p.code, description: p.description }));
  const greyOpts = greyList.map((g) => {
    const rp = g.reed && g.pick ? `R${g.reed} P${g.pick} · ` : "";
    const w = g.width ? `${g.width}" ` : "";
    return {
      value: g.code,
      label: `${g.code} — ${rp}${w}${g.description}`,
      // Extra searchable text — reed/pick appear here too so a user typing "96" or "96/72" filters correctly
      desc: `reed ${g.reed ?? ""} pick ${g.pick ?? ""} ${g.reed ?? ""}/${g.pick ?? ""} ${g.reed ?? ""}x${g.pick ?? ""}`,
    };
  });
  const productOpts = productList.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  // Picking a Gray Qlty Code fills reed/pick/width + the WARP/WEFT count grid
  // rows from the greyConstruction record (Oracle: SELECT GC_WARP,GC_WARP1..4,
  // GC_WEFT,GC_WEFT1..4 FROM WVG_GRAY_CONSTRUCTION WHERE GC_GRAY_CODE=:b1).
  const greyFillMap = Object.fromEntries(
    greyList.map((g) => [
      g.code,
      {
        read: g.reed,
        pick: g.pick,
        width: g.width,
        warp_count_1: g.warpCount ?? "",
        warp_count_2: g.warp2 ?? "",
        warp_count_3: g.warp3 ?? "",
        warp_count_4: g.warp4 ?? "",
        warp_count_5: g.warp5 ?? "",
        warp_count_6: g.warp6 ?? "",
        warp_count_7: g.warp7 ?? "",
        warp_count_8: g.warp8 ?? "",
        weft_count_1: g.weftCount ?? "",
        weft_count_2: g.weft2 ?? "",
        weft_count_3: g.weft3 ?? "",
        weft_count_4: g.weft4 ?? "",
        weft_count_5: g.weft5 ?? "",
        weft_count_6: g.weft6 ?? "",
        weft_count_7: g.weft7 ?? "",
        weft_count_8: g.weft8 ?? "",
      },
    ])
  );
  const productFillMap = Object.fromEntries(
    productList.map((p) => [p.description, { product_quality: p.description, slv_name: p.description }])
  );
  // Resolve a stored warp/weft value (usually a count code like "2", sometimes a
  // description) to "code — blend", e.g. "2 — 30/S MVS PV 65:35". Falls back to
  // the raw value if it matches no yarn count.
  const countByCode = new Map(yarnCountList.map((c) => [String(c.countCode).trim().toLowerCase(), c]));
  const countByDesc = new Map(yarnCountList.map((c) => [String(c.description).trim().toLowerCase(), c]));
  const resolveCount = (raw: string) => {
    const v = (raw ?? "").trim();
    if (!v) return "";
    const c = countByCode.get(v.toLowerCase()) ?? countByDesc.get(v.toLowerCase());
    if (!c) return v;
    const blend = `${c.description}${c.type ? ` ${c.type}` : ""}`;
    return `${c.countCode} — ${blend}`;
  };
  // Compact info-panel map: one entry per construction with warp/weft as arrays for the display
  const greyInfoMap = Object.fromEntries(
    greyList.map((g) => [
      g.code,
      {
        reed: g.reed as number | null,
        pick: g.pick as number | null,
        width: g.width as number | null,
        warpCounts: [g.warpCount, g.warp2, g.warp3, g.warp4, g.warp5, g.warp6, g.warp7, g.warp8].map((x) => resolveCount((x ?? "") as string)),
        weftCounts: [g.weftCount, g.weft2, g.weft3, g.weft4, g.weft5, g.weft6, g.weft7, g.weft8].map((x) => resolveCount((x ?? "") as string)),
      },
    ])
  );
  // Full-page picker rows (Oracle FINDING GREY QUALITY parity)
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
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));
  const greyDescByCode = new Map(greyList.map((g) => [g.code, g.description]));
  const productCodeByDesc = new Map(productList.map((p) => [p.description, p.code]));

  async function saveContract(formData: FormData) {
    "use server";
    const idStr = formData.get("id") as string;
    const idParsed = idStr ? parseInt(idStr, 10) : NaN;
    const isUpdate = Number.isFinite(idParsed);
    const backQ = isUpdate ? `?id=${idParsed}` : `?adding=1`;

    const ratePerPick = num(formData.get("rate_per_pick"));
    const rateMtr = num(formData.get("rate_mtr"));
    const readVal = num(formData.get("read"));
    const pickVal = num(formData.get("pick"));
    const widthVal = num(formData.get("width"));

    if (!((ratePerPick ?? 0) > 0 || (rateMtr ?? 0) > 0))
      redirect(`/external/contracts/grey-conversion${backQ}&error=rate_required`);
    if (!((readVal ?? 0) > 0)) redirect(`/external/contracts/grey-conversion${backQ}&error=read_required`);
    if (!((pickVal ?? 0) > 0)) redirect(`/external/contracts/grey-conversion${backQ}&error=pick_required`);
    if (!((widthVal ?? 0) > 0)) redirect(`/external/contracts/grey-conversion${backQ}&error=width_required`);

    const party = txt(formData.get("party"));
    const designNo = txt(formData.get("design_no"));
    if (party && designNo) {
      const dups = await db
        .select({ id: schema.extGreyConvContract.id })
        .from(schema.extGreyConvContract)
        .where(
          and(
            eq(schema.extGreyConvContract.party, party),
            eq(schema.extGreyConvContract.designNo, designNo)
          )
        );
      if (dups.some((d) => !isUpdate || d.id !== idParsed))
        redirect(`/external/contracts/grey-conversion${backQ}&error=design_exists`);
    }

    const widthN = num(formData.get("width")) ?? 0;
    const parseRows = (prefix: "warp" | "weft") => {
      const out: {
        srNo: number;
        count: string | null;
        descr: string | null;
        brand: string | null;
        calCount: number | null;
        ends: number | null;
        wtPerMtr: number;
        ratePerLbs: number | null;
        costPerMtr: number;
      }[] = [];
      for (let i = 1; i <= 9; i++) {
        const count = txt(formData.get(`${prefix}_count_${i}`));
        const descr = txt(formData.get(`${prefix}_descr_${i}`));
        const brand = txt(formData.get(`${prefix}_brand_${i}`));
        const calCount = num(formData.get(`${prefix}_cal_count_${i}`));
        const ends = int(formData.get(`${prefix}_ends_${i}`));
        const ratePerLbs = num(formData.get(`${prefix}_rate_${i}`));
        if (count || descr || brand || calCount !== null || ends !== null || ratePerLbs !== null) {
          // Weft ends = picks per inch → multiply by width to get total weft length per meter of fabric
          // WARP: ENDS ÷ 731.52 ÷ CAL COUNT WARP · WEFT: ENDS × WIDTH ÷ 731.52 ÷ CAL COUNT WEFT
          const effectiveEnds = prefix === "weft" ? (ends ?? 0) * widthN : (ends ?? 0);
          const wtPerMtr =
            calCount && calCount > 0 ? round(effectiveEnds / 731.52 / calCount, 6) : 0;
          const costPerMtr = round(wtPerMtr * (ratePerLbs ?? 0), 4);
          out.push({ srNo: i, count, descr, brand, calCount, ends, wtPerMtr, ratePerLbs, costPerMtr });
        }
      }
      return out;
    };

    const warpParsed = parseRows("warp");
    const weftParsed = parseRows("weft");

    const warpWtPerMtr = round(warpParsed.reduce((s, r) => s + r.wtPerMtr, 0), 6);
    const weftWtPerMtr = round(weftParsed.reduce((s, r) => s + r.wtPerMtr, 0), 6);
    const wtPerMtr = round(warpWtPerMtr + weftWtPerMtr, 6);
    const warpCostPerMtr = round(warpParsed.reduce((s, r) => s + r.costPerMtr, 0), 4);
    const weftCostPerMtr = round(weftParsed.reduce((s, r) => s + r.costPerMtr, 0), 4);
    const costPerMtr = round(warpCostPerMtr + weftCostPerMtr, 4);
    const clb = num(formData.get("cost_lakhai_border_mtr")) ?? 0;
    const convRatePerMtr =
      (ratePerPick ?? 0) > 0
        ? round((ratePerPick ?? 0) * (pickVal ?? 0) + clb, 4)
        : round((rateMtr ?? 0) + clb, 4);
    const grayRatePerMtr = round(costPerMtr + convRatePerMtr, 2);

    const providedContNo = (formData.get("cont_no") as string)?.trim() || "";

    const contDate = txt(formData.get("cont_date")) ?? pkToday();
    const dataBase = {
      contDate,
      expDate: txt(formData.get("exp_date")),
      status: txt(formData.get("status")) ?? "R",
      type: (txt(formData.get("type")) === "SALE" ? "SALE" : "CONV"),
      party,
      weaveFrame: txt(formData.get("weave_frame")),
      selvType: txt(formData.get("selv_type")),
      slvName: txt(formData.get("slv_name")),
      qtyMtr: num(formData.get("qty_mtr")),
      costLakhaiBorderMtr: num(formData.get("cost_lakhai_border_mtr")),
      ratePerPick,
      rateMtr,
      convRatePerMtr,
      grayRatePerMtr,
      loomType: txt(formData.get("loom_type")),
      broker: txt(formData.get("broker")),
      ratePick: num(formData.get("rate_pick")),
      designNo,
      grayQltyCode: txt(formData.get("gray_qlty_code")),
      img: txt(formData.get("img")),
      wrpWt40: round(warpWtPerMtr * 40, 6),
      wftWt40: round(weftWtPerMtr * 40, 6),
      weight40: round(wtPerMtr * 40, 6),
      remarks: txt(formData.get("remarks")),
      read: readVal,
      pick: pickVal,
      width: widthVal,
      findDesign: txt(formData.get("find_design")),
      grayCode: txt(formData.get("gray_code")),
      findContract: txt(formData.get("find_contract")),
      warpWtPerMtr,
      weftWtPerMtr,
      wtPerMtr,
      warpCostPerMtr,
      weftCostPerMtr,
      costPerMtr,
      ratePerMtr1: num(formData.get("rate_per_mtr_1")),
      ratePerMtr2: num(formData.get("rate_per_mtr_2")),
      productName: txt(formData.get("product_name")),
      productQuality: txt(formData.get("product_quality")),
      seasonType: txt(formData.get("season_type")),
      modifiedDate: new Date().toISOString(),
    };

    let contractId: number | null = null;
    let uniqueError = false;

    try {
      await assertPeriodOpen(contDate, "INVENTORY");
      contractId = await db.transaction(async (tx) => {
        let cid: number;
        if (isUpdate) {
          await tx
            .update(schema.extGreyConvContract)
            .set(dataBase)
            .where(eq(schema.extGreyConvContract.id, idParsed));
          cid = idParsed;
          await tx.delete(schema.extGreyConvWarp).where(eq(schema.extGreyConvWarp.contractId, cid));
          await tx.delete(schema.extGreyConvWeft).where(eq(schema.extGreyConvWeft.contractId, cid));
        } else {
          let contNo = providedContNo;
          if (!contNo) {
            const rows = await tx
              .select({ maxNum: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 5) AS INTEGER)), 0)` })
              .from(schema.extGreyConvContract);
            const maxNum = rows[0]?.maxNum ?? 0;
            contNo = `GCC-${String(maxNum + 1).padStart(4, "0")}`;
          }
          const [lr] = await tx
            .select({ maxL: sql<number>`coalesce(max(l_cont_no), 0)` })
            .from(schema.extGreyConvContract);
          const [inserted] = await tx
            .insert(schema.extGreyConvContract)
            .values({ ...dataBase, contNo, lContNo: (lr?.maxL ?? 0) + 1 })
            .returning({ id: schema.extGreyConvContract.id });
          cid = inserted.id;
        }

        if (warpParsed.length)
          await tx.insert(schema.extGreyConvWarp).values(warpParsed.map((r) => ({ contractId: cid, ...r })));
        if (weftParsed.length)
          await tx.insert(schema.extGreyConvWeft).values(weftParsed.map((r) => ({ contractId: cid, ...r })));

        return cid;
      });
    } catch (e: unknown) {
      const digest = (e as { digest?: string })?.digest ?? "";
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw e;
      const msg = String((e as { message?: string })?.message ?? "");
      const errCode = String((e as { code?: string })?.code ?? "");
      const lockMatch = /Period locked through (\d{4}-\d{2}-\d{2})/.exec(msg);
      if (lockMatch) {
        redirect(`/external/contracts/grey-conversion?error=period_locked&thru=${lockMatch[1]}`);
      }
      if (msg.includes("UNIQUE") || errCode === "SQLITE_CONSTRAINT_UNIQUE") {
        uniqueError = true;
      } else {
        throw e;
      }
    }

    if (uniqueError) {
      redirect(`/external/contracts/grey-conversion${backQ}&error=code_exists`);
    }

    if (contractId === null) return;

    revalidatePath("/external/contracts/grey-conversion");
    redirect(`/external/contracts/grey-conversion?id=${contractId}`);
  }

  async function deleteContract(formData: FormData) {
    "use server";
    const s = await getSession();
    if (s?.roleName !== "ADMIN") redirect("/external/contracts/grey-conversion?error=admin_only");
    const idParsed = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(idParsed)) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.extGreyConvWarp).where(eq(schema.extGreyConvWarp.contractId, idParsed));
      await tx.delete(schema.extGreyConvWeft).where(eq(schema.extGreyConvWeft.contractId, idParsed));
      await tx.delete(schema.extGreyConvContract).where(eq(schema.extGreyConvContract.id, idParsed));
    });
    revalidatePath("/external/contracts/grey-conversion");
    redirect("/external/contracts/grey-conversion");
  }

  const gridCellCls = "input-box mono text-[13px] py-1";
  const gridCellNumCls = "input-box mono text-[13px] py-1 text-right";
  const gridCellCalcCls = "input-box mono text-[13px] py-1 text-right bg-gray-100";
  const roCls = "input-box mono text-[13px] bg-gray-100";
  const yellowCls = "input-box mono text-[13px]";
  const greenCls = "input-box mono text-[13px] bg-green-50";

  const excelRows = contracts.map((c) => ({
    contNo: c.contNo,
    party: c.party,
    grayCode: c.grayCode,
    productName: c.productName,
    loomType: c.loomType,
    qtyMtr: c.qtyMtr,
    rateMtr: c.rateMtr,
    costPerMtr: c.costPerMtr,
    status: c.status,
  }));

  return (
    <Shell active="ext-gcc">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <h1 className="page-title">
            GREY CONVERSION CONTRACT EXT{" "}
            <span className="text-[var(--muted)] text-lg font-normal">({contracts.length})</span>
          </h1>
          <ExcelExportButton
            rows={excelRows}
            columns={[
              { key: "contNo", label: "Cont No" },
              { key: "party", label: "Party" },
              { key: "grayCode", label: "Gray Code" },
              { key: "productName", label: "Product Name" },
              { key: "loomType", label: "Loom Type" },
              { key: "qtyMtr", label: "Qty Mtr" },
              { key: "rateMtr", label: "Rate/Mtr" },
              { key: "costPerMtr", label: "Cost/Mtr" },
              { key: "status", label: "Status" },
            ]}
            filename="grey-conv-contracts"
            sheetName="GreyConvContract"
          />
        </div>

        {params.error && ERROR_MESSAGES[params.error] && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            {ERROR_MESSAGES[params.error]}
          </div>
        )}

        <div className="border border-black p-5 mb-6">
          <datalist id="gc-yarn-counts">
            {yarnCountList.map((c) => (
              <option key={c.countCode} value={String(c.countCode)}>
                {c.description}
                {c.type ? ` — ${c.type}` : ""}
              </option>
            ))}
          </datalist>
          <datalist id="gc-brands">
            {brandList.map((b) => (
              <option key={b.name} value={b.name} />
            ))}
          </datalist>
          <form action={saveContract}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}
            <GreyConvCalc />
            <AutoFill
              watch="gray_qlty_code"
              map={greyFillMap}
              inputs={[
                "read", "pick", "width",
                "warp_count_1", "warp_count_2", "warp_count_3", "warp_count_4",
                "warp_count_5", "warp_count_6", "warp_count_7", "warp_count_8",
                "weft_count_1", "weft_count_2", "weft_count_3", "weft_count_4",
                "weft_count_5", "weft_count_6", "weft_count_7", "weft_count_8",
              ]}
            />
            <AutoFill watch="product_name" map={productFillMap} inputs={["product_quality", "slv_name"]} />
            {/* Each row's Count cell → auto-fill that row's Desc + Brand from yarn_counts */}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <RowAutoFill key={`warp-cf-${i}`} watch={`warp_count_${i}`} map={warpCountFillMap} />
            ))}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <RowAutoFill key={`weft-cf-${i}`} watch={`weft_count_${i}`} map={weftCountFillMap} />
            ))}
            {/* Party-scoped count list + Cal Count / Rate Per Lbs auto-fill from party_counts */}
            <PartyCountGrid
              datalistId="gc-yarn-counts"
              partyField="party"
              partyCodeByDesc={partyCodeByDescObj}
              partyCountData={partyCountData}
              allCounts={allCountOpts}
            />

            <div className="grid grid-cols-12 gap-3 mb-3">
              <div className="col-span-8">
                <div className="grid grid-cols-5 gap-3 mb-3">
                  <div>
                    <label className="label block mb-1">Cont. Date</label>
                    <input name="cont_date" type="date" className="input-box mono" defaultValue={formItem?.contDate ?? today} />
                  </div>
                  <div>
                    <label className="label block mb-1">Status</label>
                    <select name="status" className="input-box" defaultValue={formItem?.status ?? "R"}>
                      <option value="R">R-Running</option>
                      <option value="C">C-Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Type</label>
                    <select name="type" className="input-box mono" defaultValue={formItem?.type ?? "CONV"}>
                      <option value="CONV">CONV</option>
                      <option value="SALE">SALE</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Cont.No</label>
                    <input
                      name="cont_no"
                      className="input-box mono font-bold"
                      defaultValue={formItem?.contNo ?? ""}
                      placeholder={isAdding ? "auto GCC-####" : ""}
                      readOnly={!!formItem}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">LCont.No</label>
                    <input name="l_cont_no" className={roCls} defaultValue={formItem?.lContNo ?? maxLContNo} readOnly />
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-3 mb-3">
                  <div>
                    <label className="label block mb-1">Exp. Date</label>
                    <input name="exp_date" type="date" className="input-box mono" defaultValue={formItem?.expDate ?? ""} />
                  </div>
                  <div className="col-span-4 flex items-end">
                    <span className="text-[11px] text-[var(--muted)]">(R-Running, C-Completed)</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="label block mb-1">Party <span className="text-[10px] text-[var(--muted)]">(F9 to find)</span></label>
                    <FindingPicker name="party" defaultValue={formItem?.party ?? ""} rows={partyFindRows} title="ACCOUNT — FIND PARTY" placeholder="Select party" className="input-box mono text-[13px] cursor-pointer" />
                  </div>
                  <div>
                    <label className="label block mb-1">Weave &amp; Frame</label>
                    <input name="weave_frame" className="input-box mono text-[13px]" defaultValue={formItem?.weaveFrame ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Selv.Type</label>
                    <select name="selv_type" className="input-box" defaultValue={formItem?.selvType ?? ""}>
                      <option value="">—</option>
                      {SELV_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                      {formItem?.selvType && !SELV_TYPES.includes(formItem.selvType) && (
                        <option value={formItem.selvType}>{formItem.selvType}</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Slv. Name</label>
                    <input name="slv_name" className="input-box mono text-[13px]" defaultValue={formItem?.slvName ?? ""} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="label block mb-1">Qty (Mtr)</label>
                    <input name="qty_mtr" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.qtyMtr ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Cost Lakhai Border / Mtr</label>
                    <input name="cost_lakhai_border_mtr" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.costLakhaiBorderMtr ?? ""} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="label block mb-1">Rate Per Pick (N / Mtr)</label>
                    <input name="rate_per_pick" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.ratePerPick ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Rate/Mtr</label>
                    <input name="rate_mtr" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.rateMtr ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Loom Type</label>
                    <select name="loom_type" className="input-box" defaultValue={formItem?.loomType ?? ""}>
                      <option value="">—</option>
                      {LOOM_TYPES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      {formItem?.loomType && !LOOM_TYPES.includes(formItem.loomType) && (
                        <option value={formItem.loomType}>{formItem.loomType}</option>
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="label block mb-1">Broaker</label>
                    <Combobox name="broker" options={partyOpts} defaultValue={formItem?.broker ?? ""} placeholder="Select broker" className="input-box mono text-[13px]" />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Rate/Pick</label>
                    <input name="rate_pick" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.ratePick ?? ""} />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="label block mb-1">Gray Qlty Code (Const) <span className="text-[10px] text-[var(--muted)]">(F9 to search by Read/Pick)</span></label>
                    <GreyQualityPicker name="gray_qlty_code" defaultValue={formItem?.grayQltyCode ?? ""} rows={greyPickerRows} countLabels={greyCountLabels} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Img</label>
                    <ImageAttach name="img" defaultValue={formItem?.img ?? ""} />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="label block mb-1">As Information</label>
                  <GreyInfoPanel watch="gray_qlty_code" map={greyInfoMap} />
                </div>

                <div className="mb-3">
                  <label className="label block mb-1">Remarks</label>
                  <input name="remarks" className="input-box" defaultValue={formItem?.remarks ?? ""} />
                </div>

                {/* Hidden: still submitted for saving; auto-filled by <AutoFill> when Gray Qlty Code picked.
                    read / pick / width are NOT hidden here — they're the visible editable inputs in the WARP/WEFT section headers below. */}
                <input type="hidden" name="design_no" defaultValue={formItem?.designNo ?? ""} />
                <input type="hidden" name="wrp_wt_40" defaultValue={formItem?.wrpWt40 ?? ""} />
                <input type="hidden" name="wft_wt_40" defaultValue={formItem?.wftWt40 ?? ""} />
                <input type="hidden" name="weight_40" defaultValue={formItem?.weight40 ?? ""} />
              </div>

              <div className="col-span-4 border-l border-[var(--border-light)] pl-4 space-y-2">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold border-b border-black pb-1 mb-2">Reference</div>
                <div>
                  <label className="label block mb-1">Find Contract#</label>
                  <input name="find_contract" className={yellowCls} style={{ background: "#FFF8B7" }} defaultValue={formItem?.findContract ?? ""} />
                </div>
                {/* Hidden — preserve DB values for old records */}
                <input type="hidden" name="find_design" defaultValue={formItem?.findDesign ?? ""} />
                <input type="hidden" name="gray_code" defaultValue={formItem?.grayCode ?? ""} />

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <label className="label block mb-1">Warp WT/Mtr</label>
                    <input name="warp_wt_per_mtr" type="number" step="any" className={roCls} defaultValue={formItem?.warpWtPerMtr ?? ""} readOnly />
                  </div>
                  <div>
                    <label className="label block mb-1">Weft WT/Mtr</label>
                    <input name="weft_wt_per_mtr" type="number" step="any" className={roCls} defaultValue={formItem?.weftWtPerMtr ?? ""} readOnly />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">WT Per Mtr</label>
                    <input name="wt_per_mtr" type="number" step="any" className={roCls} defaultValue={formItem?.wtPerMtr ?? ""} readOnly />
                  </div>
                  <div>
                    <label className="label block mb-1">Warp Cost/Mtr</label>
                    <input name="warp_cost_per_mtr" type="number" step="any" className={roCls} defaultValue={formItem?.warpCostPerMtr ?? ""} readOnly />
                  </div>
                  <div>
                    <label className="label block mb-1">Weft Cost/Mtr</label>
                    <input name="weft_cost_per_mtr" type="number" step="any" className={roCls} defaultValue={formItem?.weftCostPerMtr ?? ""} readOnly />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">Cost Per Mtr</label>
                    <input name="cost_per_mtr" type="number" step="any" className={roCls} defaultValue={formItem?.costPerMtr ?? ""} readOnly />
                  </div>
                  <div>
                    <label className="label block mb-1">Conv Rate/Mtr</label>
                    <input name="conv_rate_per_mtr" type="number" step="any" className={greenCls} defaultValue={formItem?.convRatePerMtr ?? ""} readOnly />
                  </div>
                  <div>
                    <label className="label block mb-1">Gray Rate/Mtr</label>
                    <input name="gray_rate_per_mtr" type="number" step="any" className={greenCls} defaultValue={formItem?.grayRatePerMtr ?? ""} readOnly />
                  </div>
                  <div>
                    <label className="label block mb-1">Rate Per Mtr</label>
                    <input name="rate_per_mtr_1" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.ratePerMtr1 ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Rate Per Mtr</label>
                    <input name="rate_per_mtr_2" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.ratePerMtr2 ?? ""} />
                  </div>
                </div>

                <div>
                  <label className="label block mb-1">Product Name</label>
                  <Combobox name="product_name" options={productOpts} defaultValue={formItem?.productName ?? ""} placeholder="Select product" className="input-box" />
                </div>
                <div>
                  <label className="label block mb-1">Product Quality</label>
                  <input name="product_quality" className="input-box mono text-[13px]" defaultValue={formItem?.productQuality ?? ""} />
                </div>
                <div>
                  <label className="label block mb-1">Season Type</label>
                  <select name="season_type" className="input-box" defaultValue={formItem?.seasonType ?? ""}>
                    <option value="">—</option>
                    {SEASON_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                    {formItem?.seasonType && !SEASON_TYPES.includes(formItem.seasonType) && (
                      <option value={formItem.seasonType}>{formItem.seasonType}</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
              <div className="border border-black">
                <div className="bg-green-100 border-b border-black px-3 py-1 flex items-center justify-between">
                  <div className="text-[12px] uppercase tracking-[0.1em] font-bold">WARP</div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="label">Read</span>
                    <input name="read" type="number" step="any" className="input-box mono text-right" style={{ width: 70, padding: "4px 6px" }} defaultValue={formItem?.read ?? ""} />
                    <span className="label">Pick</span>
                    <input name="pick" type="number" step="any" className="input-box mono text-right" style={{ width: 70, padding: "4px 6px" }} defaultValue={formItem?.pick ?? ""} />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-1 py-1.5 border-b border-black text-[12px]" style={{ width: 28 }}>Sr#</th>
                        <th className="px-1 py-1.5 border-b border-black text-[12px]">Count</th>
                        <th className="px-1 py-1.5 border-b border-black text-[12px]">Desc</th>
                        <th className="px-1 py-1.5 border-b border-black text-[12px]">Brand</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">Cal Count</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">Ends</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">WT Per Mtr</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">Rate Per Lbs</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">Cost Per Mtr</th>
                        <th className="px-1 py-1.5 border-b border-black text-[12px]" style={{ width: 22 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {warpGrid.map((r, idx) => {
                        const i = idx + 1;
                        return (
                          <tr key={i}>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-center">{i}</td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_count_${i}`} list="gc-yarn-counts" className={gridCellCls} defaultValue={r?.count ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_descr_${i}`} className={gridCellCls} defaultValue={r?.descr ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_brand_${i}`} list="gc-brands" className={gridCellCls} defaultValue={r?.brand ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_cal_count_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.calCount ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_ends_${i}`} type="number" step="1" className={gridCellNumCls} defaultValue={r?.ends ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_wt_${i}`} type="number" step="any" className={gridCellCalcCls} defaultValue={r?.wtPerMtr ?? ""} readOnly /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_rate_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.ratePerLbs ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_cost_${i}`} type="number" step="any" className={gridCellCalcCls} defaultValue={r?.costPerMtr ?? ""} readOnly /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)] text-center text-[var(--muted)] cursor-pointer" title="Clear row">X</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border border-black">
                <div className="bg-green-100 border-b border-black px-3 py-1 flex items-center justify-between">
                  <div className="text-[12px] uppercase tracking-[0.1em] font-bold">WEFT</div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="label">Width</span>
                    <input name="width" type="number" step="any" className="input-box mono text-right" style={{ width: 70, padding: "4px 6px" }} defaultValue={formItem?.width ?? ""} />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-1 py-1.5 border-b border-black text-[12px]" style={{ width: 28 }}>Sr#</th>
                        <th className="px-1 py-1.5 border-b border-black text-[12px]">Count</th>
                        <th className="px-1 py-1.5 border-b border-black text-[12px]">Desc</th>
                        <th className="px-1 py-1.5 border-b border-black text-[12px]">Brand</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">Cal Count</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">Ends</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">WT Per Mtr</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">Rate Per Lbs</th>
                        <th className="px-1 py-1.5 border-b border-black text-right text-[12px]">Cost Per Mtr</th>
                        <th className="px-1 py-1.5 border-b border-black text-[12px]" style={{ width: 22 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {weftGrid.map((r, idx) => {
                        const i = idx + 1;
                        return (
                          <tr key={i}>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-center">{i}</td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_count_${i}`} list="gc-yarn-counts" className={gridCellCls} defaultValue={r?.count ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_descr_${i}`} className={gridCellCls} defaultValue={r?.descr ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_brand_${i}`} list="gc-brands" className={gridCellCls} defaultValue={r?.brand ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_cal_count_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.calCount ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_ends_${i}`} type="number" step="1" className={gridCellNumCls} defaultValue={r?.ends ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_wt_${i}`} type="number" step="any" className={gridCellCalcCls} defaultValue={r?.wtPerMtr ?? ""} readOnly /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_rate_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.ratePerLbs ?? ""} /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_cost_${i}`} type="number" step="any" className={gridCellCalcCls} defaultValue={r?.costPerMtr ?? ""} readOnly /></td>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)] text-center text-[var(--muted)] cursor-pointer" title="Clear row">X</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-end gap-2 mt-5 flex-wrap">
              <button type="submit" className="btn btn-sm">Save</button>
              <a href="/external/contracts/grey-conversion?adding=1" className="btn btn-outline btn-sm">New</a>
              <PrintButton />
              {formItem && (
                <a
                  href={`/external/contracts/grey-conversion/${formItem.id}/print`}
                  target="_blank"
                  className="btn btn-outline btn-sm"
                >
                  Print Contract
                </a>
              )}
              <a href="/external/contracts/grey-conversion" className="btn btn-outline btn-sm">Exit</a>
              <div className="ml-auto">
                <label className="label block mb-1">Alt-S Password</label>
                <input className="input-box mono" placeholder="password" type="password" />
              </div>
            </div>
          </form>

          {formItem && (
            <form action={deleteContract} className="inline mt-3">
              <input type="hidden" name="id" value={formItem.id} />
              <ConfirmButton message="Delete this contract and its warp/weft rows? This cannot be undone.">Del</ConfirmButton>
            </form>
          )}

        </div>

        <div className="border border-black">
          <form action="/external/contracts/grey-conversion" method="get" className="flex gap-2 items-end flex-wrap border-b border-black p-3 bg-gray-50">
            <div>
              <label className="label block mb-1">Find</label>
              <input
                name="find"
                defaultValue={findFilter ?? ""}
                placeholder="Cont No, Party, Gray Code, Product…"
                className="input-box mono text-[13px]"
                style={{ maxWidth: 260 }}
              />
            </div>
            <div>
              <label className="label block mb-1">Party wise</label>
              <select name="fparty" defaultValue={fParty} className="input-box mono text-[13px]" style={{ maxWidth: 240 }}>
                <option value="">— All parties —</option>
                {partyFindRows.map((p) => (
                  <option key={p.value} value={p.value}>{p.code} — {p.description}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label block mb-1">Grey construction wise</label>
              <select name="fgrey" defaultValue={fGrey} className="input-box mono text-[13px]" style={{ maxWidth: 240 }}>
                <option value="">— All qualities —</option>
                {greyPickerRows.map((g) => (
                  <option key={g.code} value={g.code}>{g.code}{g.reed && g.pick ? ` — R${g.reed} P${g.pick}` : ""} {g.description}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-outline btn-sm">Search</button>
            {(findFilter || fParty || fGrey) && <a href="/external/contracts/grey-conversion" className="btn btn-outline btn-sm">Clear</a>}
          </form>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Cont No</th>
                  <th>Party</th>
                  <th>Gray Code</th>
                  <th>Product Name</th>
                  <th>Loom Type</th>
                  <th className="text-right">Qty Mtr</th>
                  <th className="text-right">Rate/Mtr</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const isSel = c.id === selected?.id;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  const href = `/external/contracts/grey-conversion?id=${c.id}`;
                  return (
                    <tr key={c.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono font-bold"><a href={href} className="no-underline block" style={linkStyle}>{c.contNo}</a></td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.party ?? "-"}
                          {c.party && partyCodeByDesc.get(c.party) && (
                            <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(c.party)}</span>
                          )}
                        </a>
                      </td>
                      <td className="mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.grayCode ?? "-"}
                          {c.grayCode && greyDescByCode.get(c.grayCode) && (
                            <span className="block text-[11px] opacity-70">{greyDescByCode.get(c.grayCode)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.productName ?? "-"}
                          {c.productName && productCodeByDesc.get(c.productName) && (
                            <span className="block text-[11px] opacity-70">{productCodeByDesc.get(c.productName)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{c.loomType ?? "-"}</a></td>
                      <td className="text-right mono"><a href={href} className="no-underline block" style={linkStyle}>{c.qtyMtr ?? "-"}</a></td>
                      <td className="text-right mono"><a href={href} className="no-underline block" style={linkStyle}>{c.rateMtr ?? "-"}</a></td>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{c.status}</a></td>
                    </tr>
                  );
                })}
                {contracts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-[var(--muted)] py-6 text-[13px]">
                      No contracts. Click New to add one.
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
