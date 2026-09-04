import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { RowAutoFill, RowCalc } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { ApprovalActions, ApprovalBadge } from "@/components/approval-controls";
import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { acc } from "@/lib/gl-accounts";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today } from "@/lib/time";
import {
  forwardToAudit as fwdAudit,
  forwardToFinance as fwdFinance,
  revertApproval as revertAppr,
} from "@/lib/approvals";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num, txt } from "@/lib/form";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK");

const r2 = (n: number) => Math.round(n * 100) / 100;

const LINE_ROWS = 4;

const VTYPE = "PV";

async function saveGrn(formData: FormData) {
  "use server";
  try {
  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  const isNew = !Number.isFinite(id);
  const back = isNew ? "?adding=1" : `?id=${id}`;

  const grnDate = txt(formData.get("grn_date")) ?? today();
  await assertPeriodOpen(grnDate, "STORE");
  const supplierRaw = txt(formData.get("supplier")) ?? "";
  const invoiceNo = txt(formData.get("invoice_no"));
  if (!supplierRaw) redirect(`/store/grn${back}`);

  const [acct] = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
    })
    .from(schema.chartOfAccounts)
    .where(eq(schema.chartOfAccounts.code, supplierRaw))
    .limit(1);
  const supplier = acct?.description ?? supplierRaw;
  const supplierCode = acct?.code ?? null;

  const partCodes = formData.getAll("line_part") as string[];
  const qtys = formData.getAll("line_qty") as string[];
  const rateBills = formData.getAll("line_rate_bill") as string[];
  const discPers = formData.getAll("line_disc_per") as string[];
  const taxPers = formData.getAll("line_tax_per") as string[];
  const rates = formData.getAll("line_rate") as string[];

  const lines: {
    partCode: string;
    qty: number;
    rateBill: number | null;
    discPer: number | null;
    taxPer: number | null;
    rate: number;
    amount: number;
  }[] = [];
  for (let i = 0; i < partCodes.length; i++) {
    const partCode = (partCodes[i] ?? "").trim();
    const qty = num(qtys[i]);
    if (!partCode || qty === null || qty <= 0) continue;
    const rateBill = num(rateBills[i]);
    const discPer = num(discPers[i]);
    const taxPer = num(taxPers[i]);
    // Oracle adds discount as a charge; discount-subtracts is the sensible reading
    const rate =
      rateBill !== null
        ? r2(rateBill * (1 - (discPer ?? 0) / 100) * (1 + (taxPer ?? 0) / 100))
        : num(rates[i]) ?? 0;
    lines.push({
      partCode,
      qty,
      rateBill,
      discPer,
      taxPer,
      rate,
      amount: r2(qty * rate),
    });
  }

  const codes = lines.map((l) => l.partCode);
  if (new Set(codes).size !== codes.length)
    redirect(`/store/grn${back}&error=dup_part`);

  if (codes.length > 0) {
    const known = await db
      .select({ code: schema.chartParts.code })
      .from(schema.chartParts)
      .where(inArray(schema.chartParts.code, codes));
    if (known.length !== codes.length) redirect(`/store/grn${back}&error=bad_part`);
  }

  const itemCount = lines.length;
  const totalAmount = r2(lines.reduce((s, l) => s + l.amount, 0));

  const [company] = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.fy ?? "";

  const partyRows = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
    })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 4`);
  const codeByDesc = new Map(partyRows.map((p) => [p.description, p.code]));
  const resolvePartyCoa = (partyDesc: string | null | undefined): string => {
    if (!partyDesc) return "";
    const s = partyDesc.trim();
    if (/^\d+(\.\d+)+$/.test(s)) return s;
    return codeByDesc.get(s) ?? "";
  };
  const partyCoa =
    supplierCode && /^\d+(\.\d+)+$/.test(supplierCode)
      ? supplierCode
      : resolvePartyCoa(supplier);

  const partsStockExpCoa = await acc("PARTS_STOCK_EXP");

  let existingGrnNo: number | null = null;
  if (!isNew) {
    const [ex] = await db
      .select({ grnNo: schema.storeGrn.grnNo })
      .from(schema.storeGrn)
      .where(eq(schema.storeGrn.id, id))
      .limit(1);
    existingGrnNo = ex?.grnNo ?? null;
  }

  let savedId = isNew ? 0 : id;
  let codeExists = false;
  try {
    savedId = await db.transaction(async (tx) => {
      let gid: number;
      let vno: number;
      if (isNew) {
        const [{ maxN }] = await tx
          .select({ maxN: sql<number>`coalesce(max(grn_no), 0)` })
          .from(schema.storeGrn)
          .where(eq(schema.storeGrn.fyCode, fyCode));
        const newGrnNo = (maxN ?? 0) + 1;
        const [inserted] = await tx
          .insert(schema.storeGrn)
          .values({
            grnNo: newGrnNo,
            fyCode,
            grnDate,
            supplier,
            supplierCode,
            invoiceNo,
            itemCount,
            totalAmount,
          })
          .returning({ id: schema.storeGrn.id });
        gid = inserted.id;
        vno = newGrnNo;
      } else {
        const oldLines = await tx
          .select()
          .from(schema.storeGrnDetail)
          .where(eq(schema.storeGrnDetail.grnId, id));
        for (const ol of oldLines) {
          await tx
            .update(schema.chartParts)
            .set({ currentStock: sql`current_stock - ${ol.qty}` })
            .where(eq(schema.chartParts.code, ol.partCode));
        }
        await tx
          .delete(schema.storeGrnDetail)
          .where(eq(schema.storeGrnDetail.grnId, id));
        await tx
          .update(schema.storeGrn)
          .set({ grnDate, supplier, supplierCode, invoiceNo, itemCount, totalAmount })
          .where(eq(schema.storeGrn.id, id));
        gid = id;
        vno = existingGrnNo ?? 0;
      }

      if (lines.length > 0) {
        await tx.insert(schema.storeGrnDetail).values(
          lines.map((l, i) => ({ ...l, grnId: gid, srNo: i + 1 }))
        );
      }

      // WHY: moving average cost is path-dependent — the historical sequence of
      // GRNs/issues determines each recompute, so a delete or edit cannot
      // exactly reverse the prior weighted average without replaying every
      // subsequent movement. Reversing stock qty is exact; reversing avgCost
      // is not, so we only reverse qty on edit/delete and let avgCost drift.
      for (const l of lines) {
        const [p] = await tx
          .select()
          .from(schema.chartParts)
          .where(eq(schema.chartParts.code, l.partCode))
          .limit(1);
        if (!p) throw new Error("BAD_PART");
        const newStock = p.currentStock + l.qty;
        const newAvg =
          newStock > 0
            ? (p.currentStock * p.avgCost + l.qty * l.rate) / newStock
            : l.rate;
        await tx
          .update(schema.chartParts)
          .set({
            currentStock: newStock,
            avgCost: newAvg,
            lastPurchaseDate: grnDate,
          })
          .where(eq(schema.chartParts.id, p.id));
      }

      if (vno > 0) {
        await tx
          .delete(schema.transDetail)
          .where(
            and(
              eq(schema.transDetail.vtype, VTYPE),
              eq(schema.transDetail.vno, vno),
            ),
          );
        await tx
          .delete(schema.transMain)
          .where(
            and(
              eq(schema.transMain.vtype, VTYPE),
              eq(schema.transMain.vno, vno),
            ),
          );

        if (totalAmount > 0 && partyCoa) {
          await tx.insert(schema.transMain).values({
            fyCode,
            vtype: VTYPE,
            vno,
            vdate: grnDate,
            accCode: partyCoa,
            narration: `GRN#${vno} Inv#${invoiceNo ?? ""}`.trim(),
            balanceAmount: totalAmount,
          });

          const details: (typeof schema.transDetail.$inferInsert)[] = [
            {
              fyCode,
              vtype: VTYPE,
              vno,
              srno: 1,
              accCode: partsStockExpCoa,
              partyCode: partyCoa,
              debit: totalAmount,
              credit: 0,
            },
            {
              fyCode,
              vtype: VTYPE,
              vno,
              srno: 2,
              accCode: partyCoa,
              partyCode: partyCoa,
              debit: 0,
              credit: totalAmount,
            },
          ];
          const dSum = details.reduce((s, x) => s + (x.debit ?? 0), 0);
          const cSum = details.reduce((s, x) => s + (x.credit ?? 0), 0);
          if (Math.abs(dSum - cSum) >= 0.01)
            throw new Error("Unbalanced voucher");
          await tx.insert(schema.transDetail).values(details);
        }
      }

      return gid;
    });
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? "");
    if (/UNIQUE/i.test(msg)) codeExists = true;
    else throw e;
  }

  if (codeExists) redirect(`/store/grn${back}&error=code_exists`);

  revalidatePath("/store/grn");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect(`/store/grn?id=${savedId}`);
  } catch (e) {
    const err = e as { message?: string; digest?: string };
    if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
    const thru = parseLockedThroughFromError(err.message ?? "");
    if (thru) redirect(`/store/grn?error=period_locked&thru=${thru}`);
    throw e;
  }
}

