import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { WhatsAppModal } from "@/components/whatsapp-modal";
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
const nowTime = () => new Date().toISOString().slice(11, 16);

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

const LINE_ROWS = 15;
const COUNT_ROWS = 5;

export default async function GreyDespatchPage({
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

  const lineGrid = Array.from({ length: LINE_ROWS }, (_, i) => lineRows[i] ?? null);
  const countGrid = Array.from({ length: COUNT_ROWS }, (_, i) => countRows[i] ?? null);

  const meterSums = await db
    .select({
      despatchId: schema.intGreyDespatchLine.despatchId,
      meters: sql<number>`coalesce(sum(${schema.intGreyDespatchLine.lengthMtrs}), 0)`,
    })
    .from(schema.intGreyDespatchLine)
    .groupBy(schema.intGreyDespatchLine.despatchId);
  const metersById = new Map(meterSums.map((m) => [m.despatchId, m.meters]));

  const upcomingVNo = nextVNoFromRows(despatches, "IGD");
  const upcomingLNo = despatches.length + 1;

  async function saveDespatch(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const isUpdate = Number.isFinite(id) && id > 0;

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
      amnt: num(formData.get("amnt")),
      gst: num(formData.get("gst")),
      further: num(formData.get("further")),
      gpNo: txt(formData.get("gp_no")),
      gpDate: txt(formData.get("gp_date")),
      dateFrom: txt(formData.get("date_from")),
      dateTo: txt(formData.get("date_to")),
      amtTot: num(formData.get("amt_tot")),
      ftWeave: txt(formData.get("ft_weave")),
      designNo: txt(formData.get("design_no")),
      encCode: txt(formData.get("enc_code")),
      supervisor: txt(formData.get("supervisor")),
      vehicleNo: txt(formData.get("vehicle_no")),
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

    let uniqueError = false;
    let savedId: number | null = null;

    try {
      savedId = await db.transaction(async (tx) => {
        let did: number;
        if (isUpdate) {
          await tx.update(schema.intGreyDespatch).set(data).where(eq(schema.intGreyDespatch.id, id));
          did = id;
          await tx.delete(schema.intGreyDespatchLine).where(eq(schema.intGreyDespatchLine.despatchId, did));
          await tx.delete(schema.intGreyDespatchUpdateCount).where(eq(schema.intGreyDespatchUpdateCount.despatchId, did));
        } else {
          const existing = await tx.select({ vNo: schema.intGreyDespatch.vNo }).from(schema.intGreyDespatch);
          const providedVNo = txt(formData.get("v_no"));
          const vNo = providedVNo ?? nextVNoFromRows(existing, "IGD");
          const [ins] = await tx
            .insert(schema.intGreyDespatch)
            .values({
              ...data,
              vNo,
              lNo: data.lNo ?? existing.length + 1,
              postedDate: new Date().toISOString(),
            })
            .returning({ id: schema.intGreyDespatch.id });
          did = ins.id;
        }

        const lineValues: (typeof schema.intGreyDespatchLine.$inferInsert)[] = [];
        for (let i = 1; i <= LINE_ROWS; i++) {
          const tSrNo = intVal(formData.get(`line_t_sr_${i}`));
          const a = num(formData.get(`line_a_${i}`));
          const b = num(formData.get(`line_b_${i}`));
          const c = num(formData.get(`line_c_${i}`));
          const cp = num(formData.get(`line_cp_${i}`));
          const rej = num(formData.get(`line_rej_${i}`));
          const lengthMtrs = num(formData.get(`line_len_${i}`));
          if (
            tSrNo !== null ||
            a !== null ||
            b !== null ||
            c !== null ||
            cp !== null ||
            rej !== null ||
            lengthMtrs !== null
          ) {
            lineValues.push({
              despatchId: did,
              srNo: i,
              tSrNo,
              a,
              b,
              c,
              cp,
              rej,
              cpRej: cp != null || rej != null ? (cp ?? 0) + (rej ?? 0) : null,
              lengthMtrs,
            });
          }
        }
        if (lineValues.length) await tx.insert(schema.intGreyDespatchLine).values(lineValues);

        const countValues: (typeof schema.intGreyDespatchUpdateCount.$inferInsert)[] = [];
        for (let i = 1; i <= COUNT_ROWS; i++) {
          const countCode = txt(formData.get(`uc_code_${i}`));
          const countDescription = txt(formData.get(`uc_desc_${i}`));
          const type = txt(formData.get(`uc_type_${i}`));
          const calCount = num(formData.get(`uc_cal_${i}`));
          const ends = intVal(formData.get(`uc_ends_${i}`));
          const ratePerLbs = num(formData.get(`uc_rate_${i}`));
          const wtPerMtr = num(formData.get(`uc_wt_${i}`));
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
              totLbs,
              amount,
              typeRej,
            });
          }
        }
        if (countValues.length) await tx.insert(schema.intGreyDespatchUpdateCount).values(countValues);

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
  }

  async function deleteDespatch(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
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

  const gCls = "input-box mono text-[11px]";
  const gCellNum = "input-box mono text-[11px] text-right";

  return (
    <Shell active="grey-despatch">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-6">
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

        <form id="gd-find-form" method="GET" action="/inventory/grey-despatch" className="hidden"></form>

        <div className="border border-black p-5 mb-6">
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
              {formItem && (
                <form action={deleteDespatch} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                </form>
              )}
            </div>
          </div>

          <form id="gd-save-form" action={saveDespatch}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}

            <div className="grid grid-cols-12 gap-3 mb-4">
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
                <input name="l_no" type="number" className="input-box mono bg-gray-100 text-center" defaultValue={formItem?.lNo ?? upcomingLNo} readOnly />
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

            <div className="border border-black p-3 mb-4 bg-gray-50">
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

            <div className="grid grid-cols-12 gap-4 mb-4">
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
                              <input name={`line_t_sr_${i}`} type="number" step="1" className={gCls} defaultValue={r?.tSrNo ?? ""} />
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
                    <input name="conv_cont_no" className="input-box mono text-[12px]" defaultValue={formItem?.convContNo ?? ""} />
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
                    <input name="shed_no" className="input-box mono text-[12px]" defaultValue={formItem?.shedNo ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label block mb-1">Party</label>
                    <input name="party" className="input-box mono text-[12px]" defaultValue={formItem?.party ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Do Party</label>
                    <input name="do_party" className="input-box mono text-[12px]" defaultValue={formItem?.doParty ?? ""} />
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
                    <input name="amnt" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue={formItem?.amnt ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">GST</label>
                    <input name="gst" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue={formItem?.gst ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="label block mb-1">Further</label>
                    <input name="further" type="number" step="any" className="input-box mono text-right text-[12px]" defaultValue={formItem?.further ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">GP No</label>
                    <input name="gp_no" className="input-box mono text-[12px]" defaultValue={formItem?.gpNo ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">GP Date</label>
                    <input name="gp_date" type="date" className="input-box mono text-[12px]" defaultValue={formItem?.gpDate ?? ""} />
                  </div>
                  <div>
                    <label className="label block mb-1">Amt Tot</label>
                    <input name="amt_tot" type="number" step="any" className="input-box mono text-right text-[12px] bg-red-50" defaultValue={formItem?.amtTot ?? ""} />
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

            <div className="grid grid-cols-12 gap-3 mb-4">
              <div className="col-span-2">
                <label className="label block mb-1">F.T Weave</label>
                <input name="ft_weave" className="input-box mono text-[12px]" defaultValue={formItem?.ftWeave ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Design No</label>
                <input name="design_no" className="input-box mono text-[12px]" defaultValue={formItem?.designNo ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">
                  Enc Code <span className="text-[9px] text-[var(--muted)]">F9</span>
                </label>
                <input name="enc_code" className="input-box mono text-[12px]" defaultValue={formItem?.encCode ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Supervisor</label>
                <input name="supervisor" className="input-box mono text-[12px]" defaultValue={formItem?.supervisor ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Vehicle No</label>
                <input name="vehicle_no" className="input-box mono text-[12px]" defaultValue={formItem?.vehicleNo ?? ""} />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Trans Adda</label>
                <input name="trans_adda" className="input-box mono text-[12px]" defaultValue={formItem?.transAdda ?? ""} />
              </div>

              <div className="col-span-3">
                <label className="label block mb-1">Silvag Quality</label>
                <input name="silvag_quality" className="input-box mono text-[12px]" defaultValue={formItem?.silvagQuality ?? ""} />
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
                <input name="product_brand" className="input-box mono text-[12px]" defaultValue={formItem?.productBrand ?? ""} />
              </div>

              <div className="col-span-3">
                <label className="label block mb-1">Loom Type</label>
                <input name="loom_type" className="input-box mono text-[12px]" defaultValue={formItem?.loomType ?? ""} />
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Blend</label>
                <input name="blend" className="input-box mono text-[12px]" defaultValue={formItem?.blend ?? ""} />
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Gray Code</label>
                <input name="grey_code" className="input-box mono text-[12px]" defaultValue={formItem?.greyCode ?? ""} />
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
                            <input name={`uc_code_${i}`} className={gCls} defaultValue={r?.countCode ?? ""} />
                          </td>
                          <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                            <input name={`uc_desc_${i}`} className={gCls} defaultValue={r?.countDescription ?? ""} />
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
                            <input name={`uc_tot_${i}`} type="number" step="any" className={gCellNum} defaultValue={r?.totLbs ?? ""} />
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
                {formItem && (
                  <form action={deleteDespatch} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                  </form>
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
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{d.party ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{d.doParty ?? "-"}</a></td>
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
