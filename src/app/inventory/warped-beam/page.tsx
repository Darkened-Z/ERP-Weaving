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
const nowTime = () => new Date().toTimeString().slice(0, 5);

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

export default async function WarpedBeamReceivingPage({
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

  const list = findFilter
    ? await db
        .select()
        .from(schema.intWarpedBeamReceiving)
        .where(sql`
          ${schema.intWarpedBeamReceiving.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intWarpedBeamReceiving.beamReceivingFrom} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intWarpedBeamReceiving.gpNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intWarpedBeamReceiving.billNo} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intWarpedBeamReceiving.id))
    : await db.select().from(schema.intWarpedBeamReceiving).orderBy(desc(schema.intWarpedBeamReceiving.id));

  const selected = isEditing ? list.find((r) => r.id === idParam) ?? null : null;
  const editing = isAdding ? null : selected;

  const lines = editing
    ? await db
        .select()
        .from(schema.intWarpedBeamReceivingLine)
        .where(eq(schema.intWarpedBeamReceivingLine.receivingId, editing.id))
        .orderBy(schema.intWarpedBeamReceivingLine.id)
    : [];

  const upcomingVNo = nextVNoFromRows(list, "IWB");
  const showForm = !!editing || isAdding;

  async function saveAction(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const header = {
      vDate: txt(formData.get("vDate")) ?? new Date().toISOString().slice(0, 10),
      time: txt(formData.get("time")),
      type: txt(formData.get("type")) ?? "SZG",
      gpNo: txt(formData.get("gpNo")),
      lvNo: intVal(formData.get("lvNo")),
      freightCharges: num(formData.get("freightCharges")),
      totalAmount: num(formData.get("totalAmount")),
      unPostedBills: txt(formData.get("unPostedBills")),
      billNo: txt(formData.get("billNo")),
      billDate: txt(formData.get("billDate")),
      billingStatus: txt(formData.get("billingStatus")),
      beamReceivingFrom: txt(formData.get("beamReceivingFrom")),
      beamStockLoaded: txt(formData.get("beamStockLoaded")),
      remarksDestination: txt(formData.get("remarksDestination")),
      sizingGpNo: txt(formData.get("sizingGpNo")),
      gpDate: txt(formData.get("gpDate")),
      resultCountSzg: txt(formData.get("resultCountSzg")),
      bmSaleParty: txt(formData.get("bmSaleParty")),
      gulley: num(formData.get("gulley")),
      emtBag: num(formData.get("emtBag")),
      shoper: num(formData.get("shoper")),
      waste: num(formData.get("waste")),
      gatta: num(formData.get("gatta")),
      headConeQty: num(formData.get("headConeQty")),
      headConeKgs: num(formData.get("headConeKgs")),
      bagsQty: num(formData.get("bagsQty")),
      bagsWeight: num(formData.get("bagsWeight")),
      conesQty: num(formData.get("conesQty")),
      conesWeight: num(formData.get("conesWeight")),
      gulleyWeight: num(formData.get("gulleyWeight")),
      emtBagWeight: num(formData.get("emtBagWeight")),
      shoperWeight: num(formData.get("shoperWeight")),
      wasteWeight: num(formData.get("wasteWeight")),
      gattaWeight: num(formData.get("gattaWeight")),
      totalAmountFinal: num(formData.get("totalAmountFinal")),
      gstFtx: num(formData.get("gstFtx")),
      netWeightRate: num(formData.get("netWeightRate")),
      amtTot: num(formData.get("amtTot")),
    };

    const rDates = formData.getAll("rDate") as string[];
    const yarnLotNos = formData.getAll("yarnLotNo") as string[];
    const yarnBrands = formData.getAll("yarnBrand") as string[];
    const setNos = formData.getAll("setNo") as string[];
    const beamSetNos = formData.getAll("beamSetNo") as string[];
    const beamNos = formData.getAll("beamNo") as string[];
    const beamStatuses = formData.getAll("beamStatus") as string[];
    const beamLoadedHnks = formData.getAll("beamLoadedHnk") as string[];
    const emptyKgs = formData.getAll("emptyKg") as string[];
    const yarnBmsNetLbss = formData.getAll("yarnBmsNetLbs") as string[];
    const beamLengths = formData.getAll("beamLength") as string[];
    const warpingCntNos = formData.getAll("warpingCntNo") as string[];
    const wts = formData.getAll("wt") as string[];
    const widths = formData.getAll("width") as string[];
    const endss = formData.getAll("ends") as string[];
    const rates = formData.getAll("rate") as string[];
    const lengths = formData.getAll("length") as string[];
    const convs = formData.getAll("conv") as string[];
    const amounts = formData.getAll("amount") as string[];
    const gpNoLines = formData.getAll("gpNoLine") as string[];

    const validLines: (typeof schema.intWarpedBeamReceivingLine.$inferInsert)[] = [];
    for (let i = 0; i < yarnLotNos.length; i++) {
      const row = {
        rDate: (rDates[i] || "").trim() || null,
        yarnLotNo: (yarnLotNos[i] || "").trim() || null,
        yarnBrand: (yarnBrands[i] || "").trim() || null,
        setNo: (setNos[i] || "").trim() || null,
        beamSetNo: (beamSetNos[i] || "").trim() || null,
        beamNo: (beamNos[i] || "").trim() || null,
        beamStatus: (beamStatuses[i] || "").trim() || null,
        beamLoadedHnk: num(beamLoadedHnks[i] ?? null),
        emptyKg: num(emptyKgs[i] ?? null),
        yarnBmsNetLbs: num(yarnBmsNetLbss[i] ?? null),
        beamLength: num(beamLengths[i] ?? null),
        warpingCntNo: (warpingCntNos[i] || "").trim() || null,
        wt: num(wts[i] ?? null),
        width: num(widths[i] ?? null),
        ends: intVal(endss[i] ?? null),
        rate: num(rates[i] ?? null),
        length: num(lengths[i] ?? null),
        conv: num(convs[i] ?? null),
        amount: num(amounts[i] ?? null),
        gpNoLine: (gpNoLines[i] || "").trim() || null,
      };
      const isEmpty =
        !row.rDate && !row.yarnLotNo && !row.yarnBrand && !row.setNo && !row.beamSetNo &&
        !row.beamNo && !row.beamStatus && row.beamLoadedHnk == null && row.emptyKg == null &&
        row.yarnBmsNetLbs == null && row.beamLength == null && !row.warpingCntNo && row.wt == null &&
        row.width == null && row.ends == null && row.rate == null && row.length == null &&
        row.conv == null && row.amount == null && !row.gpNoLine;
      if (isEmpty) continue;
      validLines.push({ ...row, receivingId: 0 });
    }

    const nowIso = new Date().toISOString();

    try {
      if (Number.isFinite(id) && id > 0) {
        await db.transaction(async (tx) => {
          await tx
            .update(schema.intWarpedBeamReceiving)
            .set({ ...header, modifiedDate: nowIso })
            .where(eq(schema.intWarpedBeamReceiving.id, id));
          await tx
            .delete(schema.intWarpedBeamReceivingLine)
            .where(eq(schema.intWarpedBeamReceivingLine.receivingId, id));
          if (validLines.length) {
            await tx
              .insert(schema.intWarpedBeamReceivingLine)
              .values(validLines.map((l) => ({ ...l, receivingId: id })));
          }
        });
        revalidatePath("/inventory/warped-beam");
        redirect(`/inventory/warped-beam?id=${id}`);
      } else {
        const providedVNo = ((formData.get("vNo") as string) || "").trim();
        const newId = await db.transaction(async (tx) => {
          const existing = await tx.select({ vNo: schema.intWarpedBeamReceiving.vNo }).from(schema.intWarpedBeamReceiving);
          const vNo = providedVNo || nextVNoFromRows(existing, "IWB");
          const inserted = await tx
            .insert(schema.intWarpedBeamReceiving)
            .values({ ...header, vNo, postedDate: nowIso })
            .returning({ id: schema.intWarpedBeamReceiving.id });
          const insertedId = inserted[0].id;
          if (validLines.length) {
            await tx
              .insert(schema.intWarpedBeamReceivingLine)
              .values(validLines.map((l) => ({ ...l, receivingId: insertedId })));
          }
          return insertedId;
        });
        revalidatePath("/inventory/warped-beam");
        redirect(`/inventory/warped-beam?id=${newId}`);
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "unknown";
      if (/UNIQUE|constraint/i.test(msg)) {
        redirect(`/inventory/warped-beam?error=code_exists`);
      }
      throw e;
    }
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.intWarpedBeamReceivingLine).where(eq(schema.intWarpedBeamReceivingLine.receivingId, id));
      await tx.delete(schema.intWarpedBeamReceiving).where(eq(schema.intWarpedBeamReceiving.id, id));
    });
    revalidatePath("/inventory/warped-beam");
    redirect(`/inventory/warped-beam`);
  }

  async function deleteBillAction(formData: FormData) {
    "use server";
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      await tx
        .update(schema.intWarpedBeamReceiving)
        .set({ billNo: null, billDate: null, billingStatus: null, delBill: "Y", modifiedDate: new Date().toISOString() })
        .where(eq(schema.intWarpedBeamReceiving.id, id));
    });
    revalidatePath("/inventory/warped-beam");
    redirect(`/inventory/warped-beam?id=${id}`);
  }

  const ROWS = Math.max(12, lines.length + 2);
  const gridCellCls = "input-box mono text-[11px]";
  const gridCellNumCls = "input-box mono text-[11px] text-right";
  const roCls = "input-box mono text-[13px] bg-gray-100";

  return (
    <Shell active="warped-beam">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">WARPED BEAM RECEIVING FROM EXTERNAL PARTIES (WVG)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {list.length} voucher{list.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={list.map((r) => ({
              vNo: r.vNo,
              vDate: r.vDate,
              type: r.type,
              gpNo: r.gpNo,
              beamReceivingFrom: r.beamReceivingFrom,
              billNo: r.billNo,
              totalAmount: r.totalAmount,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "type", label: "Type" },
              { key: "gpNo", label: "GP.No" },
              { key: "beamReceivingFrom", label: "Beam Receiving From" },
              { key: "billNo", label: "Bill No" },
              { key: "totalAmount", label: "Total Amount" },
            ]}
            filename="warped-beam-receiving"
            sheetName="WarpedBeamReceiving"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Voucher number already exists. Try again.
          </div>
        )}

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New — WARPED BEAM RECEIVING" : editing ? `Edit — ${editing.vNo}` : "WARPED BEAM RECEIVING"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/warped-beam?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="iwb-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              {editing && (
                <form action={deleteAction} className="inline">
                  <input type="hidden" name="id" value={editing.id} />
                  <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                </form>
              )}
              <a href="/inventory/warped-beam" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>

          {showForm && (
            <form id="iwb-save-form" action={saveAction}>
              {editing && <input type="hidden" name="id" value={editing.id} />}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Date</label>
                  <input name="vDate" type="date" className="input-box mono" defaultValue={editing?.vDate ?? today()} required />
                </div>
                <div className="lg:col-span-1">
                  <label className="label block mb-1">Time</label>
                  <input name="time" className="input-box mono" defaultValue={editing?.time ?? nowTime()} />
                </div>
                <div className="lg:col-span-1 flex items-end pb-1">
                  <button type="reset" form="iwb-save-form" className="btn btn-outline btn-sm w-full" title="Clear-OK">
                    Clear-OK
                  </button>
                </div>
                <div className="lg:col-span-1">
                  <label className="label block mb-1">Type</label>
                  <select name="type" className="input-box mono" defaultValue={editing?.type ?? "SZG"}>
                    <option value="SZG">SZG</option>
                    <option value="WRP">WRP</option>
                    <option value="WVG">WVG</option>
                    <option value="EXT">EXT</option>
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">GP.No</label>
                  <input name="gpNo" className="input-box mono" defaultValue={editing?.gpNo ?? ""} />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Freight Charges</label>
                  <input name="freightCharges" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.freightCharges ?? ""} />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">V.No</label>
                  <input name="vNo" className={roCls + " font-bold"} defaultValue={editing?.vNo ?? upcomingVNo} readOnly />
                </div>
                <div className="lg:col-span-1">
                  <label className="label block mb-1">LV.No</label>
                  <input name="lvNo" type="number" step="1" className={roCls} defaultValue={editing?.lvNo ?? ""} readOnly />
                </div>

                <div className="lg:col-span-3">
                  <label className="label block mb-1">Beam Receiving From</label>
                  <input name="beamReceivingFrom" className="input-box mono" defaultValue={editing?.beamReceivingFrom ?? ""} />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Beam Stock-Loaded</label>
                  <input name="beamStockLoaded" className="input-box mono" defaultValue={editing?.beamStockLoaded ?? ""} />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Total Amount</label>
                  <input name="totalAmount" type="number" step="any" className={roCls + " text-right"} defaultValue={editing?.totalAmount ?? ""} readOnly />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Posted</label>
                  <input className={roCls + " text-[12px]"} defaultValue={editing?.postedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Modified</label>
                  <input className={roCls + " text-[12px]"} defaultValue={editing?.modifiedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                </div>

                <div className="lg:col-span-3">
                  <label className="label block mb-1">Remarks/Destination</label>
                  <input name="remarksDestination" className="input-box mono" defaultValue={editing?.remarksDestination ?? ""} />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Un-Posted Bills</label>
                  <input name="unPostedBills" className="input-box mono" defaultValue={editing?.unPostedBills ?? ""} />
                </div>
                <div className="lg:col-span-2 flex items-end">
                  {editing ? (
                    <button
                      type="submit"
                      formAction={deleteBillAction}
                      className="btn btn-outline btn-sm w-full"
                      title="Delete Bill"
                    >
                      Del Bill
                    </button>
                  ) : (
                    <button type="button" disabled className="btn btn-outline btn-sm w-full opacity-50" title="Del Bill (select a voucher first)">
                      Del Bill
                    </button>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Bill No</label>
                  <input name="billNo" className="input-box mono" defaultValue={editing?.billNo ?? ""} />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Bill Date</label>
                  <input name="billDate" type="date" className="input-box mono" defaultValue={editing?.billDate ?? ""} />
                </div>
                <div className="lg:col-span-1">
                  <label className="label block mb-1">BILLING STAUTS</label>
                  <input name="billingStatus" className="input-box mono" defaultValue={editing?.billingStatus ?? ""} />
                </div>

                <div className="lg:col-span-3">
                  <label className="label block mb-1">Sizing GP.No</label>
                  <input name="sizingGpNo" className="input-box mono" defaultValue={editing?.sizingGpNo ?? ""} />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Gp.Date</label>
                  <input name="gpDate" type="date" className="input-box mono" defaultValue={editing?.gpDate ?? ""} />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Result Count SZG</label>
                  <input name="resultCountSzg" className="input-box mono" defaultValue={editing?.resultCountSzg ?? ""} />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Bm Sale Party</label>
                  <input name="bmSaleParty" className="input-box mono" defaultValue={editing?.bmSaleParty ?? ""} />
                </div>
              </div>

              <div className="mt-6 border border-black">
                <div className="overflow-x-auto">
                  <table style={{ minWidth: 1900 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>Sr#</th>
                        <th style={{ width: 100 }}>R.Date</th>
                        <th style={{ width: 100 }}>Yarn Lot No</th>
                        <th style={{ width: 90 }}>Yarn Brand</th>
                        <th style={{ width: 70 }}>Set No</th>
                        <th style={{ width: 80 }}>Beam Set No</th>
                        <th style={{ width: 70 }}>Beam No</th>
                        <th style={{ width: 80 }}>Beam Status</th>
                        <th style={{ width: 90 }} className="text-right">Beam Loadd (HR)</th>
                        <th style={{ width: 80 }} className="text-right">Empty (KG)</th>
                        <th style={{ width: 90 }} className="text-right">Yarn Bms Net LBS</th>
                        <th style={{ width: 90 }} className="text-right">Beam Length</th>
                        <th style={{ width: 90 }}>Warping cnt No</th>
                        <th style={{ width: 70 }} className="text-right">Wt</th>
                        <th style={{ width: 70 }} className="text-right">Width</th>
                        <th style={{ width: 70 }} className="text-right">Ends</th>
                        <th style={{ width: 70 }} className="text-right">Rate</th>
                        <th style={{ width: 80 }} className="text-right">Length</th>
                        <th style={{ width: 70 }} className="text-right">Conv</th>
                        <th style={{ width: 90 }} className="text-right">Amount</th>
                        <th style={{ width: 80 }}>GP NO</th>
                        <th style={{ width: 40 }}>Upd</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: ROWS }).map((_, i) => {
                        const l = lines[i];
                        return (
                          <tr key={i}>
                            <td className="mono text-[11px] text-center">{i + 1}</td>
                            <td><input name="rDate" type="date" className={gridCellCls} defaultValue={l?.rDate ?? ""} /></td>
                            <td><input name="yarnLotNo" className={gridCellCls} defaultValue={l?.yarnLotNo ?? ""} /></td>
                            <td><input name="yarnBrand" className={gridCellCls} defaultValue={l?.yarnBrand ?? ""} /></td>
                            <td><input name="setNo" className={gridCellCls} defaultValue={l?.setNo ?? ""} /></td>
                            <td><input name="beamSetNo" className={gridCellCls} defaultValue={l?.beamSetNo ?? ""} /></td>
                            <td><input name="beamNo" className={gridCellCls} defaultValue={l?.beamNo ?? ""} /></td>
                            <td><input name="beamStatus" className={gridCellCls} defaultValue={l?.beamStatus ?? ""} /></td>
                            <td><input name="beamLoadedHnk" type="number" step="any" className={gridCellNumCls} defaultValue={l?.beamLoadedHnk ?? ""} /></td>
                            <td><input name="emptyKg" type="number" step="any" className={gridCellNumCls} defaultValue={l?.emptyKg ?? ""} /></td>
                            <td><input name="yarnBmsNetLbs" type="number" step="any" className={gridCellNumCls} defaultValue={l?.yarnBmsNetLbs ?? ""} /></td>
                            <td><input name="beamLength" type="number" step="any" className={gridCellNumCls} defaultValue={l?.beamLength ?? ""} /></td>
                            <td><input name="warpingCntNo" className={gridCellCls} defaultValue={l?.warpingCntNo ?? ""} /></td>
                            <td><input name="wt" type="number" step="any" className={gridCellNumCls} defaultValue={l?.wt ?? ""} /></td>
                            <td><input name="width" type="number" step="any" className={gridCellNumCls} defaultValue={l?.width ?? ""} /></td>
                            <td><input name="ends" type="number" step="1" className={gridCellNumCls} defaultValue={l?.ends ?? ""} /></td>
                            <td><input name="rate" type="number" step="any" className={gridCellNumCls} defaultValue={l?.rate ?? ""} /></td>
                            <td><input name="length" type="number" step="any" className={gridCellNumCls} defaultValue={l?.length ?? ""} /></td>
                            <td><input name="conv" type="number" step="any" className={gridCellNumCls} defaultValue={l?.conv ?? ""} /></td>
                            <td><input name="amount" type="number" step="any" className={gridCellNumCls} defaultValue={l?.amount ?? ""} /></td>
                            <td><input name="gpNoLine" className={gridCellCls} defaultValue={l?.gpNoLine ?? ""} /></td>
                            <td className="mono text-[10px] text-center text-[var(--muted)]">X</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-2 px-2">
                  Empty rows are ignored on save. On update, lines are replaced with the current grid.
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-3 border border-black p-4">
                <div className="lg:col-span-3 border-r border-[var(--border-light)] pr-3">
                  <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">WT In Kgs / Total Kgs</div>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="text-[10px] font-semibold">Bags</div>
                    <div><label className="label block mb-1">Qty</label><input name="bagsQty" className="input-box mono text-right" type="number" step="any" defaultValue={editing?.bagsQty ?? ""} /></div>
                    <div><label className="label block mb-1">Kgs</label><input name="bagsWeight" className="input-box mono text-right" type="number" step="any" defaultValue={editing?.bagsWeight ?? ""} /></div>
                    <div className="text-[10px] font-semibold">Cones</div>
                    <div><input name="conesQty" className="input-box mono text-right" type="number" step="any" defaultValue={editing?.conesQty ?? ""} /></div>
                    <div><input name="conesWeight" className="input-box mono text-right" type="number" step="any" defaultValue={editing?.conesWeight ?? ""} /></div>
                  </div>
                </div>
                <div className="lg:col-span-3 border-r border-[var(--border-light)] pr-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="label block mb-1">Gulley</label><input name="gulley" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.gulley ?? ""} /></div>
                    <div><label className="label block mb-1">Weight</label><input name="gulleyWeight" className="input-box mono text-right" type="number" step="any" defaultValue={editing?.gulleyWeight ?? ""} /></div>
                    <div><label className="label block mb-1">Emt.Bag</label><input name="emtBag" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.emtBag ?? ""} /></div>
                    <div><label className="label block mb-1">Weight</label><input name="emtBagWeight" className="input-box mono text-right" type="number" step="any" defaultValue={editing?.emtBagWeight ?? ""} /></div>
                    <div><label className="label block mb-1">Shoper</label><input name="shoper" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.shoper ?? ""} /></div>
                    <div><label className="label block mb-1">Weight</label><input name="shoperWeight" className="input-box mono text-right" type="number" step="any" defaultValue={editing?.shoperWeight ?? ""} /></div>
                    <div><label className="label block mb-1">Waste</label><input name="waste" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.waste ?? ""} /></div>
                    <div><label className="label block mb-1">Weight</label><input name="wasteWeight" className="input-box mono text-right" type="number" step="any" defaultValue={editing?.wasteWeight ?? ""} /></div>
                    <div><label className="label block mb-1">Gatta</label><input name="gatta" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.gatta ?? ""} /></div>
                    <div><label className="label block mb-1">Weight</label><input name="gattaWeight" className="input-box mono text-right" type="number" step="any" defaultValue={editing?.gattaWeight ?? ""} /></div>
                    <div><label className="label block mb-1">Head Cone Qty</label><input name="headConeQty" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.headConeQty ?? ""} /></div>
                    <div><label className="label block mb-1">Kgs</label><input name="headConeKgs" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.headConeKgs ?? ""} /></div>
                  </div>
                </div>
                <div className="lg:col-span-6">
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="label block mb-1">Total Amount</label><input name="totalAmountFinal" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.totalAmountFinal ?? ""} /></div>
                    <div><label className="label block mb-1">Gst / Ftx</label><input name="gstFtx" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.gstFtx ?? ""} /></div>
                    <div><label className="label block mb-1">Net Weight Rate (Kg)</label><input name="netWeightRate" type="number" step="any" className="input-box mono text-right" defaultValue={editing?.netWeightRate ?? ""} /></div>
                    <div><label className="label block mb-1">Amt Tot</label><input name="amtTot" type="number" step="any" className="input-box mono text-right bg-green-50" defaultValue={editing?.amtTot ?? ""} /></div>
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                <button type="submit" className="btn btn-sm">Save</button>
                <a href="/inventory/warped-beam?adding=1" className="btn btn-outline btn-sm">New</a>
                <PrintButton />
                <a href="/inventory/warped-beam" className="btn btn-outline btn-sm">Exit</a>
                <div className="ml-auto flex items-end gap-4">
                  <div>
                    <label className="label block mb-1">Pswd</label>
                    <input className="input-box mono" placeholder="password" type="password" />
                  </div>
                  {editing && (
                    <form action={deleteAction} className="inline">
                      <input type="hidden" name="id" value={editing.id} />
                      <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                    </form>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="border border-black">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Vouchers</div>
            <form className="flex gap-2" method="GET" action="/inventory/warped-beam">
              <input name="find" className="input-box mono" defaultValue={params.find ?? ""} placeholder="Find V.No / Party / GP / Bill" />
              <button className="btn btn-outline btn-sm" type="submit">Find</button>
              {findFilter && <a href="/inventory/warped-beam" className="btn btn-outline btn-sm">Clear</a>}
            </form>
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>GP.No</th>
                  <th>Beam Receiving From</th>
                  <th>Bill No</th>
                  <th className="text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const isSel = r.id === selected?.id;
                  const href = `/inventory/warped-beam?id=${r.id}`;
                  const style = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={style}>{r.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.vDate}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.type}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.gpNo ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>{r.beamReceivingFrom ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.billNo ?? "-"}</a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{r.totalAmount ?? "-"}</a></td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-[13px] text-[var(--muted)] py-6">No vouchers. Click <b>New</b> above to create one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