async function deleteGrn(formData: FormData) {
  "use server";
  const s = await getSession();
  if (s?.roleName !== "ADMIN") redirect("/store/grn?error=admin_only");
  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;

  const [existing] = await db
    .select({
      approvalStatus: schema.storeGrn.approvalStatus,
      grnNo: schema.storeGrn.grnNo,
    })
    .from(schema.storeGrn)
    .where(eq(schema.storeGrn.id, id))
    .limit(1);
  if (existing?.approvalStatus === "POSTED") {
    redirect("/store/grn?error=posted_delete_warn");
  }
  const vno = existing?.grnNo ?? 0;

  await db.transaction(async (tx) => {
    if (vno > 0) {
      await tx
        .delete(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, vno),
          ),
        );
      await tx
        .delete(schema.transMain)
        .where(
          and(
            eq(schema.transMain.vtype, VTYPE),
            eq(schema.transMain.vno, vno),
          ),
        );
    }
    const oldLines = await tx
      .select()
      .from(schema.storeGrnDetail)
      .where(eq(schema.storeGrnDetail.grnId, id));
    for (const ol of oldLines) {
      await tx
        .update(schema.chartParts)
        .set({ currentStock: sql`current_stock - ${ol.qty}` })
        .where(eq(schema.chartParts.code, ol.partCode));
    }
    await tx.delete(schema.storeGrnDetail).where(eq(schema.storeGrnDetail.grnId, id));
    await tx.delete(schema.storeGrn).where(eq(schema.storeGrn.id, id));
  });

  revalidatePath("/store/grn");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect("/store/grn");
}

