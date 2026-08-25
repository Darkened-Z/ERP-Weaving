import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { RowAutoFill, RowCalc } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { ApprovalActions, ApprovalBadge } from "@/components/approval-controls";
import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { acc } from "@/lib/gl-accounts";
import { today } from "@/lib/time";
import {
  forwardToAudit as fwdAudit,
  forwardToFinance as fwdFinance,
  revertApproval as revertAppr,
} from "@/lib/approvals";
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

const LINE_ROWS = 4;

const VTYPE = "SV";

async function saveDemand(formData: FormData) {
  "use server";
  try {
  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  const isNew = !Number.isFinite(id);
  const back = isNew ? "?adding=1" : `?id=${id}`;

  const demandDate = txt(formData.get("demand_date")) ?? today();
  await assertPeriodOpen(demandDate, "STORE");
  const department = txt(formData.get("department")) ?? "";
  const requestedBy = txt(formData.get("requested_by"));
  const remarks = txt(formData.get("remarks"));
  if (!department) redirect(`/store/demand${back}`);

  const cc = await db
    .select({ code: schema.costCenters.code })
    .from(schema.costCenters)
    .where(eq(schema.costCenters.description, department))
    .limit(1);
  const ccCode = cc[0] ? String(cc[0].code) : null;

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
    redirect(`/store/demand${back}&error=dup_part`);

  const partRows = codes.length
    ? await db
        .select()
        .from(schema.chartParts)
        .where(inArray(schema.chartParts.code, codes))
    : [];
  if (partRows.length !== codes.length)
    redirect(`/store/demand${back}&error=bad_part`);
  const partByCode = new Map(partRows.map((p) => [p.code, p]));

  const lines = rawLines.map((l) => {
    const rate = r2(l.rate ?? partByCode.get(l.partCode)!.avgCost);
    return { partCode: l.partCode, qty: l.qty, rate, amount: r2(l.qty * rate), ccCode };
  });

  const itemCount = lines.length;
  const totalAmount = r2(lines.reduce((s, l) => s + l.amount, 0));

  const [company] = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.fy ?? "";

  const partsConsumptionAcc = await acc("PARTS_CONSUMPTION");
  const partsStockAcc = await acc("PARTS_STOCK");

  let savedId = isNew ? 0 : id;
  let codeExists = false;
  let shortPart: string | null = null;
  try {
    savedId = await db.transaction(async (tx) => {
      let did: number;
      let demandNoVal: number;
      if (isNew) {
        const [{ maxN }] = await tx
          .select({ maxN: sql<number>`coalesce(max(demand_no), 0)` })
          .from(schema.storeDemands)
          .where(eq(schema.storeDemands.fyCode, fyCode));
        demandNoVal = (maxN ?? 0) + 1;
        const [inserted] = await tx
          .insert(schema.storeDemands)
          .values({
            demandNo: demandNoVal,
            fyCode,
            demandDate,
            department,
            requestedBy,
            itemCount,
            totalAmount,
            remarks,
          })
          .returning({ id: schema.storeDemands.id });
        did = inserted.id;
      } else {
        const [existingRow] = await tx
          .select({ demandNo: schema.storeDemands.demandNo })
          .from(schema.storeDemands)
          .where(eq(schema.storeDemands.id, id))
          .limit(1);
        demandNoVal = existingRow?.demandNo ?? 0;
        const oldLines = await tx
          .select()
          .from(schema.storeDemandDetail)
          .where(eq(schema.storeDemandDetail.demandId, id));
        for (const ol of oldLines) {
          await tx
            .update(schema.chartParts)
            .set({ currentStock: sql`current_stock + ${ol.qty}` })
            .where(eq(schema.chartParts.code, ol.partCode));
        }
        await tx
          .delete(schema.storeDemandDetail)
          .where(eq(schema.storeDemandDetail.demandId, id));
        await tx
          .update(schema.storeDemands)
          .set({ demandDate, department, requestedBy, itemCount, totalAmount, remarks })
          .where(eq(schema.storeDemands.id, id));
        did = id;
      }

      if (lines.length > 0) {
        await tx.insert(schema.storeDemandDetail).values(
          lines.map((l, i) => ({ ...l, demandId: did, srNo: i + 1 }))
        );
      }

      for (const l of lines) {
        const [p] = await tx
          .select()
          .from(schema.chartParts)
          .where(eq(schema.chartParts.code, l.partCode))
          .limit(1);
        if (!p) throw new Error("BAD_PART");
        if (p.currentStock < l.qty) throw new Error(`SHORT:${l.partCode}`);
        await tx
          .update(schema.chartParts)
          .set({ currentStock: p.currentStock - l.qty })
          .where(eq(schema.chartParts.id, p.id));
      }

      await tx
        .delete(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, demandNoVal)
          )
        );
      await tx
        .delete(schema.transMain)
        .where(
          and(
            eq(schema.transMain.vtype, VTYPE),
            eq(schema.transMain.vno, demandNoVal)
          )
        );

      if (totalAmount > 0) {
        const ccInt = ccCode ? parseInt(ccCode, 10) : null;
        const narration = `Dmd#${demandNoVal} ${department}`.trim();
        await tx.insert(schema.transMain).values({
          fyCode,
          vtype: VTYPE,
          vno: demandNoVal,
          vdate: demandDate,
          accCode: partsConsumptionAcc,
          narration,
          balanceAmount: totalAmount,
        });
        const details: (typeof schema.transDetail.$inferInsert)[] = [
          {
            fyCode,
            vtype: VTYPE,
            vno: demandNoVal,
            srno: 1,
            accCode: partsConsumptionAcc,
            partyCode: null,
            ccCode: ccInt,
            narration,
            debit: totalAmount,
            credit: 0,
          },
          {
            fyCode,
            vtype: VTYPE,
            vno: demandNoVal,
            srno: 2,
            accCode: partsStockAcc,
            partyCode: null,
            ccCode: ccInt,
            narration,
            debit: 0,
            credit: totalAmount,
          },
        ];
        const dSum = details.reduce((s, x) => s + (x.debit ?? 0), 0);
        const cSum = details.reduce((s, x) => s + (x.credit ?? 0), 0);
        if (Math.abs(dSum - cSum) >= 0.01) throw new Error("Unbalanced voucher");
        await tx.insert(schema.transDetail).values(details);
      }

      return did;
    });
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? "");
    const short = msg.match(/SHORT:(.+)/);
    if (short) shortPart = short[1];
    else if (/UNIQUE/i.test(msg)) codeExists = true;
    else throw e;
  }

  if (shortPart)
    redirect(
      `/store/demand${back}&error=insufficient_stock&part=${encodeURIComponent(shortPart)}`
    );
  if (codeExists) redirect(`/store/demand${back}&error=code_exists`);

  revalidatePath("/store/demand");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect(`/store/demand?id=${savedId}`);
  } catch (e) {
    const err = e as { message?: string; digest?: string };
    if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
    const thru = parseLockedThroughFromError(err.message ?? "");
    if (thru) redirect(`/store/demand?error=period_locked&thru=${thru}`);
    throw e;
  }
}

