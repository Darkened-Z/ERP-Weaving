import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { AutoFill, RowAutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { IntConvCalc } from "@/components/int-conv-calc";
import { db, schema } from "@/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today as todayFn } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  period_locked: "Period is locked. Cannot save for this date.",
  admin_only: "Only ADMIN can delete contracts.",
};

const LOOM_TYPES = ["RAPIER", "AIR_JET", "WATER_JET", "PROJECTILE", "SHUTTLE", "SULZER", "TSUDAKOMA"];
const SELV_TYPES = ["LENO", "PLAIN", "TAPE", "CATCH", "TUCK-IN"];
const SEASON_TYPES = ["SUMMER", "WINTER", "ALL SEASON", "SPRING", "AUTUMN"];

export default async function IntGreyConversionContractPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
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
    })
    .from(schema.greyConstruction)
    .orderBy(schema.greyConstruction.code);
  const yarnCountList = await db
    .select({
      countCode: schema.yarnCounts.countCode,
      description: schema.yarnCounts.description,
      type: schema.yarnCounts.type,
    })
    .from(schema.yarnCounts)
    .where(eq(schema.yarnCounts.status, "A"))
    .orderBy(schema.yarnCounts.countCode);
  const warpCountFillMap: Record<string, Record<string, string>> = {};
  const weftCountFillMap: Record<string, Record<string, string>> = {};
  for (const c of yarnCountList) {
    for (let i = 1; i <= 9; i++) {
      (warpCountFillMap[String(c.countCode)] ??= {})[`warp_descr_${i}`] = c.description ?? "";
      (warpCountFillMap[String(c.countCode)] ??= {})[`warp_brand_${i}`] = c.type ?? "";
      (weftCountFillMap[String(c.countCode)] ??= {})[`weft_descr_${i}`] = c.description ?? "";
      (weftCountFillMap[String(c.countCode)] ??= {})[`weft_brand_${i}`] = c.type ?? "";
    }
  }
  const productList = await db
    .select({ code: schema.products.code, description: schema.products.description })
    .from(schema.products)
    .orderBy(schema.products.description);

  const escFind = findFilter?.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = escFind ? `%${escFind}%` : "";
  const contracts = findFilter
    ? await db
        .select()
        .from(schema.intGreyConversionContract)
        .where(sql`
          ${schema.intGreyConversionContract.contNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyConversionContract.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyConversionContract.grayCode} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyConversionContract.productName} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intGreyConversionContract.id))
    : await db.select().from(schema.intGreyConversionContract).orderBy(desc(schema.intGreyConversionContract.id));

  const selected = isEditing ? contracts.find((c) => c.id === idParam) ?? null : null;
  const formItem = isAdding ? null : selected;

  const warpRows = formItem
    ? await db
        .select()
        .from(schema.intGreyConversionWarp)
        .where(eq(schema.intGreyConversionWarp.contractId, formItem.id))
        .orderBy(schema.intGreyConversionWarp.srNo)
    : [];

  const weftRows = formItem
    ? await db
        .select()
        .from(schema.intGreyConversionWeft)
        .where(eq(schema.intGreyConversionWeft.contractId, formItem.id))
        .orderBy(schema.intGreyConversionWeft.srNo)
    : [];

  const warpGrid = Array.from({ length: 9 }, (_, i) => warpRows.find((r) => r.srNo === i + 1) ?? null);
  const weftGrid = Array.from({ length: 9 }, (_, i) => weftRows.find((r) => r.srNo === i + 1) ?? null);

  const today = todayFn();
  const [lRow] = await db
    .select({ maxL: sql<number>`coalesce(max(l_cont_no), 0)` })
    .from(schema.intGreyConversionContract);
  const maxLContNo = lRow?.maxL ?? 0;

  const partyOpts = parties.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  const greyOpts = greyList.map((g) => {
    const rp = g.reed && g.pick ? `R${g.reed} P${g.pick} · ` : "";
    const w = g.width ? `${g.width}" ` : "";
    return {
      value: g.code,
      label: `${g.code} — ${rp}${w}${g.description}`,
      desc: `reed ${g.reed ?? ""} pick ${g.pick ?? ""} ${g.reed ?? ""}/${g.pick ?? ""} ${g.reed ?? ""}x${g.pick ?? ""}`,
    };
  });
  const productOpts = productList.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));
  const greyDescByCode = new Map(greyList.map((g) => [g.code, g.description]));
  const productCodeByDesc = new Map(productList.map((p) => [p.description, p.code]));
  const greyFillMap = Object.fromEntries(
    greyList.map((g) => [g.code, { read: g.reed, pick: g.pick, width: g.width }])
  );
  const productFillMap = Object.fromEntries(
    productList.map((p) => [p.description, { product_quality: p.description, slv_name: p.description }])
  );

  async function saveContract(formData: FormData) {
    "use server";
    try {
    const idStr = formData.get("id") as string;
    const idParsed = idStr ? parseInt(idStr, 10) : NaN;
    const isUpdate = Number.isFinite(idParsed);
    const backQ = isUpdate ? `?id=${idParsed}` : `?adding=1`;
    const contDateStr = txt(formData.get("cont_date")) ?? todayFn();
    await assertPeriodOpen(contDateStr, "INVENTORY");

    const ratePerPick = num(formData.get("rate_per_pick"));
    const rateMtr = num(formData.get("rate_mtr"));
    const readVal = num(formData.get("read"));
    const pickVal = num(formData.get("pick"));
    const widthVal = num(formData.get("width"));

    if (!((ratePerPick ?? 0) > 0 || (rateMtr ?? 0) > 0))
      redirect(`/inventory/contracts/grey-conversion${backQ}&error=rate_required`);
    if (!((readVal ?? 0) > 0)) redirect(`/inventory/contracts/grey-conversion${backQ}&error=read_required`);
    if (!((pickVal ?? 0) > 0)) redirect(`/inventory/contracts/grey-conversion${backQ}&error=pick_required`);
    if (!((widthVal ?? 0) > 0)) redirect(`/inventory/contracts/grey-conversion${backQ}&error=width_required`);

    const party = txt(formData.get("party"));
    const designNo = txt(formData.get("design_no"));
    if (party && designNo) {
      const dups = await db
        .select({ id: schema.intGreyConversionContract.id })
        .from(schema.intGreyConversionContract)
        .where(
          and(
            eq(schema.intGreyConversionContract.party, party),
            eq(schema.intGreyConversionContract.designNo, designNo)
          )
        );
      if (dups.some((d) => !isUpdate || d.id !== idParsed))
        redirect(`/inventory/contracts/grey-conversion${backQ}&error=design_exists`);
    }

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
        const ends = intVal(formData.get(`${prefix}_ends_${i}`));
        const ratePerLbs = num(formData.get(`${prefix}_rate_${i}`));
        if (count || descr || brand || calCount !== null || ends !== null || ratePerLbs !== null) {
          const wtPerMtr =
            calCount && calCount > 0 ? round(((ends ?? 0) * 1.0936 / 800) / calCount, 6) : 0;
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

    const data = {
      contNo: providedContNo,
      contDate: contDateStr,
      expDate: txt(formData.get("exp_date")),
      status: txt(formData.get("status")) ?? "R",
      type: "CONV",
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
      contractId = await db.transaction(async (tx) => {
        let cid: number;
        if (isUpdate) {
          await tx
            .update(schema.intGreyConversionContract)
            .set(data)
            .where(eq(schema.intGreyConversionContract.id, idParsed));
          cid = idParsed;
          await tx.delete(schema.intGreyConversionWarp).where(eq(schema.intGreyConversionWarp.contractId, cid));
          await tx.delete(schema.intGreyConversionWeft).where(eq(schema.intGreyConversionWeft.contractId, cid));
        } else {
          const [rows] = await tx
            .select({ maxNum: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 6) AS INTEGER)), 0)` })
            .from(schema.intGreyConversionContract);
          const contNo = data.contNo || `IGCC-${String((rows?.maxNum ?? 0) + 1).padStart(4, "0")}`;
          const [lr] = await tx
            .select({ maxL: sql<number>`coalesce(max(l_cont_no), 0)` })
            .from(schema.intGreyConversionContract);
          const [inserted] = await tx
            .insert(schema.intGreyConversionContract)
            .values({ ...data, contNo, lContNo: (lr?.maxL ?? 0) + 1, postedDate: new Date().toISOString() })
            .returning({ id: schema.intGreyConversionContract.id });
          cid = inserted.id;
        }

        if (warpParsed.length)
          await tx.insert(schema.intGreyConversionWarp).values(warpParsed.map((r) => ({ contractId: cid, ...r })));
        if (weftParsed.length)
          await tx.insert(schema.intGreyConversionWeft).values(weftParsed.map((r) => ({ contractId: cid, ...r })));

        return cid;
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
      redirect(`/inventory/contracts/grey-conversion${backQ}&error=code_exists`);
    }

    if (contractId === null) return;

    revalidatePath("/inventory/contracts/grey-conversion");
    redirect(`/inventory/contracts/grey-conversion?id=${contractId}`);
    } catch (e) {
      const err = e as { message?: string; digest?: string };
      if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
      const thru = parseLockedThroughFromError(err.message ?? "");
      if (thru) redirect(`/inventory/contracts/grey-conversion?error=period_locked&thru=${thru}`);
      throw e;
    }
  }

  async function deleteContract(formData: FormData) {
    "use server";
    const session = await getSession();
    if (session?.roleName !== "ADMIN") redirect("/inventory/contracts/grey-conversion?error=admin_only");
    const idParsed = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(idParsed)) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.intGreyConversionWarp).where(eq(schema.intGreyConversionWarp.contractId, idParsed));
      await tx.delete(schema.intGreyConversionWeft).where(eq(schema.intGreyConversionWeft.contractId, idParsed));
      await tx.delete(schema.intGreyConversionContract).where(eq(schema.intGreyConversionContract.id, idParsed));
    });
    revalidatePath("/inventory/contracts/grey-conversion");
    redirect("/inventory/contracts/grey-conversion");
  }

  const gridCellCls = "input-box mono text-[13px] py-1";
  const gridCellNumCls = "input-box mono text-[13px] py-1 text-right";
  const gridCellCalcCls = "input-box mono text-[13px] py-1 text-right bg-gray-100";
  const roCls = "input-box mono text-[13px] bg-gray-100";
  const yellowCls = "input-box mono text-[13px]";
  const greenCls = "input-box mono text-[13px] bg-green-50";

  const showForm = !!formItem || isAdding;

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
    <Shell active="int-c-gcc">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <h1 className="page-title">
            GREY CONVERSION CONTRACT{" "}
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
            filename="int-grey-conv-contracts"
            sheetName="IntGreyConvContract"
          />
        </div>

        {params.error && ERROR_MESSAGES[params.error] && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            {ERROR_MESSAGES[params.error]}
          </div>
        )}

        <div className="border border-black p-5 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New — GREY CONVERSION CONTRACT" : formItem ? `Edit — ${formItem.contNo}` : "GREY CONVERSION CONTRACT"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/contracts/grey-conversion?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="igcc-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              {formItem ? (
                <form action={deleteContract} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <ConfirmButton message="Delete this contract and its warp/weft rows? This cannot be undone.">Delete</ConfirmButton>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled
                  title="Save the contract first to enable delete"
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Delete
                </button>
              )}
              <a href="/inventory/contracts/grey-conversion" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>

          {showForm && (
            <form id="igcc-save-form" action={saveContract}>
              {formItem && <input type="hidden" name="id" value={formItem.id} />}
              <IntConvCalc />
              <AutoFill watch="gray_qlty_code" map={greyFillMap} inputs={["read", "pick", "width"]} />
              <AutoFill watch="product_name" map={productFillMap} inputs={["product_quality", "slv_name"]} />
              {Array.from({ length: 9 }, (_, k) => k + 1).map((i) => (
                <RowAutoFill key={`warp-cf-${i}`} watch={`warp_count_${i}`} map={warpCountFillMap} />
              ))}
              {Array.from({ length: 9 }, (_, k) => k + 1).map((i) => (
                <RowAutoFill key={`weft-cf-${i}`} watch={`weft_count_${i}`} map={weftCountFillMap} />
              ))}
              <datalist id="igcc-yarn-counts">
                {yarnCountList.map((c) => (
                  <option key={c.countCode} value={c.countCode}>{c.countCode} — {c.description}</option>
                ))}
              </datalist>

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
                      <input name="type" className={roCls} defaultValue="CONV" readOnly />
                    </div>
                    <div>
                      <label className="label block mb-1">Cont.No</label>
                      <input
                        name="cont_no"
                        className="input-box mono font-bold"
                        defaultValue={formItem?.contNo ?? ""}
                        placeholder={isAdding ? "auto IGCC-####" : ""}
                        readOnly={!!formItem}
                      />
                    </div>
                    <div>
                      <label className="label block mb-1">LCont.No</label>
                      <input className={roCls} defaultValue={formItem?.lContNo ?? maxLContNo} readOnly tabIndex={-1} />
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
                      <label className="label block mb-1">Party</label>
                      <Combobox name="party" options={partyOpts} defaultValue={formItem?.party ?? ""} placeholder="Select party" className="input-box mono text-[13px]" />
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
                    <div>
                      <label className="label block mb-1">Broaker</label>
                      <Combobox name="broker" options={partyOpts} defaultValue={formItem?.broker ?? ""} placeholder="Select broker" className="input-box mono text-[13px]" />
                    </div>
                    <div>
                      <label className="label block mb-1">Rate/Pick</label>
                      <input name="rate_pick" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.ratePick ?? ""} />
                    </div>
                    <div>
                      <label className="label block mb-1">D.#</label>
                      <input name="design_no" className="input-box mono" defaultValue={formItem?.designNo ?? ""} />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="col-span-2">
                      <label className="label block mb-1">Gray Qlty Code (Const)</label>
                      <Combobox name="gray_qlty_code" options={greyOpts} defaultValue={formItem?.grayQltyCode ?? ""} placeholder="Select construction" />
                    </div>
                    <div className="col-span-2">
                      <label className="label block mb-1">Img</label>
                      <input name="img" className="input-box mono text-[13px]" defaultValue={formItem?.img ?? ""} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="label block mb-1">WRP Wt / 40 Mtr</label>
                      <input name="wrp_wt_40" type="number" step="any" className={greenCls} defaultValue={formItem?.wrpWt40 ?? ""} readOnly />
                    </div>
                    <div>
                      <label className="label block mb-1">WFT Wt / 40 Mtr</label>
                      <input name="wft_wt_40" type="number" step="any" className={greenCls} defaultValue={formItem?.wftWt40 ?? ""} readOnly />
                    </div>
                    <div>
                      <label className="label block mb-1">Weight / 40 Mtr</label>
                      <input name="weight_40" type="number" step="any" className={greenCls} defaultValue={formItem?.weight40 ?? ""} readOnly />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="label block mb-1">Remarks</label>
                    <input name="remarks" className="input-box" defaultValue={formItem?.remarks ?? ""} />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label block mb-1">Read</label>
                      <input name="read" type="number" step="any" required className="input-box mono text-right" defaultValue={formItem?.read ?? ""} />
                    </div>
                    <div>
                      <label className="label block mb-1">Pick</label>
                      <input name="pick" type="number" step="any" required className="input-box mono text-right" defaultValue={formItem?.pick ?? ""} />
                    </div>
                    <div>
                      <label className="label block mb-1">Width</label>
                      <input name="width" type="number" step="any" required className="input-box mono text-right" defaultValue={formItem?.width ?? ""} />
                    </div>
                  </div>
                </div>

                <div className="col-span-4 border-l border-[var(--border-light)] pl-4 space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.1em] font-semibold border-b border-black pb-1 mb-2">Reference</div>
                  <div>
                    <label className="label block mb-1">Find Design#</label>
                    <input name="find_design" className="input-box mono text-[13px]" defaultValue={formItem?.findDesign ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Grey Code</label>
                    <Combobox name="gray_code" options={greyOpts} defaultValue={formItem?.grayCode ?? ""} placeholder="Select construction" className={`${yellowCls} bg-[#FFF8B7]`} />
                  </div>
                  <div>
                    <label className="label block mb-1">Find Contract#</label>
                    <input name="find_contract" className={yellowCls} style={{ background: "#FFF8B7" }} defaultValue={formItem?.findContract ?? ""} />
                  </div>

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
                      <input name="warp_read_display" type="number" step="any" className="input-box mono text-right" style={{ width: 70, padding: "4px 6px" }} defaultValue={formItem?.read ?? ""} readOnly />
                      <span className="label">Pick</span>
                      <input name="warp_pick_display" type="number" step="any" className="input-box mono text-right" style={{ width: 70, padding: "4px 6px" }} defaultValue={formItem?.pick ?? ""} readOnly />
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
                              <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_count_${i}`} list="igcc-yarn-counts" className={gridCellCls} defaultValue={r?.count ?? ""} /></td>
                              <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_descr_${i}`} className={gridCellCls} defaultValue={r?.descr ?? ""} readOnly tabIndex={-1} style={{ background: "#f3f4f6" }} /></td>
                              <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_brand_${i}`} className={gridCellCls} defaultValue={r?.brand ?? ""} /></td>
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
                      <input name="weft_width_display" type="number" step="any" className="input-box mono text-right" style={{ width: 70, padding: "4px 6px" }} defaultValue={formItem?.width ?? ""} readOnly />
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
                              <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_count_${i}`} list="igcc-yarn-counts" className={gridCellCls} defaultValue={r?.count ?? ""} /></td>
                              <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_descr_${i}`} className={gridCellCls} defaultValue={r?.descr ?? ""} readOnly tabIndex={-1} style={{ background: "#f3f4f6" }} /></td>
                              <td className="px-1 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_brand_${i}`} className={gridCellCls} defaultValue={r?.brand ?? ""} /></td>
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
                <a href="/inventory/contracts/grey-conversion?adding=1" className="btn btn-outline btn-sm">New</a>
                <PrintButton />
                <a href="/inventory/contracts/grey-conversion" className="btn btn-outline btn-sm">Exit</a>
                <div className="ml-auto">
                  <label className="label block mb-1">Alt-S Password</label>
                  <input className="input-box mono" placeholder="password" type="password" />
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="border border-black">
          <form action="/inventory/contracts/grey-conversion" method="get" className="flex gap-2 items-center border-b border-black p-3 bg-gray-50">
            <label className="label">Find</label>
            <input
              name="find"
              defaultValue={findFilter ?? ""}
              placeholder="Cont No, Party, Gray Code, Product…"
              className="input-box mono text-[13px]"
              style={{ maxWidth: 320 }}
            />
            <button type="submit" className="btn btn-outline btn-sm">Search</button>
            {findFilter && <a href="/inventory/contracts/grey-conversion" className="btn btn-outline btn-sm">Clear</a>}
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
                  const href = `/inventory/contracts/grey-conversion?id=${c.id}`;
                  return (
                    <tr key={c.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono font-bold"><a href={href} className="no-underline block" style={linkStyle}>{c.contNo}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>
                        <div>{c.party ?? "-"}</div>
                        {c.party && partyCodeByDesc.get(c.party) && (
                          <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(c.party)}</div>
                        )}
                      </a></td>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>
                        <div>{c.grayCode ?? "-"}</div>
                        {c.grayCode && greyDescByCode.get(c.grayCode) && (
                          <div className="text-[11px] text-[var(--muted)]">{greyDescByCode.get(c.grayCode)}</div>
                        )}
                      </a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>
                        <div>{c.productName ?? "-"}</div>
                        {c.productName && productCodeByDesc.get(c.productName) && (
                          <div className="text-[11px] text-[var(--muted)]">{productCodeByDesc.get(c.productName)}</div>
                        )}
                      </a></td>
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