async function deletePostedGrn(formData: FormData) {
  "use server";
  const s = await getSession();
  if (s?.roleName !== "ADMIN") redirect("/store/grn?error=admin_only");
  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;

  const [existing] = await db
    .select({ grnNo: schema.storeGrn.grnNo })
    .from(schema.storeGrn)
    .where(eq(schema.storeGrn.id, id))
    .limit(1);
  const vno = existing?.grnNo ?? 0;

  await db.transaction(async (tx) => {
    if (vno > 0) {
      await tx
        .delete(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, vno),
          ),
        );
      await tx
        .delete(schema.transMain)
        .where(
          and(
            eq(schema.transMain.vtype, VTYPE),
            eq(schema.transMain.vno, vno),
          ),
        );
    }
    const oldLines = await tx
      .select()
      .from(schema.storeGrnDetail)
      .where(eq(schema.storeGrnDetail.grnId, id));
    for (const ol of oldLines) {
      await tx
        .update(schema.chartParts)
        .set({ currentStock: sql`current_stock - ${ol.qty}` })
        .where(eq(schema.chartParts.code, ol.partCode));
    }
    await tx.delete(schema.storeGrnDetail).where(eq(schema.storeGrnDetail.grnId, id));
    await tx.delete(schema.storeGrn).where(eq(schema.storeGrn.id, id));
  });

  revalidatePath("/store/grn");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect("/store/grn");
}

async function grnForwardAudit(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (Number.isFinite(id)) await fwdAudit("grn", id);
}
async function grnForwardFinance(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (Number.isFinite(id)) await fwdFinance("grn", id);
}
async function grnRevert(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (Number.isFinite(id)) await revertAppr("grn", id);
}

