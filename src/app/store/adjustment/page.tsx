import { Shell } from "@/components/shell";
import { RowAutoFill, RowCalc } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { ApprovalActions, ApprovalBadge } from "@/components/approval-controls";
import { getSession, requireSession } from "@/lib/auth";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { today } from "@/lib/time";
import {
  forwardToAudit as fwdAudit,
  forwardToFinance as fwdFinance,
  revertApproval as revertAppr,
} from "@/lib/approvals";
import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
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

const r2 = (n: number) => Math.round(n * 100) / 100;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

const LINE_ROWS = 4;
const TYPES = new Set(["ADJ", "DAMAGE"]);
const REASONS = new Set(["FOUND", "DAMAGED", "LOST", "RECOUNT"]);

async function saveAdjustment(formData: FormData) {
  "use server";
  await requireSession();
  try {

  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  const isNew = !Number.isFinite(id);
  const back = isNew ? "?adding=1" : `?id=${id}`;

  const adjDate = txt(formData.get("adj_date")) ?? today();
  await assertPeriodOpen(adjDate, "STORE");
  const typeRaw = txt(formData.get("type")) ?? "ADJ";
  const type = TYPES.has(typeRaw) ? typeRaw : "ADJ";
  const remarks = txt(formData.get("remarks"));

  const partCodes = formData.getAll("line_part") as string[];
  const qtys = formData.getAll("line_qty") as string[];
  const rates = formData.getAll("line_rate") as string[];
  const reasons = formData.getAll("line_reason") as string[];

  const rawLines: {
    partCode: string;
    qty: number;
    rate: number | null;
    reason: string | null;
  }[] = [];
  for (let i = 0; i < partCodes.length; i++) {
    const partCode = (partCodes[i] ?? "").trim();
    const qty = num(qtys[i]);
    if (!partCode) continue;
    if (qty === null) continue;
    if (qty === 0) redirect(`/store/adjustment${back}&error=zero_qty`);
    const reasonRaw = (reasons[i] ?? "").trim().toUpperCase();
    const reason = REASONS.has(reasonRaw) ? reasonRaw : null;
    rawLines.push({ partCode, qty, rate: num(rates[i]), reason });
  }

  if (rawLines.length === 0) redirect(`/store/adjustment${back}&error=empty`);

  const codes = rawLines.map((l) => l.partCode);
  if (new Set(codes).size !== codes.length)
    redirect(`/store/adjustment${back}&error=dup_part`);

  const partRows = await db
    .select()
    .from(schema.chartParts)
    .where(inArray(schema.chartParts.code, codes));
  if (partRows.length !== codes.length)
    redirect(`/store/adjustment${back}&error=bad_part`);
  const partByCode = new Map(partRows.map((p) => [p.code, p]));

  let oldLinesForNet: { partCode: string; qty: number }[] = [];
  if (!isNew) {
    oldLinesForNet = await db
      .select({
        partCode: schema.storeAdjustmentDetail.partCode,
        qty: schema.storeAdjustmentDetail.qty,
      })
      .from(schema.storeAdjustmentDetail)
      .where(eq(schema.storeAdjustmentDetail.adjId, id));
  }
  const netByPart = new Map<string, number>();
  for (const ol of oldLinesForNet)
    netByPart.set(ol.partCode, (netByPart.get(ol.partCode) ?? 0) - ol.qty);
  for (const l of rawLines)
    netByPart.set(l.partCode, (netByPart.get(l.partCode) ?? 0) + l.qty);

  for (const [code, delta] of netByPart) {
    if (delta >= 0) continue;
    const p = partByCode.get(code);
    const currentStock =
      p?.currentStock ??
      (await db
        .select({ s: schema.chartParts.currentStock })
        .from(schema.chartParts)
        .where(eq(schema.chartParts.code, code))
        .limit(1))[0]?.s ??
      0;
    if (currentStock + delta < 0)
      redirect(
        `/store/adjustment${back}&error=insufficient_stock&part=${encodeURIComponent(code)}`
      );
  }

  const lines = rawLines.map((l) => {
    const rate = r2(l.rate ?? partByCode.get(l.partCode)!.avgCost);
    return {
      partCode: l.partCode,
      qty: l.qty,
      rate,
      amount: r2(l.qty * rate),
      reason: l.reason,
    };
  });

  const itemCount = lines.length;
  const totalValue = r2(lines.reduce((s, l) => s + l.amount, 0));

  const [company] = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.fy ?? "";

  let savedId = isNew ? 0 : id;
  let codeExists = false;
  try {
    savedId = await db.transaction(async (tx) => {
      let aid: number;
      if (isNew) {
        const [{ maxN }] = await tx
          .select({ maxN: sql<number>`coalesce(max(adj_no), 0)` })
          .from(schema.storeAdjustments)
          .where(eq(schema.storeAdjustments.fyCode, fyCode));
        const [inserted] = await tx
          .insert(schema.storeAdjustments)
          .values({
            adjNo: (maxN ?? 0) + 1,
            fyCode,
            adjDate,
            type,
            remarks,
            itemCount,
            totalValue,
          })
          .returning({ id: schema.storeAdjustments.id });
        aid = inserted.id;
      } else {
        const oldLines = await tx
          .select()
          .from(schema.storeAdjustmentDetail)
          .where(eq(schema.storeAdjustmentDetail.adjId, id));
        for (const ol of oldLines) {
          await tx
            .update(schema.chartParts)
            .set({ currentStock: sql`current_stock - ${ol.qty}` })
            .where(eq(schema.chartParts.code, ol.partCode));
        }
        await tx
          .delete(schema.storeAdjustmentDetail)
          .where(eq(schema.storeAdjustmentDetail.adjId, id));
        await tx
          .update(schema.storeAdjustments)
          .set({ adjDate, type, remarks, itemCount, totalValue })
          .where(eq(schema.storeAdjustments.id, id));
        aid = id;
      }

      await tx.insert(schema.storeAdjustmentDetail).values(
        lines.map((l, i) => ({ ...l, adjId: aid, srNo: i + 1 }))
      );

      for (const l of lines) {
        await tx
          .update(schema.chartParts)
          .set({ currentStock: sql`current_stock + ${l.qty}` })
          .where(eq(schema.chartParts.code, l.partCode));
      }

      return aid;
    });
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? "");
    if (/UNIQUE/i.test(msg)) codeExists = true;
    else throw e;
  }

  if (codeExists) redirect(`/store/adjustment${back}&error=code_exists`);

  revalidatePath("/store/adjustment");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect(`/store/adjustment?id=${savedId}`);
  } catch (e) {
    const err = e as { message?: string; digest?: string };
    if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
    const thru = parseLockedThroughFromError(err.message ?? "");
    if (thru) redirect(`/store/adjustment?error=period_locked&thru=${thru}`);
    throw e;
  }
}