async function deleteDemand(formData: FormData) {
  "use server";
  const s = await getSession();
  if (s?.roleName !== "ADMIN") redirect("/store/demand?error=admin_only");
  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;

  const [existing] = await db
    .select({
      approvalStatus: schema.storeDemands.approvalStatus,
      demandNo: schema.storeDemands.demandNo,
    })
    .from(schema.storeDemands)
    .where(eq(schema.storeDemands.id, id))
    .limit(1);
  if (existing?.approvalStatus === "POSTED") {
    redirect("/store/demand?error=posted_delete_warn");
  }
  const demandNoVal = existing?.demandNo ?? 0;

  await db.transaction(async (tx) => {
    if (demandNoVal) {
      await tx
        .delete(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, demandNoVal)
          )
        );
      await tx
        .delete(schema.transMain)
        .where(
          and(
            eq(schema.transMain.vtype, VTYPE),
            eq(schema.transMain.vno, demandNoVal)
          )
        );
    }
    const oldLines = await tx
      .select()
      .from(schema.storeDemandDetail)
      .where(eq(schema.storeDemandDetail.demandId, id));
    for (const ol of oldLines) {
      await tx
        .update(schema.chartParts)
        .set({ currentStock: sql`current_stock + ${ol.qty}` })
        .where(eq(schema.chartParts.code, ol.partCode));
    }
    await tx
      .delete(schema.storeDemandDetail)
      .where(eq(schema.storeDemandDetail.demandId, id));
    await tx.delete(schema.storeDemands).where(eq(schema.storeDemands.id, id));
  });

  revalidatePath("/store/demand");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect("/store/demand");
}

