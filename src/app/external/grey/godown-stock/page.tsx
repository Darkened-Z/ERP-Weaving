import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
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

const today = () => new Date().toISOString().slice(0, 10);

const TYPE_OPTIONS = ["STOCK", "OTHERS"];
const TERM_OPTIONS = ["", "CASH", "CREDIT"];
const STATUS_OPTIONS = ["", "OK", "REJ"];
const EL_METER_MODE_OPTIONS = ["", "1/5", "1/10"];
const CONV_GREY_TYPES = ["", "CONV", "GREY"];

const LINE_ROWS = 12;
const COUNT_ROWS = 4;

export default async function GodownStockPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string }>;
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

  const lines = formStock
    ? await db
        .select()
        .from(schema.extGodownStockLine)
        .where(eq(schema.extGodownStockLine.stockId, formStock.id))
        .orderBy(schema.extGodownStockLine.srNo)
    : [];

  const counts = formStock
    ? await db
        .select()
        .from(schema.extGodownStockCount)
        .where(eq(schema.extGodownStockCount.stockId, formStock.id))
        .orderBy(schema.extGodownStockCount.id)
    : [];

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);

  const nextVNoVal = await db
    .select({
      m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extGodownStock.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.extGodownStock);
  const upcomingVNo = "GDN-" + String((nextVNoVal[0]?.m ?? 0) + 1).padStart(4, "0");
  const upcomingLvNo = stocks.length + 1;

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
    const days = intVal(formData.get("days"));
    const rateSal = num(formData.get("rate_sal"));
    const salContNo = txt(formData.get("sal_cont_no"));
    const greySaleCont = txt(formData.get("grey_sale_cont"));
    const kaatPercent = num(formData.get("kaat_percent"));
    const elMeter = num(formData.get("el_meter"));
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

    const meterVal = meter ?? 0;
    const kaatVal = kaatPercent ?? 0;
    const netMeter = meterVal - kaatVal;
    const checkeryVal = checkery ?? 0;
    const commissionVal = commission ?? 0;
    const rateConvVal = rateConversion ?? 0;
    const total = netMeter * rateConvVal + checkeryVal + commissionVal;
    const balance = total;

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

    if (Number.isFinite(id) && id > 0) {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.extGodownStock)
          .set({
            vDate, kpNo, type, purchaseParty, gdnParty, contNo, purContNo, contactQuality, dspQuality,
            than, meter, elCumiNum, elCumiDen, kamiMtr, rateConversion, term, days, rateSal, salContNo,
            greySaleCont, kaatPercent, elMeter, elMeterMode, netMeter, checkery, commission, total, balance,
            printingName, brokerName, remarks, imgHash, convGreyType, rate, salAvgRate,
            modifiedDate: nowIso,
          })
          .where(eq(schema.extGodownStock.id, id));

        await tx.delete(schema.extGodownStockLine).where(eq(schema.extGodownStockLine.stockId, id));
        await tx.delete(schema.extGodownStockCount).where(eq(schema.extGodownStockCount.stockId, id));

        if (validLines.length) {
          await tx.insert(schema.extGodownStockLine).values(validLines.map((l) => ({ ...l, stockId: id })));
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
          const cntAll = await tx.select({ c: sql<number>`count(*)` }).from(schema.extGodownStock);
          const nextL = (cntAll[0]?.c ?? 0) + 1;

          const inserted = await tx
            .insert(schema.extGodownStock)
            .values({
              vNo, lvNo: nextL, vDate, kpNo, type, purchaseParty, gdnParty, contNo, purContNo,
              contactQuality, dspQuality, than, meter, elCumiNum, elCumiDen, kamiMtr, rateConversion,
              term, days, rateSal, salContNo, greySaleCont, kaatPercent, elMeter, elMeterMode, netMeter,
              checkery, commission, total, balance, printingName, brokerName, remarks, imgHash,
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
  }

  async function deleteStock(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.extGodownStockCount).where(eq(schema.extGodownStockCount.stockId, id));
      await tx.delete(schema.extGodownStockLine).where(eq(schema.extGodownStockLine.stockId, id));
      await tx.delete(schema.extGodownStock).where(eq(schema.extGodownStock.id, id));
    });
    revalidatePath("/external/grey/godown-stock");
    redirect("/external/grey/godown-stock");
  }

  const lineGridRows: (typeof lines[number] | null)[] = Array.from(
    { length: LINE_ROWS },
    (_, i) => lines[i] ?? null
  );
  const countGridRows: (typeof counts[number] | null)[] = Array.from(
    { length: COUNT_ROWS },
    (_, i) => counts[i] ?? null
  );

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const roCls = "input-box mono bg-gray-100";
  const greenCls = "input-box mono bg-green-50";
  const gridCellCls = "input-box mono text-[12px]";
  const gridCellNumCls = "input-box mono text-[12px] text-right";

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
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
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

        <datalist id="gdn-parties">
          {parties.map((p) => (
            <option key={p.code} value={p.description}>
              {p.code}
            </option>
          ))}
        </datalist>

        <form id="gdn-find-form" method="GET" action="/external/grey/godown-stock" className="hidden"></form>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          <div className="lg:col-span-3">
            <div className="border border-black p-5">
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
                  {formStock && (
                    <form action={deleteStock} className="inline">
                      <input type="hidden" name="id" value={formStock.id} />
                      <button type="submit" className="btn btn-outline btn-sm">
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <form id="gdn-save-form" action={saveStock}>
                {formStock && <input type="hidden" name="id" value={formStock.id} />}

                <div className="grid grid-cols-12 gap-x-3 gap-y-3">
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
                    <input name="kp_no" className="input-box mono" defaultValue={formStock?.kpNo ?? ""} />
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

                  <div className="col-span-5">
                    <label className="label block mb-1">Purchase Party</label>
                    <div className="grid grid-cols-[100px_1fr] gap-2">
                      <input name="purchase_party_code" className="input-box mono" placeholder="Code" />
                      <input
                        name="purchase_party"
                        list="gdn-parties"
                        className="input-box mono"
                        placeholder="Description"
                        defaultValue={formStock?.purchaseParty ?? ""}
                      />
                    </div>
                  </div>
                  <div className="col-span-2 flex items-end">
                    <button type="button" className="btn btn-outline btn-sm w-full">Clear-OK</button>
                  </div>
                  <div className="col-span-5">
                    <label className="label block mb-1">Pending Finance No</label>
                    <input className={roCls} defaultValue={formStock?.pendingFinance ?? ""} readOnly tabIndex={-1} />
                  </div>

                  <div className="col-span-12">
                    <label className="label block mb-1">Gdn Party</label>
                    <div className="grid grid-cols-[100px_1fr] gap-2">
                      <input name="gdn_party_code" className="input-box mono" placeholder="Code" />
                      <input
                        name="gdn_party"
                        list="gdn-parties"
                        className="input-box mono"
                        placeholder="Description"
                        defaultValue={formStock?.gdnParty ?? ""}
                      />
                    </div>
                  </div>

                  <div className="col-span-6">
                    <label className="label block mb-1">Cont #</label>
                    <input name="cont_no" className="input-box mono" defaultValue={formStock?.contNo ?? ""} />
                  </div>
                  <div className="col-span-6">
                    <label className="label block mb-1">Pur Cont #</label>
                    <input name="pur_cont_no" className="input-box mono" defaultValue={formStock?.purContNo ?? ""} />
                  </div>

                  <div className="col-span-12">
                    <label className="label block mb-1">Contact Quality</label>
                    <input name="contact_quality" className="input-box mono" defaultValue={formStock?.contactQuality ?? ""} />
                  </div>

                  <div className="col-span-12">
                    <label className="label block mb-1">Dsp. Quality</label>
                    <input name="dsp_quality" className="input-box mono" defaultValue={formStock?.dspQuality ?? ""} />
                  </div>

                  <div className="col-span-3">
                    <label className="label block mb-1">Than</label>
                    <input name="than" type="number" step="1" className="input-box mono text-right" defaultValue={formStock?.than ?? ""} />
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Meter</label>
                    <input name="meter" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.meter ?? ""} />
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">EL-Cumi</label>
                    <div className="flex items-center gap-1">
                      <input name="el_cumi_num" type="number" step="1" className="input-box mono text-right" defaultValue={formStock?.elCumiNum ?? ""} />
                      <span className="mono">/</span>
                      <input name="el_cumi_den" type="number" step="1" className="input-box mono text-right" defaultValue={formStock?.elCumiDen ?? ""} />
                    </div>
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Kami Mtr</label>
                    <input name="kami_mtr" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.kamiMtr ?? ""} />
                  </div>

                  <div className="col-span-4">
                    <label className="label block mb-1">Rate Conversion</label>
                    <input name="rate_conversion" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.rateConversion ?? ""} />
                  </div>
                  <div className="col-span-4">
                    <label className="label block mb-1">Term</label>
                    <select name="term" className="input-box mono" defaultValue={formStock?.term ?? ""}>
                      {TERM_OPTIONS.map((t) => (
                        <option key={t} value={t}>{t || "—"}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4">
                    <label className="label block mb-1">Days</label>
                    <input name="days" type="number" step="1" className="input-box mono text-right" defaultValue={formStock?.days ?? ""} />
                  </div>

                  <div className="col-span-3">
                    <label className="label block mb-1">Rate Sal</label>
                    <input name="rate_sal" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.rateSal ?? ""} />
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Sal Cont #</label>
                    <input name="sal_cont_no" className="input-box mono" defaultValue={formStock?.salContNo ?? ""} />
                  </div>
                  <div className="col-span-6">
                    <label className="label block mb-1">Grey Sale Cont</label>
                    <input name="grey_sale_cont" className="input-box mono" defaultValue={formStock?.greySaleCont ?? ""} />
                  </div>

                  <div className="col-span-3">
                    <label className="label block mb-1">Kaat %</label>
                    <input name="kaat_percent" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.kaatPercent ?? ""} />
                  </div>
                  <div className="col-span-4">
                    <label className="label block mb-1">EL-Meter</label>
                    <input name="el_meter" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.elMeter ?? ""} />
                  </div>
                  <div className="col-span-2">
                    <label className="label block mb-1">(1/5 or 1/10)</label>
                    <select name="el_meter_mode" className="input-box mono" defaultValue={formStock?.elMeterMode ?? ""}>
                      {EL_METER_MODE_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m || "—"}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Net Meter</label>
                    <input
                      name="net_meter_display"
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      defaultValue={formStock?.netMeter ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>

                  <div className="col-span-3">
                    <label className="label block mb-1">Checkery</label>
                    <input name="checkery" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.checkery ?? ""} />
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Commission</label>
                    <input name="commission" type="number" step="any" className="input-box mono text-right" defaultValue={formStock?.commission ?? ""} />
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Total</label>
                    <input
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      defaultValue={formStock?.total ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="label block mb-1">Balance</label>
                    <input
                      type="number"
                      step="any"
                      className={roCls + " text-right"}
                      defaultValue={formStock?.balance ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </div>

                  <div className="col-span-6">
                    <label className="label block mb-1">Printing Name</label>
                    <input name="printing_name" className="input-box mono" defaultValue={formStock?.printingName ?? ""} />
                  </div>
                  <div className="col-span-6">
                    <label className="label block mb-1">Broker Name</label>
                    <input name="broker_name" className="input-box mono" defaultValue={formStock?.brokerName ?? ""} />
                  </div>

                  <div className="col-span-12">
                    <label className="label block mb-1">Remarks</label>
                    <input name="remarks" className="input-box" defaultValue={formStock?.remarks ?? ""} />
                  </div>

                  <div className="col-span-12">
                    <label className="label block mb-1">Img #</label>
                    <input name="img_hash" className="input-box mono" defaultValue={formStock?.imgHash ?? ""} />
                  </div>

                  <div className="col-span-12">
                    <div className="border border-black bg-green-50 p-3">
                      <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">Rate Display</div>
                      <div className="grid grid-cols-12 gap-3 items-end">
                        <div className="col-span-3">
                          <label className="label block mb-1">Sal Avg Rate</label>
                          <input
                            name="sal_avg_rate"
                            type="number"
                            step="any"
                            className={greenCls + " text-right"}
                            defaultValue={formStock?.salAvgRate ?? ""}
                            readOnly
                            tabIndex={-1}
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="label block mb-1">Conv/Grey Type</label>
                          <select name="conv_grey_type" className={greenCls} defaultValue={formStock?.convGreyType ?? ""}>
                            {CONV_GREY_TYPES.map((c) => (
                              <option key={c} value={c}>{c || "—"}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-3">
                          <label className="label block mb-1">Rate</label>
                          <input
                            name="rate"
                            type="number"
                            step="any"
                            className={greenCls + " text-right"}
                            defaultValue={formStock?.rate ?? ""}
                          />
                        </div>
                        <div className="col-span-3 flex items-end">
                          <button type="button" className="btn btn-outline btn-sm w-full">OK</button>
                        </div>
                      </div>
                    </div>
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
                    <table className="w-full text-[11px]" style={{ minWidth: "900px" }}>
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-1 py-1 border-b border-black" style={{ width: 28 }}>#</th>
                          <th className="px-1 py-1 border-b border-black">Code</th>
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
                              <input name="count_code" className={gridCellCls} defaultValue={r?.code ?? ""} />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input name="count_type" className={gridCellCls} defaultValue={r?.type ?? ""} />
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
              </form>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="border border-black">
              <div className="px-3 py-2 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold bg-gray-50">
                Than Entry ({LINE_ROWS} rows)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-1 py-1 border-b border-black" style={{ width: 28 }}>Sr#</th>
                      <th className="px-1 py-1 border-b border-black text-right">Than</th>
                      <th className="px-1 py-1 border-b border-black text-right">Mtr</th>
                      <th className="px-1 py-1 border-b border-black">Status</th>
                      <th className="px-1 py-1 border-b border-black" style={{ width: 20 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineGridRows.map((r, i) => (
                      <tr key={r?.id ?? `l-${i}`}>
                        <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-center">{i + 1}</td>
                        <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                          <input form="gdn-save-form" name="line_than" type="number" step="1" className={gridCellNumCls} defaultValue={r?.than ?? ""} />
                        </td>
                        <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                          <input form="gdn-save-form" name="line_mtr" type="number" step="any" className={gridCellNumCls} defaultValue={r?.mtr ?? ""} />
                        </td>
                        <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                          <select form="gdn-save-form" name="line_status" className={gridCellCls} defaultValue={r?.status ?? ""}>
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s || "—"}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-0.5 py-0.5 border-b border-[var(--border-light)] text-center text-[var(--muted)] cursor-pointer" title="Clear row">X</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{s.purchaseParty ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{s.gdnParty ?? "-"}</a></td>
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