async function deleteAdjustment(formData: FormData) {
  "use server";
  const s = await getSession();
  if (s?.roleName !== "ADMIN") redirect("/store/adjustment?error=admin_only");

  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;

  const [existing] = await db
    .select({ approvalStatus: schema.storeAdjustments.approvalStatus })
    .from(schema.storeAdjustments)
    .where(eq(schema.storeAdjustments.id, id))
    .limit(1);
  if (existing?.approvalStatus === "POSTED") {
    redirect("/store/adjustment?error=posted_delete_warn");
  }

  await db.transaction(async (tx) => {
    const oldLines = await tx
      .select()
      .from(schema.storeAdjustmentDetail)
      .where(eq(schema.storeAdjustmentDetail.adjId, id));
    for (const ol of oldLines) {
      await tx
        .update(schema.chartParts)
        .set({ currentStock: sql`current_stock - ${ol.qty}` })
        .where(eq(schema.chartParts.code, ol.partCode));
    }
    await tx
      .delete(schema.storeAdjustmentDetail)
      .where(eq(schema.storeAdjustmentDetail.adjId, id));
    await tx.delete(schema.storeAdjustments).where(eq(schema.storeAdjustments.id, id));
  });

  revalidatePath("/store/adjustment");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect("/store/adjustment");
}

