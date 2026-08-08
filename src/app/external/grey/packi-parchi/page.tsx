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

const TYPE_OPTIONS = ["OK", "REJ"];
const TYPE_REJ_OPTIONS = ["OK", "REJ", "MIX"];
const TERM_OPTIONS = ["CASH", "CREDIT"];
const COUNT_ROWS = 4;

export default async function PackiParchiPage({
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
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);

  const nextVNoRow = await db
    .select({
      m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extPackiParchi.vNo}, 4) AS INTEGER)), 0)`,
    })
    .from(schema.extPackiParchi);
  const upcomingVNo = "PP-" + String((nextVNoRow[0]?.m ?? 0) + 1).padStart(4, "0");

  async function saveParchi(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const vDate = ((formData.get("v_date") as string) || "").trim() || today();
    const purchaseParty = txt(formData.get("purchase_party"));
    const kpNo = txt(formData.get("kp_no"));
    const kpAll = formData.get("kp_all") ? "Y" : "N";
    const ppNo = txt(formData.get("pp_no"));
    const ppDate = txt(formData.get("pp_date"));
    const quality = txt(formData.get("quality"));
    const qualityPrint = txt(formData.get("quality_print"));
    const meterRe = num(formData.get("meter_re"));
    const meterKam = num(formData.get("meter_kam"));
    const meterNet = num(formData.get("meter_net"));
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
    const salAmtDiff = num(formData.get("sal_amt_diff"));
    const woc = num(formData.get("woc"));
    const wc = num(formData.get("wc"));
    const wck = num(formData.get("wck"));
    const printingName = txt(formData.get("printing_name"));
    const commissionTotal = num(formData.get("commission_total"));
    const diff = num(formData.get("diff"));
    const termSal = txt(formData.get("term_sal"));
    const typeRej = txt(formData.get("type_rej"));

    const warpQuality = txt(formData.get("warp_quality"));
    const warpWt = num(formData.get("warp_wt"));
    const warpBags = num(formData.get("warp_bags"));
    const warpRate = num(formData.get("warp_rate"));
    const warpAmount = num(formData.get("warp_amount"));

    const weftQuality = txt(formData.get("weft_quality"));
    const weftWt = num(formData.get("weft_wt"));
    const weftBags = num(formData.get("weft_bags"));
    const weftRate = num(formData.get("weft_rate"));
    const weftAmount = num(formData.get("weft_amount"));

    const bagRows: {
      section: string;
      quality: string | null;
      wtPerMeter: number | null;
      bags: number | null;
      rate: number | null;
      amount: number | null;
    }[] = [];

    if (warpQuality || warpWt != null || warpBags != null || warpRate != null || warpAmount != null) {
      bagRows.push({
        section: "WARP",
        quality: warpQuality,
        wtPerMeter: warpWt,
        bags: warpBags,
        rate: warpRate,
        amount: warpAmount,
      });
    }
    if (weftQuality || weftWt != null || weftBags != null || weftRate != null || weftAmount != null) {
      bagRows.push({
        section: "WEFT",
        quality: weftQuality,
        wtPerMeter: weftWt,
        bags: weftBags,
        rate: weftRate,
        amount: weftAmount,
      });
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

    if (Number.isFinite(id) && id > 0) {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.extPackiParchi)
          .set({
            vDate, purchaseParty, kpNo, kpAll, ppNo, ppDate, quality, qualityPrint,
            meterRe, meterKam, meterNet, than, kpMeter, brokerName, brokerPercent,
            meterFineNum, meterFineDen, greyRate, wokc, wkcBrk, elCumiNum, elCumiDen,
            elMeter, elMeterMode, type, kaatPercent, checkery, commission, convContNo,
            saleParty, convContNoSale, commissionSale, greyRateKp, kaatPercentSale,
            checkerySale, brokerNameSale, brokerPercentSale, remarks, salAmtDiff, woc,
            wc, wck, printingName, commissionTotal, diff, termSal, typeRej,
            modifiedDate: nowIso,
          })
          .where(eq(schema.extPackiParchi.id, id));

        await tx.delete(schema.extPackiParchiBag).where(eq(schema.extPackiParchiBag.parchiId, id));
        await tx.delete(schema.extPackiParchiCount).where(eq(schema.extPackiParchiCount.parchiId, id));

        if (bagRows.length) {
          await tx.insert(schema.extPackiParchiBag).values(bagRows.map((b) => ({ ...b, parchiId: id })));
        }
        if (validCounts.length) {
          await tx.insert(schema.extPackiParchiCount).values(validCounts.map((c) => ({ ...c, parchiId: id })));
        }
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
              meterRe, meterKam, meterNet, than, kpMeter, brokerName, brokerPercent,
              meterFineNum, meterFineDen, greyRate, wokc, wkcBrk, elCumiNum, elCumiDen,
              elMeter, elMeterMode, type, kaatPercent, checkery, commission, convContNo,
              saleParty, convContNoSale, commissionSale, greyRateKp, kaatPercentSale,
              checkerySale, brokerNameSale, brokerPercentSale, remarks, salAmtDiff, woc,
              wc, wck, printingName, commissionTotal, diff, termSal, typeRej,
              postedDate: nowIso,
            })
            .returning({ id: schema.extPackiParchi.id });
          const insertedId = inserted[0].id;

          if (bagRows.length) {
            await tx.insert(schema.extPackiParchiBag).values(bagRows.map((b) => ({ ...b, parchiId: insertedId })));
          }
          if (validCounts.length) {
            await tx.insert(schema.extPackiParchiCount).values(validCounts.map((c) => ({ ...c, parchiId: insertedId })));
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
        redirect(`/external/grey/packi-parchi?error=code_exists`);
      }

      revalidatePath("/external/grey/packi-parchi");
      redirect(`/external/grey/packi-parchi?id=${newId}`);
    }
  }

  async function deleteParchi(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
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
  const gridCellCls = "input-box mono text-[12px]";
  const gridCellNumCls = "input-box mono text-[12px] text-right";

  const bagTotalAmount =
    (warpBag?.amount ?? 0) + (weftBag?.amount ?? 0);

  return (
    <Shell active="ext-pp">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
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

        <datalist id="pp-parties">
          {parties.map((p) => (
            <option key={p.code} value={p.description}>
              {p.code}
            </option>
          ))}
        </datalist>

        <form id="pp-find-form" method="GET" action="/external/grey/packi-parchi" className="hidden"></form>

        <div className="border border-black p-5 mb-6">
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
              {formItem && (
                <form action={deleteParchi} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <button type="submit" className="btn btn-outline btn-sm">Del</button>
                </form>
              )}
              <button type="button" className="btn btn-outline btn-sm">Conv Rate</button>
            </div>
          </div>

          <form id="pp-save-form" action={saveParchi}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
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
              <div className="lg:col-span-2">
                <label className="label block mb-1">Posted</label>
                <input
                  className={roCls + " text-[12px]"}
                  defaultValue={formItem?.postedDate?.slice(0, 10) ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Modified</label>
                <input
                  className={roCls + " text-[12px]"}
                  defaultValue={formItem?.modifiedDate?.slice(0, 10) ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>

              <div className="lg:col-span-6">
                <label className="label block mb-1">Purchase Party</label>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <input name="purchase_party_code" className="input-box mono" placeholder="Code" />
                  <input
                    name="purchase_party"
                    list="pp-parties"
                    className="input-box mono"
                    placeholder="Description"
                    defaultValue={formItem?.purchaseParty ?? ""}
                  />
                </div>
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">KP.No</label>
                <input
                  name="kp_no"
                  className="input-box mono"
                  defaultValue={formItem?.kpNo ?? ""}
                />
              </div>
              <div className="lg:col-span-1 flex items-end pb-2">
                <label className="flex items-center gap-1 text-[11px] mono">
                  <input
                    type="checkbox"
                    name="kp_all"
                    defaultChecked={formItem?.kpAll === "Y"}
                    className="mono"
                  />
                  KP-ALL
                </label>
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">PP.No</label>
                <input
                  name="pp_no"
                  className="input-box mono"
                  defaultValue={formItem?.ppNo ?? ""}
                />
              </div>
              <div className="lg:col-span-1">
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
                <input
                  name="quality"
                  className="input-box mono"
                  defaultValue={formItem?.quality ?? ""}
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
                <label className="label block mb-1">KP.Meter</label>
                <input
                  name="kp_meter"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.kpMeter ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Broker Name</label>
                <input
                  name="broker_name"
                  className="input-box mono"
                  defaultValue={formItem?.brokerName ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">KP. Meter</label>
                <input
                  className={roCls + " text-right"}
                  defaultValue={formItem?.kpMeter ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-1">
                <label className="label block mb-1">Broker %</label>
                <input
                  name="broker_percent"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.brokerPercent ?? ""}
                />
              </div>

              <div className="lg:col-span-2">
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
                    className="input-box mono text-right"
                    defaultValue={formItem?.elMeter ?? ""}
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

              <div className="lg:col-span-2">
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
                <label className="label block mb-1">Grey Rate</label>
                <input
                  name="grey_rate"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.greyRate ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
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
              <div className="lg:col-span-2">
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
                <input
                  name="conv_cont_no"
                  className="input-box mono"
                  defaultValue={formItem?.convContNo ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Checkery</label>
                <input
                  name="checkery"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.checkery ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
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

              <div className="lg:col-span-12 border-t border-black pt-3 mt-1">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">Sale Side</div>
              </div>

              <div className="lg:col-span-6">
                <label className="label block mb-1">Sale Party</label>
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <input name="sale_party_code" className="input-box mono" placeholder="Code" />
                  <input
                    name="sale_party"
                    list="pp-parties"
                    className="input-box mono"
                    placeholder="Description"
                    defaultValue={formItem?.saleParty ?? ""}
                  />
                </div>
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Conv. Cont #</label>
                <input
                  name="conv_cont_no_sale"
                  className="input-box mono"
                  defaultValue={formItem?.convContNoSale ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Commission</label>
                <input
                  name="commission_sale"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.commissionSale ?? ""}
                />
              </div>

              <div className="lg:col-span-2">
                <label className="label block mb-1">Grey Rate Kp</label>
                <input
                  name="grey_rate_kp"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.greyRateKp ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Kaat %</label>
                <input
                  name="kaat_percent_sale"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.kaatPercentSale ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
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
                <label className="label block mb-1">Printing Name</label>
                <input
                  name="printing_name"
                  className="input-box mono"
                  defaultValue={formItem?.printingName ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Broker Name</label>
                <input
                  name="broker_name_sale"
                  className="input-box mono"
                  defaultValue={formItem?.brokerNameSale ?? ""}
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
              <div className="lg:col-span-10">
                <label className="label block mb-1">Remarks</label>
                <input
                  name="remarks"
                  className="input-box mono"
                  defaultValue={formItem?.remarks ?? ""}
                />
              </div>

              <div className="lg:col-span-12 border-t border-black pt-3 mt-1">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">Totals</div>
              </div>

              <div className="lg:col-span-2">
                <label className="label block mb-1">Sal.Amt.Diff</label>
                <input
                  name="sal_amt_diff"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.salAmtDiff ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">W.O.C</label>
                <input
                  name="woc"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.woc ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">W.C</label>
                <input
                  name="wc"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.wc ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">W.C.K</label>
                <input
                  name="wck"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.wck ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
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
              <div className="lg:col-span-2">
                <label className="label block mb-1">Diff</label>
                <input
                  name="diff"
                  type="number"
                  step="any"
                  className="input-box mono text-right"
                  defaultValue={formItem?.diff ?? ""}
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
                      <td><input name="warp_quality" className={gridCellCls} defaultValue={warpBag?.quality ?? ""} /></td>
                      <td><input name="warp_wt" type="number" step="any" className={gridCellNumCls} defaultValue={warpBag?.wtPerMeter ?? ""} /></td>
                      <td><input name="warp_bags" type="number" step="any" className={gridCellNumCls} defaultValue={warpBag?.bags ?? ""} /></td>
                      <td><input name="warp_rate" type="number" step="any" className={gridCellNumCls} defaultValue={warpBag?.rate ?? ""} /></td>
                      <td><input name="warp_amount" type="number" step="any" className={gridCellNumCls + " bg-gray-100"} defaultValue={warpBag?.amount ?? ""} readOnly /></td>
                    </tr>
                    <tr>
                      <td className="mono text-[12px] text-center font-bold">Weft</td>
                      <td><input name="weft_quality" className={gridCellCls} defaultValue={weftBag?.quality ?? ""} /></td>
                      <td><input name="weft_wt" type="number" step="any" className={gridCellNumCls} defaultValue={weftBag?.wtPerMeter ?? ""} /></td>
                      <td><input name="weft_bags" type="number" step="any" className={gridCellNumCls} defaultValue={weftBag?.bags ?? ""} /></td>
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
                        <td><input name="count_code" className={gridCellCls} defaultValue={row?.code ?? ""} /></td>
                        <td><input name="count_type" className={gridCellCls} defaultValue={row?.type ?? ""} /></td>
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
              {formItem && (
                <button type="submit" formAction={deleteParchi} className="btn btn-outline btn-sm">Del</button>
              )}
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
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{p.purchaseParty ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{p.saleParty ?? "-"}</a></td>
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
