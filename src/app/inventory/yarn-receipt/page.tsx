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

export default async function YarnReceiptPage({
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
        .from(schema.intYarnReceipt)
        .where(sql`
          ${schema.intYarnReceipt.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnReceipt.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnReceipt.yarnPartyTo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnReceipt.countCode} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intYarnReceipt.id))
    : await db.select().from(schema.intYarnReceipt).orderBy(desc(schema.intYarnReceipt.id));

  const selected = isEditing ? list.find((r) => r.id === idParam) ?? null : null;
  const editing = isAdding ? null : selected;

  const lines = editing
    ? await db
        .select()
        .from(schema.intYarnReceiptLine)
        .where(eq(schema.intYarnReceiptLine.receiptId, editing.id))
        .orderBy(schema.intYarnReceiptLine.srNo)
    : [];

  const maxRow = await db
    .select({
      maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intYarnReceipt.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.intYarnReceipt)
    .where(sql`${schema.intYarnReceipt.vNo} LIKE 'IYR-%'`);
  const nextNum = (maxRow[0]?.maxNum ?? 0) + 1;
  const upcomingVNo = `IYR-${String(nextNum).padStart(4, "0")}`;

  async function saveAction(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const header = {
      vDate: txt(formData.get("vDate")) ?? new Date().toISOString().slice(0, 10),
      time: txt(formData.get("time")),
      bookDoBiltyNo: txt(formData.get("bookDoBiltyNo")),
      doDate: txt(formData.get("doDate")),
      lgpNo: txt(formData.get("lgpNo")),
      gpDate: txt(formData.get("gpDate")),
      party: txt(formData.get("party")),
      trnType: txt(formData.get("trnType")),
      condition: txt(formData.get("condition")) ?? "FRS",
      lvNo: intVal(formData.get("lvNo")),
      convContNo: txt(formData.get("convContNo")),
      purContNo: txt(formData.get("purContNo")),
      yarnPartyTo: txt(formData.get("yarnPartyTo")),
      timeTo: txt(formData.get("timeTo")),
      ratePerLbsTo: num(formData.get("ratePerLbsTo")),
      amount: num(formData.get("amount")),
      locationFrom: txt(formData.get("locationFrom")),
      imgBlock: txt(formData.get("imgBlock")),
      stockBag: num(formData.get("stockBag")),
      stockLbs: num(formData.get("stockLbs")),
      countCode: txt(formData.get("countCode")),
      warp: txt(formData.get("warp")),
      weft: txt(formData.get("weft")),
      bags: num(formData.get("bags")),
      qtyLbs: num(formData.get("qtyLbs")),
      ratePerLbs: num(formData.get("ratePerLbs")),
      brand: txt(formData.get("brand")),
      yarnLotNo: txt(formData.get("yarnLotNo")),
      setNo: txt(formData.get("setNo")),
      ratioText: txt(formData.get("ratioText")),
      remarks: txt(formData.get("remarks")),
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
            .update(schema.intYarnReceipt)
            .set({ ...header, modifiedDate: nowIso })
            .where(eq(schema.intYarnReceipt.id, id));
          await tx
            .delete(schema.intYarnReceiptLine)
            .where(eq(schema.intYarnReceiptLine.receiptId, id));
          if (validLines.length) {
            await tx
              .insert(schema.intYarnReceiptLine)
              .values(validLines.map((l) => ({ ...l, receiptId: id })));
          }
        });
        revalidatePath("/inventory/yarn-receipt");
        redirect(`/inventory/yarn-receipt?id=${id}`);
      } else {
        const providedVNo = ((formData.get("vNo") as string) || "").trim();
        const newId = await db.transaction(async (tx) => {
          let vNo = providedVNo;
          if (!vNo) {
            const maxRes = await tx
              .select({
                maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTR(${schema.intYarnReceipt.vNo}, 5) AS INTEGER)), 0)`,
              })
              .from(schema.intYarnReceipt)
              .where(sql`${schema.intYarnReceipt.vNo} LIKE 'IYR-%'`);
            const n = (maxRes[0]?.maxNum ?? 0) + 1;
            vNo = `IYR-${String(n).padStart(4, "0")}`;
          }
          const inserted = await tx
            .insert(schema.intYarnReceipt)
            .values({ ...header, vNo, postedDate: nowIso })
            .returning({ id: schema.intYarnReceipt.id });
          const insertedId = inserted[0].id;
          if (validLines.length) {
            await tx
              .insert(schema.intYarnReceiptLine)
              .values(validLines.map((l) => ({ ...l, receiptId: insertedId })));
          }
          return insertedId;
        });
        revalidatePath("/inventory/yarn-receipt");
        redirect(`/inventory/yarn-receipt?id=${newId}`);
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "unknown";
      if (/UNIQUE|constraint/i.test(msg)) {
        redirect(`/inventory/yarn-receipt?error=code_exists`);
      }
      throw e;
    }
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.intYarnReceiptLine).where(eq(schema.intYarnReceiptLine.receiptId, id));
      await tx.delete(schema.intYarnReceipt).where(eq(schema.intYarnReceipt.id, id));
    });
    revalidatePath("/inventory/yarn-receipt");
    redirect(`/inventory/yarn-receipt`);
  }

  const ROWS = Math.max(18, lines.length + 3);
  const showForm = !!editing || isAdding;

  return (
    <Shell active="yarn-receipt">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">YARN RECEIPT/RETURN ( WVG )</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {list.length} voucher{list.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={list.map((r) => ({
              vNo: r.vNo,
              vDate: r.vDate,
              trnType: r.trnType,
              condition: r.condition,
              party: r.party,
              yarnPartyTo: r.yarnPartyTo,
              countCode: r.countCode,
              bags: r.bags,
              qtyLbs: r.qtyLbs,
              ratePerLbs: r.ratePerLbs,
              amount: r.amount,
              purContNo: r.purContNo,
              convContNo: r.convContNo,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "trnType", label: "Trn Type" },
              { key: "condition", label: "Condition" },
              { key: "party", label: "Party" },
              { key: "yarnPartyTo", label: "Yarn Party To" },
              { key: "countCode", label: "Count Code" },
              { key: "bags", label: "Bags" },
              { key: "qtyLbs", label: "Qty Lbs" },
              { key: "ratePerLbs", label: "Rate/Lbs" },
              { key: "amount", label: "Amount" },
              { key: "purContNo", label: "Pur Cont No" },
              { key: "convContNo", label: "Conv Cont No" },
            ]}
            filename="yarn-receipt"
            sheetName="YarnReceipt"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Voucher number already exists. Try again.
          </div>
        )}

        <form id="iyr-find-form" method="GET" action="/inventory/yarn-receipt" className="hidden" />

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New — YARN RECEIPT/RETURN" : editing ? `Edit — ${editing.vNo}` : "YARN RECEIPT/RETURN"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/yarn-receipt?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="iyr-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              {editing && (
                <form action={deleteAction} className="inline">
                  <input type="hidden" name="id" value={editing.id} />
                  <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                </form>
              )}
              <a href="/inventory/yarn-receipt" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>

          {showForm && (
            <form id="iyr-save-form" action={saveAction}>
              {editing && <input type="hidden" name="id" value={editing.id} />}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-6">

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">DELIVERED FROM</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Date</label>
                        <input name="vDate" type="date" className="input-box mono" defaultValue={editing?.vDate ?? today()} required />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">No.</label>
                        <input name="vNo" className="input-box mono bg-gray-100" defaultValue={editing?.vNo ?? upcomingVNo} readOnly />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">LV.No</label>
                        <input name="lvNo" type="number" step="1" className="input-box mono bg-gray-100" defaultValue={editing?.lvNo ?? ""} readOnly />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Time</label>
                        <input name="time" className="input-box mono" defaultValue={editing?.time ?? nowHm()} />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">Book.DO/Bilty No.</label>
                        <input name="bookDoBiltyNo" className="input-box mono" defaultValue={editing?.bookDoBiltyNo ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">DO Date</label>
                        <input name="doDate" type="date" className="input-box mono" defaultValue={editing?.doDate ?? ""} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="label block mb-1">Posted</label>
                        <input className="input-box mono bg-gray-100 text-[12px]" defaultValue={editing?.postedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="label block mb-1">Modified</label>
                        <input className="input-box mono bg-gray-100 text-[12px]" defaultValue={editing?.modifiedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">LGP No.</label>
                        <input name="lgpNo" className="input-box mono" defaultValue={editing?.lgpNo ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">GP Date</label>
                        <input name="gpDate" type="date" className="input-box mono" defaultValue={editing?.gpDate ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Trn. Type</label>
                        <select name="trnType" className="input-box mono" defaultValue={editing?.trnType ?? ""}>
                          <option value=""></option>
                          <option value="RCPT">RCPT</option>
                          <option value="RETN">RETN</option>
                          <option value="PUR">PUR</option>
                          <option value="CONV">CONV</option>
                        </select>
                      </div>

                      <div className="md:col-span-8">
                        <label className="label block mb-1">Party</label>
                        <input name="party" className="input-box" defaultValue={editing?.party ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Condition</label>
                        <select name="condition" className="input-box mono" defaultValue={editing?.condition ?? "FRS"}>
                          <option value="FRS">FRS</option>
                          <option value="OLD">OLD</option>
                          <option value="REJ">REJ</option>
                        </select>
                      </div>

                      <div className="md:col-span-6">
                        <label className="label block mb-1">Conv.Cont No (F9)</label>
                        <input name="convContNo" className="input-box mono" defaultValue={editing?.convContNo ?? ""} />
                      </div>
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Pur.Cont No (F9)</label>
                        <input name="purContNo" className="input-box mono" defaultValue={editing?.purContNo ?? ""} />
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">DELIVERED TO</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Yarn Party To</label>
                        <input name="yarnPartyTo" className="input-box" defaultValue={editing?.yarnPartyTo ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Time</label>
                        <input name="timeTo" className="input-box mono" defaultValue={editing?.timeTo ?? nowHm()} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Rate / Lbs To</label>
                        <input name="ratePerLbsTo" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.ratePerLbsTo ?? ""} />
                      </div>

                      <div className="md:col-span-3">
                        <label className="label block mb-1">Amount</label>
                        <input name="amount" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.amount ?? ""} />
                      </div>
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Location From (F9)</label>
                        <input name="locationFrom" className="input-box mono" defaultValue={editing?.locationFrom ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Imag Block</label>
                        <div className="flex items-stretch gap-1">
                          <input name="imgBlock" className="input-box mono flex-1" defaultValue={editing?.imgBlock ?? ""} placeholder="filename" />
                          <button type="button" disabled title="Coming soon" className="btn btn-outline btn-sm opacity-50" style={{ padding: "4px 8px" }}>Brows</button>
                          <button type="button" disabled title="Coming soon" className="btn btn-outline btn-sm opacity-50" style={{ padding: "4px 8px" }}>Pic</button>
                          <button type="button" disabled title="Coming soon" className="btn btn-outline btn-sm opacity-50" style={{ padding: "4px 8px" }}>UPD</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">COUNT-DETAIL</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Stock Bage</label>
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
                        <label className="label block mb-1">Warp</label>
                        <input name="warp" className="input-box mono" defaultValue={editing?.warp ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Weft</label>
                        <input name="weft" className="input-box mono" defaultValue={editing?.weft ?? ""} />
                      </div>

                      <div className="md:col-span-3">
                        <label className="label block mb-1">Bags</label>
                        <input name="bags" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.bags ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Qty Lbs</label>
                        <input name="qtyLbs" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.qtyLbs ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Rate / Lbs</label>
                        <input name="ratePerLbs" type="number" step="0.01" className="input-box mono text-right" defaultValue={editing?.ratePerLbs ?? ""} />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Brand</label>
                        <input name="brand" className="input-box mono" defaultValue={editing?.brand ?? ""} />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">Yarn Lot #</label>
                        <input name="yarnLotNo" className="input-box mono" defaultValue={editing?.yarnLotNo ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Ratio</label>
                        <input name="ratioText" className="input-box mono" defaultValue={editing?.ratioText ?? ""} />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Set No.</label>
                        <input name="setNo" className="input-box mono" defaultValue={editing?.setNo ?? ""} />
                      </div>

                      <div className="md:col-span-12">
                        <label className="label block mb-1">Remarks</label>
                        <input name="remarks" className="input-box" defaultValue={editing?.remarks ?? ""} />
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
                                <td className="text-center">
                                  <RowClearButton />
                                </td>
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
                <a href="/inventory/yarn-receipt" className="btn btn-outline btn-sm">Exit</a>
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
            <form className="flex gap-2" id="find-form" method="GET" action="/inventory/yarn-receipt">
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
                  <th>Trn</th>
                  <th>Cond</th>
                  <th>Party</th>
                  <th>Yarn Party To</th>
                  <th>Count</th>
                  <th className="text-right">Bags</th>
                  <th className="text-right">Qty Lbs</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const isSel = r.id === selected?.id;
                  const href = `/inventory/yarn-receipt?id=${r.id}`;
                  const style = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={style}>{r.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.vDate}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.trnType ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.condition ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>{r.party ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>{r.yarnPartyTo ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.countCode ?? "-"}</a></td>
                      <td className="mono text-[12px] text-right"><a href={href} className="no-underline block" style={style}>{r.bags ?? "-"}</a></td>
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
