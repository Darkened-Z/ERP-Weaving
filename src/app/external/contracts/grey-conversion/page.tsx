import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

const LOOM_TYPES = ["RAPIER", "AIR_JET", "WATER_JET", "PROJECTILE", "SHUTTLE", "SULZER", "TSUDAKOMA"];
const SELV_TYPES = ["LENO", "PLAIN", "TAPE", "CATCH", "TUCK-IN"];
const SEASON_TYPES = ["SUMMER", "WINTER", "ALL SEASON", "SPRING", "AUTUMN"];

export default async function GreyConvContractPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isAdding = params.adding === "1";
  const findFilter = params.find?.trim();

  const parties = await db.select().from(schema.chartOfAccounts).orderBy(schema.chartOfAccounts.description);

  const escFind = findFilter?.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = `%${escFind}%`;
  const contracts = findFilter
    ? await db
        .select()
        .from(schema.extGreyConvContract)
        .where(
          or(
            sql`${schema.extGreyConvContract.contNo} LIKE ${pat} ESCAPE '\\'`,
            sql`${schema.extGreyConvContract.party} LIKE ${pat} ESCAPE '\\'`,
            sql`${schema.extGreyConvContract.grayCode} LIKE ${pat} ESCAPE '\\'`,
            sql`${schema.extGreyConvContract.productName} LIKE ${pat} ESCAPE '\\'`
          )
        )
        .orderBy(sql`cont_date desc`)
    : await db
        .select()
        .from(schema.extGreyConvContract)
        .orderBy(sql`cont_date desc`);

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

  const warpGrid = Array.from({ length: 9 }, (_, i) => warpRows.find((r) => r.srNo === i + 1) ?? null);
  const weftGrid = Array.from({ length: 9 }, (_, i) => weftRows.find((r) => r.srNo === i + 1) ?? null);

  const today = new Date().toISOString().slice(0, 10);
  const lContCount = contracts.length;

  async function saveContract(formData: FormData) {
    "use server";
    const idStr = formData.get("id") as string;
    const idParsed = idStr ? parseInt(idStr, 10) : NaN;
    const isUpdate = Number.isFinite(idParsed);

    let contNo = (formData.get("cont_no") as string)?.trim() || "";
    if (!isUpdate) {
      const rows = await db
        .select({ maxNum: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 5) AS INTEGER)), 0)` })
        .from(schema.extGreyConvContract);
      const maxNum = rows[0]?.maxNum ?? 0;
      contNo = `GCC-${String(maxNum + 1).padStart(4, "0")}`;
    }

    const data = {
      contNo,
      lContNo: int(formData.get("l_cont_no")),
      contDate: txt(formData.get("cont_date")) ?? new Date().toISOString().slice(0, 10),
      expDate: txt(formData.get("exp_date")),
      status: txt(formData.get("status")) ?? "R",
      type: "CONV",
      party: txt(formData.get("party")),
      weaveFrame: txt(formData.get("weave_frame")),
      selvType: txt(formData.get("selv_type")),
      slvName: txt(formData.get("slv_name")),
      qtyMtr: num(formData.get("qty_mtr")),
      costLakhaiBorderMtr: num(formData.get("cost_lakhai_border_mtr")),
      ratePerPick: num(formData.get("rate_per_pick")),
      rateMtr: num(formData.get("rate_mtr")),
      loomType: txt(formData.get("loom_type")),
      broker: txt(formData.get("broker")),
      ratePick: num(formData.get("rate_pick")),
      designNo: txt(formData.get("design_no")),
      grayQltyCode: txt(formData.get("gray_qlty_code")),
      img: txt(formData.get("img")),
      wrpWt40: num(formData.get("wrp_wt_40")),
      wftWt40: num(formData.get("wft_wt_40")),
      weight40: num(formData.get("weight_40")),
      remarks: txt(formData.get("remarks")),
      read: num(formData.get("read")),
      pick: num(formData.get("pick")),
      width: num(formData.get("width")),
      findDesign: txt(formData.get("find_design")),
      grayCode: txt(formData.get("gray_code")),
      findContract: txt(formData.get("find_contract")),
      warpWtPerMtr: num(formData.get("warp_wt_per_mtr")),
      weftWtPerMtr: num(formData.get("weft_wt_per_mtr")),
      wtPerMtr: num(formData.get("wt_per_mtr")),
      warpCostPerMtr: num(formData.get("warp_cost_per_mtr")),
      weftCostPerMtr: num(formData.get("weft_cost_per_mtr")),
      costPerMtr: num(formData.get("cost_per_mtr")),
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
            .update(schema.extGreyConvContract)
            .set(data)
            .where(eq(schema.extGreyConvContract.id, idParsed));
          cid = idParsed;
          await tx.delete(schema.extGreyConvWarp).where(eq(schema.extGreyConvWarp.contractId, cid));
          await tx.delete(schema.extGreyConvWeft).where(eq(schema.extGreyConvWeft.contractId, cid));
        } else {
          const [inserted] = await tx
            .insert(schema.extGreyConvContract)
            .values(data)
            .returning({ id: schema.extGreyConvContract.id });
          cid = inserted.id;
        }

        const warpValues: (typeof schema.extGreyConvWarp.$inferInsert)[] = [];
        for (let i = 1; i <= 9; i++) {
          const count = txt(formData.get(`warp_count_${i}`));
          const descr = txt(formData.get(`warp_descr_${i}`));
          const brand = txt(formData.get(`warp_brand_${i}`));
          const calCount = num(formData.get(`warp_cal_count_${i}`));
          const ends = int(formData.get(`warp_ends_${i}`));
          const wtPerMtr = num(formData.get(`warp_wt_${i}`));
          const ratePerLbs = num(formData.get(`warp_rate_${i}`));
          const costPerMtr = num(formData.get(`warp_cost_${i}`));
          if (count || descr || brand || calCount !== null || ends !== null || wtPerMtr !== null || ratePerLbs !== null || costPerMtr !== null) {
            warpValues.push({ contractId: cid, srNo: i, count, descr, brand, calCount, ends, wtPerMtr, ratePerLbs, costPerMtr });
          }
        }

        const weftValues: (typeof schema.extGreyConvWeft.$inferInsert)[] = [];
        for (let i = 1; i <= 9; i++) {
          const count = txt(formData.get(`weft_count_${i}`));
          const descr = txt(formData.get(`weft_descr_${i}`));
          const brand = txt(formData.get(`weft_brand_${i}`));
          const calCount = num(formData.get(`weft_cal_count_${i}`));
          const ends = int(formData.get(`weft_ends_${i}`));
          const wtPerMtr = num(formData.get(`weft_wt_${i}`));
          const ratePerLbs = num(formData.get(`weft_rate_${i}`));
          const costPerMtr = num(formData.get(`weft_cost_${i}`));
          if (count || descr || brand || calCount !== null || ends !== null || wtPerMtr !== null || ratePerLbs !== null || costPerMtr !== null) {
            weftValues.push({ contractId: cid, srNo: i, count, descr, brand, calCount, ends, wtPerMtr, ratePerLbs, costPerMtr });
          }
        }

        if (warpValues.length) await tx.insert(schema.extGreyConvWarp).values(warpValues);
        if (weftValues.length) await tx.insert(schema.extGreyConvWeft).values(weftValues);

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
      const q = isUpdate ? `?id=${idParsed}&error=code_exists` : `?adding=1&error=code_exists`;
      redirect("/external/contracts/grey-conversion" + q);
    }

    if (contractId === null) return;

    revalidatePath("/external/contracts/grey-conversion");
    redirect(`/external/contracts/grey-conversion?id=${contractId}`);
  }

  async function deleteContract(formData: FormData) {
    "use server";
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

  const gridCellCls = "input-box mono text-[12px]";
  const gridCellNumCls = "input-box mono text-[12px] text-right";
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

        {params.error === "code_exists" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Contract No already exists. Save again to auto-assign a fresh number.
          </div>
        )}

        <div className="border border-black p-5 mb-6">
          <form action={saveContract}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}

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
                      placeholder={isAdding ? "auto GCC-####" : ""}
                      readOnly={!!formItem}
                    />
                  </div>
                  <div>
                    <label className="label block mb-1">LCont.No</label>
                    <input name="l_cont_no" className={roCls} defaultValue={formItem?.lContNo ?? lContCount} readOnly />
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
                    <input name="party" list="parties-list" className="input-box mono text-[13px]" defaultValue={formItem?.party ?? ""} />
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
                  <div>
                    <label className="label block mb-1">Weave</label>
                    <input name="weave" className="input-box mono text-[13px]" defaultValue={formItem?.weaveFrame ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Slv. Name</label>
                    <input name="slv_name_2" className="input-box mono text-[13px]" defaultValue={formItem?.slvName ?? ""} />
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
                    <input name="broker" list="parties-list" className="input-box mono text-[13px]" defaultValue={formItem?.broker ?? ""} />
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
                    <input name="gray_qlty_code" className="input-box mono" defaultValue={formItem?.grayQltyCode ?? ""} />
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
                    <input name="read" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.read ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Pick</label>
                    <input name="pick" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.pick ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Width</label>
                    <input name="width" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.width ?? ""} />
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
                  <input name="gray_code" className={yellowCls} style={{ background: "#FFF8B7" }} defaultValue={formItem?.grayCode ?? ""} />
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
                  <input name="product_name" className="input-box" defaultValue={formItem?.productName ?? ""} />
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
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-1 py-1 border-b border-black" style={{ width: 28 }}>Sr#</th>
                        <th className="px-1 py-1 border-b border-black">Count</th>
                        <th className="px-1 py-1 border-b border-black">Desc</th>
                        <th className="px-1 py-1 border-b border-black">Brand</th>
                        <th className="px-1 py-1 border-b border-black text-right">Cal Count</th>
                        <th className="px-1 py-1 border-b border-black text-right">Ends</th>
                        <th className="px-1 py-1 border-b border-black text-right">WT Per Mtr</th>
                        <th className="px-1 py-1 border-b border-black text-right">Rate Per Lbs</th>
                        <th className="px-1 py-1 border-b border-black text-right">Cost Per Mtr</th>
                        <th className="px-1 py-1 border-b border-black" style={{ width: 22 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {warpGrid.map((r, idx) => {
                        const i = idx + 1;
                        return (
                          <tr key={i}>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-center">{i}</td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_count_${i}`} className={gridCellCls} defaultValue={r?.count ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_descr_${i}`} className={gridCellCls} defaultValue={r?.descr ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_brand_${i}`} className={gridCellCls} defaultValue={r?.brand ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_cal_count_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.calCount ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_ends_${i}`} type="number" step="1" className={gridCellNumCls} defaultValue={r?.ends ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_wt_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.wtPerMtr ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_rate_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.ratePerLbs ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`warp_cost_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.costPerMtr ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)] text-center text-[var(--muted)] cursor-pointer" title="Clear row">X</td>
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
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-1 py-1 border-b border-black" style={{ width: 28 }}>Sr#</th>
                        <th className="px-1 py-1 border-b border-black">Count</th>
                        <th className="px-1 py-1 border-b border-black">Desc</th>
                        <th className="px-1 py-1 border-b border-black">Brand</th>
                        <th className="px-1 py-1 border-b border-black text-right">Cal Count</th>
                        <th className="px-1 py-1 border-b border-black text-right">Ends</th>
                        <th className="px-1 py-1 border-b border-black text-right">WT Per Mtr</th>
                        <th className="px-1 py-1 border-b border-black text-right">Rate Per Lbs</th>
                        <th className="px-1 py-1 border-b border-black text-right">Cost Per Mtr</th>
                        <th className="px-1 py-1 border-b border-black" style={{ width: 22 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {weftGrid.map((r, idx) => {
                        const i = idx + 1;
                        return (
                          <tr key={i}>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-center">{i}</td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_count_${i}`} className={gridCellCls} defaultValue={r?.count ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_descr_${i}`} className={gridCellCls} defaultValue={r?.descr ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_brand_${i}`} className={gridCellCls} defaultValue={r?.brand ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_cal_count_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.calCount ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_ends_${i}`} type="number" step="1" className={gridCellNumCls} defaultValue={r?.ends ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_wt_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.wtPerMtr ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_rate_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.ratePerLbs ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]"><input name={`weft_cost_${i}`} type="number" step="any" className={gridCellNumCls} defaultValue={r?.costPerMtr ?? ""} /></td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)] text-center text-[var(--muted)] cursor-pointer" title="Clear row">X</td>
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
              <button type="submit" className="btn btn-outline btn-sm">Del</button>
            </form>
          )}

          <datalist id="parties-list">
            {parties.map((p) => (
              <option key={p.code} value={p.description} />
            ))}
          </datalist>
        </div>

        <div className="border border-black">
          <form action="/external/contracts/grey-conversion" method="get" className="flex gap-2 items-center border-b border-black p-3 bg-gray-50">
            <label className="label">Find</label>
            <input
              name="find"
              defaultValue={findFilter ?? ""}
              placeholder="Cont No, Party, Gray Code, Product…"
              className="input-box mono text-[13px]"
              style={{ maxWidth: 320 }}
            />
            <button type="submit" className="btn btn-outline btn-sm">Search</button>
            {findFilter && <a href="/external/contracts/grey-conversion" className="btn btn-outline btn-sm">Clear</a>}
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
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{c.party ?? "-"}</a></td>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{c.grayCode ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{c.productName ?? "-"}</a></td>
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