export default async function GrnPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const isAdding = params.adding === "1";
  const session = await getSession();
  const role = session?.roleName;

  const rows = await db
    .select()
    .from(schema.storeGrn)
    .orderBy(sql`grn_date DESC, id DESC`);

  const selectedId = params.id ? parseInt(params.id, 10) : NaN;
  const selected = Number.isFinite(selectedId)
    ? rows.find((r) => r.id === selectedId) ?? null
    : null;
  const formItem = isAdding ? null : selected;
  const showForm = isAdding || !!formItem;

  const details = formItem
    ? await db
        .select()
        .from(schema.storeGrnDetail)
        .where(eq(schema.storeGrnDetail.grnId, formItem.id))
        .orderBy(schema.storeGrnDetail.srNo)
    : [];

  const [company] = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.fy ?? "";

  const [{ maxN }] = await db
    .select({ maxN: sql<number>`coalesce(max(grn_no), 0)` })
    .from(schema.storeGrn)
    .where(eq(schema.storeGrn.fyCode, fyCode));
  const nextGrnNo = (maxN ?? 0) + 1;

  const suppliers = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
    })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 4`)
    .orderBy(schema.chartOfAccounts.description);
  const supplierOpts = suppliers.map((s) => ({
    value: s.code,
    label: `${s.code} — ${s.description}`,
  }));

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
    };
  }
  const partDescByCode = new Map(parts.map((p) => [p.code, p]));

  const rowsToShow = Math.max(LINE_ROWS, details.length + 2);

  const total = rows.length;
  const totalItems = rows.reduce((s, r) => s + (r.itemCount ?? 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0);

  return (
    <Shell active="grn">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <h1 className="page-title">
            Goods Received Notes{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
          <a href="/store/grn?adding=1" className="btn btn-sm">
            New GRN
          </a>
        </div>

        {params.error === "code_exists" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            GRN No already exists. Try saving again.
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
            Only ADMIN users can delete GRNs.
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
            This GRN is POSTED to Finance. Revert the approval first — deleting it now would leave orphan GL entries.
          </div>
        )}

        {showForm && (
          <div className="border border-black p-4 mb-3">
            <div className="flex flex-wrap items-center justify-between mb-4 pb-2 border-b border-black gap-2">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                {formItem ? `Edit GRN — ${formItem.grnNo}/${formItem.fyCode}` : "New GRN"}
              </div>
              {formItem && (
                <ApprovalActions
                  kind="grn"
                  id={formItem.id}
                  status={formItem.approvalStatus}
                  role={role}
                  forwardAudit={grnForwardAudit}
                  forwardFinance={grnForwardFinance}
                  revert={grnRevert}
                />
              )}
              <div className="flex gap-2">
                <a href="/store/grn?adding=1" className="btn btn-outline btn-sm">
                  New
                </a>
                {formItem && formItem.approvalStatus !== "POSTED" && (
                  <form action={deleteGrn} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message="Delete this GRN? Stock received on it will be reversed.">
                      Del
                    </ConfirmButton>
                  </form>
                )}
                {formItem && formItem.approvalStatus === "POSTED" && role === "ADMIN" && (
                  <form action={deletePostedGrn} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message="This GRN is POSTED. Deleting will reverse stock AND require manual reversal of GL entries. Continue?">
                      Del (POSTED)
                    </ConfirmButton>
                  </form>
                )}
                {!formItem && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled
                    title="Save the GRN first to enable delete"
                    style={{ opacity: 0.5, cursor: "not-allowed" }}
                  >
                    Del
                  </button>
                )}
                {formItem && formItem.approvalStatus === "POSTED" && role !== "ADMIN" && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled
                    title="GRN is POSTED — only ADMIN can delete"
                    style={{ opacity: 0.5, cursor: "not-allowed" }}
                  >
                    Del
                  </button>
                )}
              </div>
            </div>

            <form action={saveGrn}>
              {formItem && <input type="hidden" name="id" value={formItem.id} />}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 gform">
                <div>
                  <label className="label block mb-1">GRN No</label>
                  <input
                    className="input-box mono bg-gray-100"
                    defaultValue={formItem?.grnNo ?? nextGrnNo}
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
                    name="grn_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formItem?.grnDate ?? today()}
                    required
                  />
                </div>
                <div>
                  <label className="label block mb-1">Supplier</label>
                  <Combobox
                    name="supplier"
                    options={supplierOpts}
                    defaultValue={formItem?.supplierCode ?? formItem?.supplier ?? ""}
                    placeholder="Supplier"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Invoice No</label>
                  <input
                    name="invoice_no"
                    className="input-box mono"
                    defaultValue={formItem?.invoiceNo ?? ""}
                  />
                </div>
              </div>

              <RowAutoFill watch="line_part" map={partMap} />
              <RowCalc target="line_amount" a="line_qty" b="line_rate" />
              <datalist id="grn-parts">
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
                <table className="mono text-[12px]" style={{ minWidth: 1100 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th style={{ width: 110 }}>Part</th>
                      <th>Description</th>
                      <th style={{ width: 70 }}>Unit</th>
                      <th style={{ width: 80 }}>In Stock</th>
                      <th style={{ width: 90 }}>Qty</th>
                      <th style={{ width: 90 }}>Rate Bill</th>
                      <th style={{ width: 70 }}>Disc %</th>
                      <th style={{ width: 70 }}>Tax %</th>
                      <th style={{ width: 90 }}>Rate</th>
                      <th style={{ width: 110 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: rowsToShow }).map((_, i) => {
                      const l = details[i];
                      const p = l ? partDescByCode.get(l.partCode) : undefined;
                      return (
                        <tr key={l?.id ?? `e-${i}`}>
                          <td className="text-center text-[var(--muted)]">{i + 1}</td>
                          <td>
                            <input
                              name="line_part"
                              list="grn-parts"
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
                              name="line_rate_bill"
                              type="number"
                              step="any"
                              className="input-box mono text-[12px]"
                              defaultValue={l?.rateBill ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="line_disc_per"
                              type="number"
                              step="any"
                              className="input-box mono text-[12px]"
                              defaultValue={l?.discPer ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="line_tax_per"
                              type="number"
                              step="any"
                              className="input-box mono text-[12px]"
                              defaultValue={l?.taxPer ?? ""}
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
                Rate = Rate Bill × (1 − Disc%/100) × (1 + Tax%/100); recomputed on save. Leave Rate Bill empty to enter Rate directly.
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn btn-sm">
                  Save
                </button>
                <a href="/store/grn" className="btn btn-outline btn-sm">
                  Exit
                </a>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-3">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total GRNs</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{fmt.format(totalItems)}</div>
            <div className="stat-label">Total Items</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{fmt.format(Math.round(totalAmount))}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>GRN No.</th>
              <th>Supplier</th>
              <th>Invoice No.</th>
              <th className="text-right">Items</th>
              <th className="text-right">Amount</th>
              <th>Approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-[var(--muted)]">
                  No GRNs found
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isSel = r.id === selected?.id;
                const rowHref = `/store/grn?id=${r.id}`;
                const linkStyle = { color: isSel ? "white" : "inherit" };
                return (
                  <tr
                    key={r.id}
                    className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                  >
                    <td className="mono text-[13px] p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {r.grnDate}
                      </a>
                    </td>
                    <td className="mono text-[13px] p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {r.grnNo}
                      </a>
                    </td>
                    <td className="p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        <div>{r.supplier}</div>
                        {r.supplierCode && (
                          <div className="text-[11px] text-[var(--muted)]">{r.supplierCode}</div>
                        )}
                      </a>
                    </td>
                    <td className="mono text-[13px] p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                        {r.invoiceNo ?? ""}
                      </a>
                    </td>
                    <td className="mono text-[13px] text-right p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1 text-right" style={linkStyle}>
                        {r.itemCount ?? 0}
                      </a>
                    </td>
                    <td className="mono text-[13px] text-right p-0">
                      <a href={rowHref} className="no-underline block px-2 py-1 text-right" style={linkStyle}>
                        {fmt.format(Math.round(r.totalAmount ?? 0))}
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