async function deletePostedDemand(formData: FormData) {
  "use server";
  const s = await getSession();
  if (s?.roleName !== "ADMIN") redirect("/store/demand?error=admin_only");
  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;

  const [existing] = await db
    .select({ demandNo: schema.storeDemands.demandNo })
    .from(schema.storeDemands)
    .where(eq(schema.storeDemands.id, id))
    .limit(1);
  const demandNoVal = existing?.demandNo ?? 0;

  await db.transaction(async (tx) => {
    if (demandNoVal) {
      await tx
        .delete(schema.transDetail)
        .where(
          and(
            eq(schema.transDetail.vtype, VTYPE),
            eq(schema.transDetail.vno, demandNoVal)
          )
        );
      await tx
        .delete(schema.transMain)
        .where(
          and(
            eq(schema.transMain.vtype, VTYPE),
            eq(schema.transMain.vno, demandNoVal)
          )
        );
    }
    const oldLines = await tx
      .select()
      .from(schema.storeDemandDetail)
      .where(eq(schema.storeDemandDetail.demandId, id));
    for (const ol of oldLines) {
      await tx
        .update(schema.chartParts)
        .set({ currentStock: sql`current_stock + ${ol.qty}` })
        .where(eq(schema.chartParts.code, ol.partCode));
    }
    await tx
      .delete(schema.storeDemandDetail)
      .where(eq(schema.storeDemandDetail.demandId, id));
    await tx.delete(schema.storeDemands).where(eq(schema.storeDemands.id, id));
  });

  revalidatePath("/store/demand");
  revalidatePath("/store/parts");
  revalidatePath("/store/stock");
  redirect("/store/demand");
}

async function demandForwardAudit(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (Number.isFinite(id)) await fwdAudit("demand", id);
}
async function demandForwardFinance(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (Number.isFinite(id)) await fwdFinance("demand", id);
}
async function demandRevert(formData: FormData) {
  "use server";
  const id = parseInt(formData.get("id") as string, 10);
  if (Number.isFinite(id)) await revertAppr("demand", id);
}