async function deletePostedAdjustment(formData: FormData) {
  "use server";
  const s = await getSession();
  if (s?.roleName !== "ADMIN") redirect("/store/adjustment?error=admin_only");
  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;

  await db.transaction(async (tx) => {
    const oldLines = await tx
      .select()
      .from(schema.storeAdjustmentDetail)
      .where(eq(schema.storeAdjustmentDetail.adjId, id));
    for (const ol of oldLines) {
      await tx
        .update(schema.chartParts)
        .set({ currentStock: sql`current_stock - ${ol.qty}` })
        .where(eq(schema.chartParts.code, ol.partCode));
    }
    await tx
      .delete(schema.storeAdjustmentDetail)
      .where(eq(schema.storeAdjustmentDetail.adjId, id));
    await tx.delete(schema.storeAdjustments).where(eq(schema.storeAdjustments.id, id));
  });

  revalidatePath("/store/adjustment");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect("/store/adjustment");
}

async function adjForwardAudit(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (Number.isFinite(id)) await fwdAudit("adjustment", id);
}
async function adjForwardFinance(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (Number.isFinite(id)) await fwdFinance("adjustment", id);
}
async function adjRevert(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (Number.isFinite(id)) await revertAppr("adjustment", id);
}

export default async function AdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    adding?: string;
    error?: string;
    part?: string;
    q?: string;
    year?: string;
    thru?: string;
  }>;
}) {
  const params = await searchParams;
  const isAdding = params.adding === "1";
  const q = params.q?.trim() ?? "";
  const escQ = q ? escapeLike(q) : "";
  const session = await getSession();
  const role = session?.roleName;

  const [company] = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.fy ?? "";

  const fyList = await db
    .select({ code: schema.fiscalYears.code, description: schema.fiscalYears.description })
    .from(schema.fiscalYears)
    .orderBy(sql`code DESC`);
  const year = params.year?.trim() || fyCode;

  const pat = escQ ? `%${escQ}%` : "";
  const listConds: ReturnType<typeof sql>[] = [];
  if (year) listConds.push(sql`${schema.storeAdjustments.fyCode} = ${year}`);
  if (q) {
    listConds.push(
      sql`(CAST(${schema.storeAdjustments.adjNo} AS TEXT) LIKE ${pat} ESCAPE '\\' OR ${schema.storeAdjustments.remarks} LIKE ${pat} ESCAPE '\\')`,
    );
  }

  const rows = await db
    .select()
    .from(schema.storeAdjustments)
    .where(listConds.length ? and(...listConds) : undefined)
    .orderBy(sql`adj_date DESC, id DESC`);

  const selectedId = params.id ? parseInt(params.id, 10) : NaN;
  const selected = Number.isFinite(selectedId)
    ? rows.find((r) => r.id === selectedId) ?? null
    : null;
  const formItem = isAdding ? null : selected;
  const showForm = isAdding || !!formItem;

  const details = formItem
    ? await db
        .select()
        .from(schema.storeAdjustmentDetail)
        .where(eq(schema.storeAdjustmentDetail.adjId, formItem.id))
        .orderBy(schema.storeAdjustmentDetail.srNo)
    : [];

  const [{ maxN }] = await db
    .select({ maxN: sql<number>`coalesce(max(adj_no), 0)` })
    .from(schema.storeAdjustments)
    .where(eq(schema.storeAdjustments.fyCode, fyCode));
  const nextAdjNo = (maxN ?? 0) + 1;

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
  const posLines = rows.reduce((s, r) => s + (r.itemCount ?? 0), 0);
  const totalValue = rows.reduce((s, r) => s + (r.totalValue ?? 0), 0);

  const errorPart = params.part ? partByCode.get(params.part) : null;

  return (
    <Shell active="adjustment">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <h1 className="page-title">
            Parts Adjustment{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
          <a href="/store/adjustment?adding=1" className="btn btn-sm">
            New Adjustment
          </a>
        </div>

        {params.error === "empty" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Add at least one line item before saving.
          </div>
        )}
        {params.error === "zero_qty" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Quantity cannot be zero. Use a positive value to add stock or a negative value to remove it.
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
        {params.error === "insufficient_stock" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Insufficient stock for part {params.part ?? ""}
            {errorPart
              ? ` — ${errorPart.description} (in stock: ${fmt.format(errorPart.currentStock)})`
              : ""}
            . Nothing was saved.
          </div>
        )}
        {params.error === "code_exists" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Adjustment No already exists. Try saving again.
          </div>
        )}
        {params.error === "period_locked" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Period is locked. Cannot save for this date
            {params.thru && (
              <> — locked through <span className="mono">{params.thru}</span></>
            )}
            .
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Only ADMIN users can delete adjustments.
          </div>
        )}
        {params.error === "role_denied" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Your role does not permit that approval action.
          </div>
        )}
        {params.error === "bad_state" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Approval status has changed. Reload and try again.
          </div>
        )}
        {params.error === "posted_delete_warn" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            This adjustment is POSTED to Finance. Revert the approval first — deleting it now would leave orphan GL entries.
          </div>
        )}

        {showForm && (
          <div className="border border-black p-4 mb-3">
            <div className="flex flex-wrap items-center justify-between mb-4 pb-2 border-b border-black gap-2">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                {formItem
                  ? `Edit Adjustment — ${formItem.adjNo}/${formItem.fyCode}`
                  : "New Adjustment"}
              </div>
              {formItem && (
                <ApprovalActions
                  kind="adjustment"
                  id={formItem.id}
                  status={formItem.approvalStatus}
                  role={role}
                  forwardAudit={adjForwardAudit}
                  forwardFinance={adjForwardFinance}
                  revert={adjRevert}
                />
              )}
              <div className="flex gap-2">
                <a href="/store/adjustment?adding=1" className="btn btn-outline btn-sm">
                  New
                </a>
                {formItem && formItem.approvalStatus !== "POSTED" && (
                  <form action={deleteAdjustment} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message="Delete this adjustment? Its stock movements will be reversed.">
                      Del
                    </ConfirmButton>
                  </form>
                )}
                {formItem && formItem.approvalStatus === "POSTED" && role === "ADMIN" && (
                  <form action={deletePostedAdjustment} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message="This adjustment is POSTED. Deleting will reverse stock AND require manual reversal of GL entries. Continue?">
                      Del (POSTED)
                    </ConfirmButton>
                  </form>
                )}
                {!formItem && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled
                    title="Save the voucher first to enable delete"
                    style={{ opacity: 0.5, cursor: "not-allowed" }}
                  >
                    Del
                  </button>
                )}
              </div>
            </div>

            <form action={saveAdjustment}>
              {formItem && <input type="hidden" name="id" value={formItem.id} />}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Adj No</label>
                  <input
                    className="input-box mono bg-gray-100"
                    defaultValue={formItem?.adjNo ?? nextAdjNo}
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
                    name="adj_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formItem?.adjDate ?? today()}
                    required
                  />
                </div>
                <div>
                  <label className="label block mb-1">Type</label>
                  <select
                    name="type"
                    className="input-box mono"
                    defaultValue={formItem?.type ?? "ADJ"}
                  >
                    <option value="ADJ">ADJUSTMENT</option>
                    <option value="DAMAGE">DAMAGE</option>
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Remarks</label>
                  <input
                    name="remarks"
                    className="input-box"
                    defaultValue={formItem?.remarks ?? ""}
                  />
                </div>
              </div>

              <RowAutoFill watch="line_part" map={partMap} />
              <RowCalc target="line_amount" a="line_qty" b="line_rate" />
              <datalist id="adj-parts">
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
                <table className="mono text-[12px]" style={{ minWidth: 1000 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th style={{ width: 110 }}>Part</th>
                      <th>Description</th>
                      <th style={{ width: 70 }}>Unit</th>
                      <th style={{ width: 80 }}>In Stock</th>
                      <th style={{ width: 90 }}>Qty (±)</th>
                      <th style={{ width: 90 }}>Rate</th>
                      <th style={{ width: 110 }}>Amount</th>
                      <th style={{ width: 120 }}>Reason</th>
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
                              list="adj-parts"
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
                              className="input-box mono text-[12px] text-right"
                              defaultValue={l?.qty ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="line_rate"
                              type="number"
                              step="any"
                              className="input-box mono text-[12px] text-right"
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
                          <td>
                            <select
                              name="line_reason"
                              className="input-box mono text-[12px]"
                              defaultValue={l?.reason ?? ""}
                            >
                              <option value=""></option>
                              <option value="FOUND">FOUND</option>
                              <option value="DAMAGED">DAMAGED</option>
                              <option value="LOST">LOST</option>
                              <option value="RECOUNT">RECOUNT</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-[var(--muted)] mb-4">
                Positive quantity adds to stock; negative removes. Rate defaults to the part&apos;s average cost.
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn btn-sm">
                  Save
                </button>
                <a href="/store/adjustment" className="btn btn-outline btn-sm">
                  Exit
                </a>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-3">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Adjustments</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{fmt.format(posLines)}</div>
            <div className="stat-label">Line Items</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{fmt.format(Math.round(totalValue))}</div>
            <div className="stat-label">Total Value</div>
          </div>
        </div>

        <form method="get" action="/store/adjustment" className="flex flex-wrap gap-2 mb-4 items-end">
          <div>
            <label className="label block mb-1">Find</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Adj No or remarks"
              className="input-box mono"
            />
          </div>
          <div>
            <label className="label block mb-1">FY</label>
            <select name="year" defaultValue={year} className="input-box mono">
              {fyList.length === 0 && <option value="">(all)</option>}
              {fyList.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.code} — {f.description}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-sm">Filter</button>
          {(q || (year && year !== fyCode)) && (
            <a href="/store/adjustment" className="btn btn-outline btn-sm">Clear</a>
          )}
        </form>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Adj No.</th>
              <th>Type</th>
              <th>Remarks</th>
              <th className="text-right">Items</th>
              <th className="text-right">Value</th>
              <th>Approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-[var(--muted)]">
                  No adjustments found
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isSel = r.id === selected?.id;
                const rowHref = `/store/adjustment?id=${r.id}${q ? `&q=${encodeURIComponent(q)}` : ""}${year && year !== fyCode ? `&year=${encodeURIComponent(year)}` : ""}`;
                const linkStyle = { color: isSel ? "white" : "inherit" };
                return (
                  <tr
                    key={r.id}
                    className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                  >
                    <td className="mono text-[13px] p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {r.adjDate}
                      </a>
                    </td>
                    <td className="mono text-[13px] p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {r.adjNo}/{r.fyCode}
                      </a>
                    </td>
                    <td className="p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        <span
                          className="inline-block border px-2 py-0.5 text-[11px] font-bold uppercase"
                          style={{
                            background: r.type === "DAMAGE" ? "#000" : "transparent",
                            color: r.type === "DAMAGE" ? "#fff" : "#000",
                            borderColor: "#000",
                          }}
                        >
                          {r.type === "DAMAGE" ? "DAMAGE" : "ADJUSTMENT"}
                        </span>
                      </a>
                    </td>
                    <td className="p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {r.remarks ?? ""}
                      </a>
                    </td>
                    <td className="mono text-[13px] text-right p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1 text-right" style={linkStyle}>
                        {r.itemCount ?? 0}
                      </a>
                    </td>
                    <td className="mono text-[13px] text-right p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1 text-right" style={linkStyle}>
                        {fmt.format(Math.round(r.totalValue ?? 0))}
                      </a>
                    </td>
                    <td className="p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        <ApprovalBadge status={r.approvalStatus} />
                      </a>
                    </td>
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
