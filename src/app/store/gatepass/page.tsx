import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { RowAutoFill, RowCalc } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK");

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

const LINE_ROWS = 8;

async function saveReturn(formData: FormData) {
  "use server";
  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  const isNew = !Number.isFinite(id);
  const back = isNew ? "?adding=1" : `?id=${id}`;

  const returnDate = txt(formData.get("return_date")) ?? today();
  const department = txt(formData.get("department")) ?? "";
  const returnedBy = txt(formData.get("returned_by"));
  const remarks = txt(formData.get("remarks"));
  if (!department) redirect(`/store/gatepass${back}`);

  const partCodes = formData.getAll("line_part") as string[];
  const qtys = formData.getAll("line_qty") as string[];
  const rates = formData.getAll("line_rate") as string[];

  const rawLines: { partCode: string; qty: number; rate: number | null }[] = [];
  for (let i = 0; i < partCodes.length; i++) {
    const partCode = (partCodes[i] ?? "").trim();
    const qty = num(qtys[i]);
    if (!partCode || qty === null || qty <= 0) continue;
    rawLines.push({ partCode, qty, rate: num(rates[i]) });
  }

  const codes = rawLines.map((l) => l.partCode);
  if (new Set(codes).size !== codes.length)
    redirect(`/store/gatepass${back}&error=dup_part`);

  const partRows = codes.length
    ? await db
        .select()
        .from(schema.chartParts)
        .where(inArray(schema.chartParts.code, codes))
    : [];
  if (partRows.length !== codes.length)
    redirect(`/store/gatepass${back}&error=bad_part`);
  const partByCode = new Map(partRows.map((p) => [p.code, p]));

  const lines = rawLines.map((l) => {
    const rate = r2(l.rate ?? partByCode.get(l.partCode)!.avgCost);
    return { partCode: l.partCode, qty: l.qty, rate, amount: r2(l.qty * rate) };
  });

  const itemCount = lines.length;
  const totalAmount = r2(lines.reduce((s, l) => s + l.amount, 0));

  const [company] = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.fy ?? "";

  let savedId = isNew ? 0 : id;
  let codeExists = false;
  try {
    savedId = await db.transaction(async (tx) => {
      let rid: number;
      if (isNew) {
        const [{ maxN }] = await tx
          .select({ maxN: sql<number>`coalesce(max(return_no), 0)` })
          .from(schema.storeReturns)
          .where(eq(schema.storeReturns.fyCode, fyCode));
        const [inserted] = await tx
          .insert(schema.storeReturns)
          .values({
            returnNo: (maxN ?? 0) + 1,
            fyCode,
            returnDate,
            department,
            returnedBy,
            itemCount,
            totalAmount,
            remarks,
          })
          .returning({ id: schema.storeReturns.id });
        rid = inserted.id;
      } else {
        const oldLines = await tx
          .select()
          .from(schema.storeReturnDetail)
          .where(eq(schema.storeReturnDetail.returnId, id));
        for (const ol of oldLines) {
          await tx
            .update(schema.chartParts)
            .set({ currentStock: sql`current_stock - ${ol.qty}` })
            .where(eq(schema.chartParts.code, ol.partCode));
        }
        await tx
          .delete(schema.storeReturnDetail)
          .where(eq(schema.storeReturnDetail.returnId, id));
        await tx
          .update(schema.storeReturns)
          .set({ returnDate, department, returnedBy, itemCount, totalAmount, remarks })
          .where(eq(schema.storeReturns.id, id));
        rid = id;
      }

      if (lines.length > 0) {
        await tx.insert(schema.storeReturnDetail).values(
          lines.map((l, i) => ({ ...l, returnId: rid, srNo: i + 1 }))
        );
      }

      for (const l of lines) {
        await tx
          .update(schema.chartParts)
          .set({ currentStock: sql`current_stock + ${l.qty}` })
          .where(eq(schema.chartParts.code, l.partCode));
      }

      return rid;
    });
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? "");
    if (/UNIQUE/i.test(msg)) codeExists = true;
    else throw e;
  }

  if (codeExists) redirect(`/store/gatepass${back}&error=code_exists`);

  revalidatePath("/store/gatepass");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect(`/store/gatepass?id=${savedId}`);
}

async function deleteReturn(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;

  await db.transaction(async (tx) => {
    const oldLines = await tx
      .select()
      .from(schema.storeReturnDetail)
      .where(eq(schema.storeReturnDetail.returnId, id));
    for (const ol of oldLines) {
      await tx
        .update(schema.chartParts)
        .set({ currentStock: sql`current_stock - ${ol.qty}` })
        .where(eq(schema.chartParts.code, ol.partCode));
    }
    await tx
      .delete(schema.storeReturnDetail)
      .where(eq(schema.storeReturnDetail.returnId, id));
    await tx.delete(schema.storeReturns).where(eq(schema.storeReturns.id, id));
  });

  revalidatePath("/store/gatepass");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect("/store/gatepass");
}