export default async function DemandPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    adding?: string;
    error?: string;
    part?: string;
    thru?: string;
  }>;
}) {
  const params = await searchParams;
  const isAdding = params.adding === "1";
  const session = await getSession();
  const role = session?.roleName;

  const rows = await db
    .select()
    .from(schema.storeDemands)
    .orderBy(sql`demand_date DESC, id DESC`);

  const selectedId = params.id ? parseInt(params.id, 10) : NaN;
  const selected = Number.isFinite(selectedId)
    ? rows.find((r) => r.id === selectedId) ?? null
    : null;
  const formItem = isAdding ? null : selected;
  const showForm = isAdding || !!formItem;

  const details = formItem
    ? await db
        .select()
        .from(schema.storeDemandDetail)
        .where(eq(schema.storeDemandDetail.demandId, formItem.id))
        .orderBy(schema.storeDemandDetail.srNo)
    : [];

  const [company] = await db
    .select({ fy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.fy ?? "";

  const [{ maxN }] = await db
    .select({ maxN: sql<number>`coalesce(max(demand_no), 0)` })
    .from(schema.storeDemands)
    .where(eq(schema.storeDemands.fyCode, fyCode));
  const nextDemandNo = (maxN ?? 0) + 1;

  const costCenters = await db
    .select()
    .from(schema.costCenters)
    .orderBy(schema.costCenters.code);
  const departmentOpts = costCenters.map((c) => ({
    value: c.description,
    label: `${c.code} — ${c.description}`,
  }));
  const ccCodeByDesc = new Map(costCenters.map((c) => [c.description, String(c.code)]));

  const requesters = [
    ...new Set(rows.map((r) => r.requestedBy).filter(Boolean)),
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
  const pending = rows.filter((r) => r.status === "P").length;
  const approved = rows.filter((r) => r.status === "A").length;
  const totalAmount = rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0);

  return (
    <Shell active="demand">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <h1 className="page-title">
            Demand Notes{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
          <a href="/store/demand?adding=1" className="btn btn-sm">
            New Demand
          </a>
        </div>

        {params.error === "insufficient_stock" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Insufficient stock for part {params.part ?? ""}
            {params.part && partByCode.get(params.part)
              ? ` — ${partByCode.get(params.part)!.description} (in stock: ${fmt.format(partByCode.get(params.part)!.currentStock)})`
              : ""}
            . Nothing was saved.
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
        {params.error === "code_exists" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Demand No already exists. Try saving again.
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
            Only ADMIN users can delete demand notes.
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
            This demand is POSTED to Finance. Revert the approval first — deleting it now would leave orphan GL entries.
          </div>
        )}

        {showForm && (
          <div className="border border-black p-4 mb-3">
            <div className="flex flex-wrap items-center justify-between mb-4 pb-2 border-b border-black gap-2">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                {formItem
                  ? `Edit Demand — ${formItem.demandNo}/${formItem.fyCode}`
                  : "New Demand"}
              </div>
              {formItem && (
                <ApprovalActions
                  kind="demand"
                  id={formItem.id}
                  status={formItem.approvalStatus}
                  role={role}
                  forwardAudit={demandForwardAudit}
                  forwardFinance={demandForwardFinance}
                  revert={demandRevert}
                />
              )}
              <div className="flex gap-2">
                <a href="/store/demand?adding=1" className="btn btn-outline btn-sm">
                  New
                </a>
                {formItem && formItem.approvalStatus !== "POSTED" && (
                  <form action={deleteDemand} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message="Delete this demand? Issued stock will be restored.">
                      Del
                    </ConfirmButton>
                  </form>
                )}
                {formItem && formItem.approvalStatus === "POSTED" && role === "ADMIN" && (
                  <form action={deletePostedDemand} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message="This demand is POSTED. Deleting will reverse stock AND require manual reversal of GL entries. Continue?">
                      Del (POSTED)
                    </ConfirmButton>
                  </form>
                )}
              </div>
            </div>

            <form action={saveDemand}>
              {formItem && <input type="hidden" name="id" value={formItem.id} />}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Demand No</label>
                  <input
                    className="input-box mono bg-gray-100"
                    defaultValue={formItem?.demandNo ?? nextDemandNo}
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
                    name="demand_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formItem?.demandDate ?? today()}
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
                  <label className="label block mb-1">Requested By</label>
                  <input
                    name="requested_by"
                    list="demand-requesters"
                    className="input-box"
                    defaultValue={formItem?.requestedBy ?? ""}
                  />
                  <datalist id="demand-requesters">
                    {requesters.map((r) => (
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
              <datalist id="demand-parts">
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
                              list="demand-parts"
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
                Rate defaults to the part&apos;s average cost. Issue quantity cannot exceed current stock.
              </div>

              <div className="flex gap-2">
                <button type="submit" className="btn btn-sm">
                  Save
                </button>
                <a href="/store/demand" className="btn btn-outline btn-sm">
                  Exit
                </a>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-3">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total Demands</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{pending}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{approved}</div>
            <div className="stat-label">Approved</div>
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
              <th>Demand No.</th>
              <th>Department</th>
              <th>Requested By</th>
              <th className="text-right">Items</th>
              <th className="text-right">Amount</th>
              <th>Status</th>
              <th>Approval</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-[var(--muted)]">
                  No demand notes found
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isSel = r.id === selected?.id;
                const href = `/store/demand?id=${r.id}`;
                const linkStyle = { color: isSel ? "white" : "inherit" };
                return (
                  <tr
                    key={r.id}
                    className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                  >
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.demandDate}
                      </a>
                    </td>
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {r.demandNo}
                      </a>
                    </td>
                    <td>
                      <a href={href} className="no-underline block" style={linkStyle}>
                        <div>{r.department}</div>
                        {r.department && ccCodeByDesc.get(r.department) && (
                          <div className="text-[11px] text-[var(--muted)]">{ccCodeByDesc.get(r.department)}</div>
                        )}
                      </a>
                    </td>
                    <td>{r.requestedBy ?? ""}</td>
                    <td className="mono text-[13px] text-right">
                      {r.itemCount ?? 0}
                    </td>
                    <td className="mono text-[13px] text-right">
                      {fmt.format(Math.round(r.totalAmount ?? 0))}
                    </td>
                    <td>
                      <span
                        className="inline-block border px-2 py-0.5 text-[11px] font-bold uppercase"
                        style={{
                          background: r.status === "P" ? "#000" : "transparent",
                          color: r.status === "P" ? "#fff" : "#000",
                          borderColor: "#000",
                        }}
                      >
                        {r.status === "P" ? "PENDING" : "APPROVED"}
                      </span>
                    </td>
                    <td>
                      <ApprovalBadge status={r.approvalStatus} />
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
