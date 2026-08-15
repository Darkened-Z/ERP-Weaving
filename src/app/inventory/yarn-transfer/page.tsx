import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { RowClearButton } from "@/components/row-clear-button";
import { db, schema } from "@/db";
import { desc, eq, sql } from "drizzle-orm";
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
const nowHm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default async function YarnTransferPage({
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
        .from(schema.intYarnTransfer)
        .where(sql`
          ${schema.intYarnTransfer.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnTransfer.transferFromParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnTransfer.transferToParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnTransfer.countCode} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intYarnTransfer.id))
    : await db.select().from(schema.intYarnTransfer).orderBy(desc(schema.intYarnTransfer.id));

  const selected = isEditing ? list.find((r) => r.id === idParam) ?? null : null;
  const editing = isAdding ? null : selected;

  const lines = editing
    ? await db
        .select()
        .from(schema.intYarnTransferLine)
        .where(eq(schema.intYarnTransferLine.transferId, editing.id))
        .orderBy(schema.intYarnTransferLine.srNo)
    : [];

  const maxRow = await db
    .select({
      maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intYarnTransfer.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.intYarnTransfer)
    .where(sql`${schema.intYarnTransfer.vNo} LIKE 'IYT-%'`);
  const nextNum = (maxRow[0]?.maxNum ?? 0) + 1;
  const upcomingVNo = `IYT-${String(nextNum).padStart(4, "0")}`;

  async function saveAction(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const header = {
      vDate: txt(formData.get("vDate")) ?? new Date().toISOString().slice(0, 10),
      type: txt(formData.get("type")),
      time: txt(formData.get("time")),
      lvNo: intVal(formData.get("lvNo")),
      condition: txt(formData.get("condition")) ?? "FRS",
      transferFromParty: txt(formData.get("transferFromParty")),
      locationFrom: txt(formData.get("locationFrom")),
      transferToParty: txt(formData.get("transferToParty")),
      locationTo: txt(formData.get("locationTo")),
      stockBag: num(formData.get("stockBag")),
      stockLbs: num(formData.get("stockLbs")),
      countCode: txt(formData.get("countCode")),
      qtyBags: num(formData.get("qtyBags")),
      qtyLbs: num(formData.get("qtyLbs")),
      amount: num(formData.get("amount")),
      ratePerLbs: num(formData.get("ratePerLbs")),
      brand: txt(formData.get("brand")),
      yarnLotNo: txt(formData.get("yarnLotNo")),
      setNo: txt(formData.get("setNo")),
      imgBlock: txt(formData.get("imgBlock")),
      remarks: txt(formData.get("remarks")),
      rkd: num(formData.get("rkd")),
    };

    const cartonNos = formData.getAll("cartonNo") as string[];
    const grossKgsArr = formData.getAll("grossKgs") as string[];
    const netKgsArr = formData.getAll("netKgs") as string[];
    const netLbsArr = formData.getAll("netLbs") as string[];

    const validLines: {
      srNo: number;
      cartonNo: string | null;
      grossKgs: number | null;
      netKgs: number | null;
      netLbs: number | null;
    }[] = [];
    for (let i = 0; i < cartonNos.length; i++) {
      const cn = (cartonNos[i] || "").trim();
      const gk = num(grossKgsArr[i]);
      const nk = num(netKgsArr[i]);
      const nl = num(netLbsArr[i]);
      if (!cn && gk == null && nk == null && nl == null) continue;
      validLines.push({
        srNo: validLines.length + 1,
        cartonNo: cn || null,
        grossKgs: gk,
        netKgs: nk,
        netLbs: nl,
      });
    }

    const nowIso = new Date().toISOString();

    try {
      if (Number.isFinite(id) && id > 0) {
        await db.transaction(async (tx) => {
          await tx
            .update(schema.intYarnTransfer)
            .set({ ...header, modifiedDate: nowIso })
            .where(eq(schema.intYarnTransfer.id, id));
          await tx
            .delete(schema.intYarnTransferLine)
            .where(eq(schema.intYarnTransferLine.transferId, id));
          if (validLines.length) {
            await tx
              .insert(schema.intYarnTransferLine)
              .values(validLines.map((l) => ({ ...l, transferId: id })));
          }
        });
        revalidatePath("/inventory/yarn-transfer");
        redirect(`/inventory/yarn-transfer?id=${id}`);
      } else {
        const providedVNo = ((formData.get("vNo") as string) || "").trim();
        const newId = await db.transaction(async (tx) => {
          let vNo = providedVNo;
          if (!vNo) {
            const maxRes = await tx
              .select({
                maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intYarnTransfer.vNo}, 5) AS INTEGER)), 0)`,
              })
              .from(schema.intYarnTransfer)
              .where(sql`${schema.intYarnTransfer.vNo} LIKE 'IYT-%'`);
            const n = (maxRes[0]?.maxNum ?? 0) + 1;
            vNo = `IYT-${String(n).padStart(4, "0")}`;
          }
          const inserted = await tx
            .insert(schema.intYarnTransfer)
            .values({ ...header, vNo, postedDate: nowIso })
            .returning({ id: schema.intYarnTransfer.id });
          const insertedId = inserted[0].id;
          if (validLines.length) {
            await tx
              .insert(schema.intYarnTransferLine)
              .values(validLines.map((l) => ({ ...l, transferId: insertedId })));
          }
          return insertedId;
        });
        revalidatePath("/inventory/yarn-transfer");
        redirect(`/inventory/yarn-transfer?id=${newId}`);
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "unknown";
      if (/UNIQUE|constraint/i.test(msg)) {
        redirect(`/inventory/yarn-transfer?error=code_exists`);
      }
      throw e;
    }
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.intYarnTransferLine).where(eq(schema.intYarnTransferLine.transferId, id));
      await tx.delete(schema.intYarnTransfer).where(eq(schema.intYarnTransfer.id, id));
    });
    revalidatePath("/inventory/yarn-transfer");
    redirect(`/inventory/yarn-transfer`);
  }

  const ROWS = Math.max(18, lines.length + 3);
  const showForm = !!editing || isAdding;

  return (
    <Shell active="yarn-transfer">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">YARN INTERNAL TRANSFER ( WVG )</h1>
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
              condition: r.condition,
              transferFromParty: r.transferFromParty,
              locationFrom: r.locationFrom,
              transferToParty: r.transferToParty,
              locationTo: r.locationTo,
              countCode: r.countCode,
              qtyBags: r.qtyBags,
              qtyLbs: r.qtyLbs,
              ratePerLbs: r.ratePerLbs,
              amount: r.amount,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "type", label: "Type" },
              { key: "condition", label: "Condition" },
              { key: "transferFromParty", label: "Transfer From (-)" },
              { key: "locationFrom", label: "Location From" },
              { key: "transferToParty", label: "Transfer To (+)" },
              { key: "locationTo", label: "Location To" },
              { key: "countCode", label: "Count" },
              { key: "qtyBags", label: "Qty Bags" },
              { key: "qtyLbs", label: "Qty Lbs" },
              { key: "ratePerLbs", label: "Rate/Lbs" },
              { key: "amount", label: "Amount" },
            ]}
            filename="yarn-transfer"
            sheetName="YarnTransfer"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Voucher number already exists. Try again.
          </div>
        )}

        <form id="iyt-find-form" method="GET" action="/inventory/yarn-transfer" className="hidden" />

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New — YARN INTERNAL TRANSFER" : editing ? `Edit — ${editing.vNo}` : "YARN INTERNAL TRANSFER"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/yarn-transfer?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="iyt-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              {editing && (
                <form action={deleteAction} className="inline">
                  <input type="hidden" name="id" value={editing.id} />
                  <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                </form>
              )}
              <a href="/inventory/yarn-transfer" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>

          {showForm && (
            <form id="iyt-save-form" action={saveAction}>
              {editing && <input type="hidden" name="id" value={editing.id} />}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">

                  <div className="border border-black p-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Date</label>
                        <input name="vDate" type="date" className="input-box mono" defaultValue={editing?.vDate ?? today()} required />
                      </div>
                      <div className="md:col-span-2">
                        <label className="label block mb-1">Type</label>
                        <select name="type" className="input-box mono" defaultValue={editing?.type ?? ""}>
                          <option value=""></option>
                          <option value="INT">INT</option>
                          <option value="EXT">EXT</option>
                          <option value="ADJ">ADJ</option>
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="label block mb-1">No.</label>
                        <input name="vNo" className="input-box mono bg-gray-100" defaultValue={editing?.vNo ?? upcomingVNo} readOnly />
                      </div>
                      <div className="md:col-span-2">
                        <label className="label block mb-1">LV.No</label>
                        <input name="lvNo" type="number" step="1" className="input-box mono bg-gray-100" defaultValue={editing?.lvNo ?? ""} readOnly />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Modified</label>
                        <input className="input-box mono bg-gray-100 text-[12px]" defaultValue={editing?.modifiedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                      </div>

                      <div className="md:col-span-3">
                        <label className="label block mb-1">Condition</label>
                        <select name="condition" className="input-box mono" defaultValue={editing?.condition ?? "FRS"}>
                          <option value="FRS">FRS</option>
                          <option value="OLD">OLD</option>
                          <option value="REJ">REJ</option>
                        </select>
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Time</label>
                        <input name="time" className="input-box mono" defaultValue={editing?.time ?? nowHm()} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Posted</label>
                        <input className="input-box mono bg-gray-100 text-[12px]" defaultValue={editing?.postedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">TRANSFER FROM ( - )</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
                      <div className="md:col-span-12">
                        <label className="label block mb-1">Transfer From (Party)</label>
                        <input name="transferFromParty" className="input-box" defaultValue={editing?.transferFromParty ?? ""} />
                      </div>
                      <div className="md:col-span-9">
                        <label className="label block mb-1">Location From (GDN)</label>
                        <input name="locationFrom" className="input-box mono" defaultValue={editing?.locationFrom ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Time</label>
                        <input className="input-box mono" defaultValue={nowHm()} readOnly tabIndex={-1} />
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">TRANSFER TO ( + )</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
                      <div className="md:col-span-12">
                        <label className="label block mb-1">Transfer To (Party)</label>
                        <input name="transferToParty" className="input-box" defaultValue={editing?.transferToParty ?? ""} />
                      </div>
                      <div className="md:col-span-9">
                        <label className="label block mb-1">Location To (GDN)</label>
                        <input name="locationTo" className="input-box mono" defaultValue={editing?.locationTo ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Time</label>
                        <input className="input-box mono" defaultValue={nowHm()} readOnly tabIndex={-1} />
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">COUNT-DETAIL</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Stock Bags</label>
                        <input name="stockBag" type="number" step="0.01" className="input-box mono bg-gray-100 text-right" defaultValue={editing?.stockBag ?? ""} readOnly />
                      </div>
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Stock Lbs</label>
                        <input name="stockLbs" type="number" step="0.01" className="input-box mono bg-gray-100 text-right" defaultValue={editing?.stockLbs ?? ""} readOnly />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">Count Code (F9)</label>
                        <input name="countCode" className="input-box mono" defaultValue={editing?.countCode ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Qty Bags</label>
                        <input name="qtyBags" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.qtyBags ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Qty Lbs</label>
                        <input name="qtyLbs" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.qtyLbs ?? ""} />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">Rate / Lbs</label>
                        <input name="ratePerLbs" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.ratePerLbs ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Amount</label>
                        <input name="amount" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.amount ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Brand</label>
                        <input name="brand" className="input-box mono" defaultValue={editing?.brand ?? ""} />
                      </div>

                      <div className="md:col-span-6">
                        <label className="label block mb-1">Yarn Lot # (F9)</label>
                        <input name="yarnLotNo" className="input-box mono" defaultValue={editing?.yarnLotNo ?? ""} />
                      </div>
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Set No.</label>
                        <input name="setNo" className="input-box mono" defaultValue={editing?.setNo ?? ""} />
                      </div>

                      <div className="md:col-span-12">
                        <label className="label block mb-1">Imag Block</label>
                        <div className="flex items-stretch gap-1">
                          <input name="imgBlock" className="input-box mono flex-1" defaultValue={editing?.imgBlock ?? ""} placeholder="filename" />
                          <button type="button" disabled title="Coming soon" className="btn btn-outline btn-sm opacity-50" style={{ padding: "4px 8px" }}>Brows</button>
                          <button type="button" disabled title="Coming soon" className="btn btn-outline btn-sm opacity-50" style={{ padding: "4px 8px" }}>Pic</button>
                          <button type="button" disabled title="Coming soon" className="btn btn-outline btn-sm opacity-50" style={{ padding: "4px 8px" }}>UPD</button>
                        </div>
                      </div>

                      <div className="md:col-span-12">
                        <label className="label block mb-1">Remarks (R.K.D-)</label>
                        <input name="remarks" className="input-box" defaultValue={editing?.remarks ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">R.K.D</label>
                        <input name="rkd" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.rkd ?? ""} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4">
                  <div className="border border-black">
                    <div className="overflow-x-auto" style={{ maxHeight: "72vh", overflowY: "auto" }}>
                      <table>
                        <thead>
                          <tr>
                            <th style={{ width: "44px" }}>Sr.#</th>
                            <th>Carton No</th>
                            <th className="text-right">Gross Kgs</th>
                            <th className="text-right">Net Kgs</th>
                            <th className="text-right">Net Lbs</th>
                            <th style={{ width: "22px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: ROWS }).map((_, i) => {
                            const l = lines[i];
                            return (
                              <tr key={i}>
                                <td className="mono text-[12px] text-center">{i + 1}</td>
                                <td><input name="cartonNo" className="input-box mono text-[12px]" defaultValue={l?.cartonNo ?? ""} /></td>
                                <td><input name="grossKgs" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={l?.grossKgs ?? ""} /></td>
                                <td><input name="netKgs" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={l?.netKgs ?? ""} /></td>
                                <td><input name="netLbs" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={l?.netLbs ?? ""} /></td>
                                <td className="text-center"><RowClearButton /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-[10px] text-[var(--muted)] p-2 border-t border-black">
                      Empty rows are ignored on save. Grid replaces on update.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                <button type="submit" className="btn btn-sm">Save</button>
                <a href="/inventory/yarn-transfer" className="btn btn-outline btn-sm">Exit</a>
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
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Vouchers</div>
            <form className="flex gap-2" id="find-form" method="GET" action="/inventory/yarn-transfer">
              <input name="find" className="input-box mono" defaultValue={params.find ?? ""} placeholder="Find V.No / Party / Count" />
              <button className="btn btn-outline btn-sm" type="submit">Find</button>
            </form>
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>V.Date</th>
                  <th>Type</th>
                  <th>Cond</th>
                  <th>Transfer From (-)</th>
                  <th>Transfer To (+)</th>
                  <th>Count</th>
                  <th className="text-right">Qty Bags</th>
                  <th className="text-right">Qty Lbs</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const isSel = r.id === selected?.id;
                  const href = `/inventory/yarn-transfer?id=${r.id}`;
                  const style = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={style}>{r.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.vDate}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.type ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.condition ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>{r.transferFromParty ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>{r.transferToParty ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.countCode ?? "-"}</a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{r.qtyBags ?? "-"}</a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{r.qtyLbs ?? "-"}</a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{r.amount ?? "-"}</a></td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={10} className="text-center text-[13px] text-[var(--muted)] py-6">No vouchers. Click <b>New</b> above to create one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