export default async function GatepassPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string }>;
}) {
  const params = await searchParams;
  const isAdding = params.adding === "1";

  const rows = await db
    .select()
    .from(schema.storeGatepass)
    .orderBy(sql`gatepass_date DESC`);

  const returns = await db
    .select()
    .from(schema.storeReturns)
    .orderBy(sql`return_date DESC, id DESC`);

  const selectedId = params.id ? parseInt(params.id, 10) : NaN;
  const selected = Number.isFinite(selectedId)
    ? returns.find((r) => r.id === selectedId) ?? null
    : null;
  const formItem = isAdding ? null : selected;
  const showForm = isAdding || !!formItem;

  const details = formItem
    ? await db
        .select()
        .from(schema.storeReturnDetail)
        .where(eq(schema.storeReturnDetail.returnId, formItem.id))
        .orderBy(schema.storeReturnDetail.srNo)
    : [];

  const [company] = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.fy ?? "";

  const [{ maxN }] = await db
    .select({ maxN: sql<number>`coalesce(max(return_no), 0)` })
    .from(schema.storeReturns)
    .where(eq(schema.storeReturns.fyCode, fyCode));
  const nextReturnNo = (maxN ?? 0) + 1;

  const costCenters = await db
    .select()
    .from(schema.costCenters)
    .orderBy(schema.costCenters.code);
  const departmentOpts = costCenters.map((c) => ({
    value: c.description,
    label: `${c.code} — ${c.description}`,
  }));

  const returners = [
    ...new Set(returns.map((r) => r.returnedBy).filter(Boolean)),
  ] as string[];

  const parts = await db
    .select()
    .from(schema.chartParts)
    .orderBy(schema.chartParts.code);
  const partMap: Record<string, Record<string, string | number>> = {};
  for (const p of parts) {
    partMap[p.code] = {
      line_desc: p.description,
      line_unit: p.unit,
      line_stock: p.currentStock,
      line_rate: r2(p.avgCost),
    };
  }
  const partByCode = new Map(parts.map((p) => [p.code, p]));

  const rowsToShow = Math.max(LINE_ROWS, details.length + 2);

  const total = rows.length;
  const inCount = rows.filter((r) => r.gatepassType === "IN").length;
  const outCount = rows.filter((r) => r.gatepassType === "OUT").length;

  return (
    <Shell active="gatepass">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Gate Pass{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total Gate Passes</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{inCount}</div>
            <div className="stat-label">IN</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{outCount}</div>
            <div className="stat-label">OUT</div>
          </div>
        </div>

        <div className="overflow-x-auto mb-12">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>GP No.</th>
              <th>Type</th>
              <th>Party</th>
              <th>Vehicle No.</th>
              <th>Purpose</th>
              <th className="text-right">Items</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-[var(--muted)]">
                  No gate passes found
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[13px]">{r.gatepassDate}</td>
                  <td className="mono text-[13px]">{r.gatepassNo}</td>
                  <td>
                    <span
                      className="inline-block border px-2 py-0.5 text-[11px] font-bold uppercase"
                      style={{
                        background:
                          r.gatepassType === "IN" ? "#000" : "transparent",
                        color: r.gatepassType === "IN" ? "#fff" : "#000",
                        borderColor: "#000",
                      }}
                    >
                      {r.gatepassType}
                    </span>
                  </td>
                  <td>{r.party}</td>
                  <td className="mono text-[13px]">{r.vehicleNo ?? ""}</td>
                  <td>{r.purpose ?? ""}</td>
                  <td className="mono text-[13px] text-right">
                    {r.itemCount ?? 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <h2 className="page-title">
            Store Returns (SR){" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({returns.length})
            </span>
          </h2>
          <a href="/store/gatepass?adding=1" className="btn btn-sm">
            New Return
          </a>
        </div>

        {params.error === "code_exists" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Return No already exists. Try saving again.
          </div>
        )}
        {params.error === "dup_part" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            The same part appears on more than one line. Combine into a single line.
          </div>
        )}
        {params.error === "bad_part" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            One or more part codes do not exist in the parts catalog.
          </div>
        )}

        {showForm && (
          <div className="border border-black p-4 mb-8">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-black">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                {formItem
                  ? `Edit Return — ${formItem.returnNo}/${formItem.fyCode}`
                  : "New Store Return"}
              </div>
              <div className="flex gap-2">
                <a href="/store/gatepass?adding=1" className="btn btn-outline btn-sm">
                  New
                </a>
                {formItem && (
                  <form action={deleteReturn} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message="Delete this return? Returned stock will be reversed.">
                      Del
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </div>

            <form action={saveReturn}>
              {formItem && <input type="hidden" name="id" value={formItem.id} />}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Return No</label>
                  <input
                    className="input-box mono bg-gray-100"
                    defaultValue={formItem?.returnNo ?? nextReturnNo}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div>
                  <label className="label block mb-1">FY</label>
                  <input
                    className="input-box mono bg-gray-100"
                    defaultValue={formItem?.fyCode ?? fyCode}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Date</label>
                  <input
                    name="return_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formItem?.returnDate ?? today()}
                    required
                  />
                </div>
                <div>
                  <label className="label block mb-1">Department</label>
                  <Combobox
                    name="department"
                    options={departmentOpts}
                    defaultValue={formItem?.department ?? ""}
                    placeholder="Department"
                    className="input-box"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Returned By</label>
                  <input
                    name="returned_by"
                    list="return-people"
                    className="input-box"
                    defaultValue={formItem?.returnedBy ?? ""}
                  />
                  <datalist id="return-people">
                    {returners.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="mb-4">
                <label className="label block mb-1">Remarks</label>
                <input
                  name="remarks"
                  className="input-box"
                  defaultValue={formItem?.remarks ?? ""}
                />
              </div>

              <RowAutoFill watch="line_part" map={partMap} />
              <RowCalc target="line_amount" a="line_qty" b="line_rate" />
              <datalist id="return-parts">
                {parts.map((p) => (
                  <option key={p.code} value={p.code}>
                    {`${p.code} — ${p.description}`}
                  </option>
                ))}
              </datalist>

              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                Line Items
              </div>
              <div className="overflow-x-auto border border-black mb-4">
                <table className="mono text-[12px]" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th style={{ width: 110 }}>Part</th>
                      <th>Description</th>
                      <th style={{ width: 70 }}>Unit</th>
                      <th style={{ width: 80 }}>In Stock</th>
                      <th style={{ width: 90 }}>Qty</th>
                      <th style={{ width: 90 }}>Rate</th>
                      <th style={{ width: 110 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rowsToShow }).map((_, i) => {
                      const l = details[i];
                      const p = l ? partByCode.get(l.partCode) : undefined;
                      return (
                        <tr key={l?.id ?? `e-${i}`}>
                          <td className="text-center text-[var(--muted)]">{i + 1}</td>
                          <td>
                            <input
                              name="line_part"
                              list="return-parts"
                              className="input-box mono text-[12px]"
                              defaultValue={l?.partCode ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="line_desc"
                              className="input-box text-[12px] bg-gray-100"
                              defaultValue={p?.description ?? ""}
                              readOnly
                              tabIndex={-1}
                            />
                          </td>
                          <td>
                            <input
                              name="line_unit"
                              className="input-box mono text-[12px] bg-gray-100"
                              defaultValue={p?.unit ?? ""}
                              readOnly
                              tabIndex={-1}
                            />
                          </td>
                          <td>
                            <input
                              name="line_stock"
                              className="input-box mono text-[12px] bg-gray-100 text-right"
                              defaultValue={p?.currentStock ?? ""}
                              readOnly
                              tabIndex={-1}
                            />
                          </td>
                          <td>
                            <input
                              name="line_qty"
                              type="number"
                              step="any"
                              className="input-box mono text-[12px]"
                              defaultValue={l?.qty ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="line_rate"
                              type="number"
                              step="any"
                              className="input-box mono text-[12px]"
                              defaultValue={l?.rate ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="line_amount"
                              type="number"
                              step="any"
                              className="input-box mono text-[12px] bg-gray-100 text-right"
                              defaultValue={l?.amount ?? ""}
                              readOnly
                              tabIndex={-1}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-[var(--muted)] mb-4">
                Returns add stock back. Rate defaults to the part&apos;s average cost.
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn btn-sm">
                  Save
                </button>
                <a href="/store/gatepass" className="btn btn-outline btn-sm">
                  Exit
                </a>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Return No.</th>
              <th>Department</th>
              <th>Returned By</th>
              <th className="text-right">Items</th>
              <th className="text-right">Amount</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {returns.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-[var(--muted)]">
                  No store returns found
                </td>
              </tr>
            ) : (
              returns.map((r) => {
                const isSel = r.id === selected?.id;
                const href = `/store/gatepass?id=${r.id}`;
                const linkStyle = { color: isSel ? "white" : "inherit" };
                return (
                  <tr
                    key={r.id}
                    className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                  >
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.returnDate}
                      </a>
                    </td>
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.returnNo}
                      </a>
                    </td>
                    <td>
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.department}
                      </a>
                    </td>
                    <td>{r.returnedBy ?? ""}</td>
                    <td className="mono text-[13px] text-right">
                      {r.itemCount ?? 0}
                    </td>
                    <td className="mono text-[13px] text-right">
                      {fmt.format(Math.round(r.totalAmount ?? 0))}
                    </td>
                    <td className="text-[13px]">{r.remarks ?? ""}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
    </Shell>
  );
}
