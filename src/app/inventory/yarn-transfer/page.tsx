import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { RowClearButton } from "@/components/row-clear-button";
import { Combobox } from "@/components/combobox";
import { AutoFill, RowCalc } from "@/components/auto-fill";
import { AutoAmount } from "@/components/auto-amount";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today, nowTime } from "@/lib/time";
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
const round = (v: number, d: number) => {
  const p = 10 ** d;
  return Math.round(v * p) / p;
};

const ERROR_MESSAGES: Record<string, string> = {
  code_exists: "Voucher number already exists. Try again.",
  qty_required: "Enter Qty Bags or Qty (Lbs) greater than zero.",
  lbs_mismatch: "Header Qty Lbs does not match the carton total. Clear it to auto-fill, or fix the cartons.",
  period_locked: "Period is locked. Cannot save for this date.",
  admin_only: "Only ADMIN can delete vouchers.",
};

export default async function YarnTransferPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string }>;
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

  const lastLvRow = await db
    .select({ maxLv: sql<number>`COALESCE(MAX(${schema.intYarnTransfer.lvNo}), 0)` })
    .from(schema.intYarnTransfer);
  const lastLvNo = lastLvRow[0]?.maxLv ?? 0;

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);

  const countList = await db
    .select({ code: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts)
    .orderBy(schema.yarnCounts.countCode);

  const priorLotsRows = await db
    .selectDistinct({ v: schema.intYarnTransfer.yarnLotNo })
    .from(schema.intYarnTransfer)
    .where(sql`${schema.intYarnTransfer.yarnLotNo} IS NOT NULL AND ${schema.intYarnTransfer.yarnLotNo} <> ''`);
  const priorLots = priorLotsRows.map((r) => r.v).filter((v): v is string => !!v);

  const priorLocFromRows = await db
    .selectDistinct({ v: schema.intYarnTransfer.locationFrom })
    .from(schema.intYarnTransfer)
    .where(sql`${schema.intYarnTransfer.locationFrom} IS NOT NULL AND ${schema.intYarnTransfer.locationFrom} <> ''`);
  const priorLocToRows = await db
    .selectDistinct({ v: schema.intYarnTransfer.locationTo })
    .from(schema.intYarnTransfer)
    .where(sql`${schema.intYarnTransfer.locationTo} IS NOT NULL AND ${schema.intYarnTransfer.locationTo} <> ''`);
  const locSet = new Set<string>();
  for (const r of priorLocFromRows) if (r.v) locSet.add(r.v);
  for (const r of priorLocToRows) if (r.v) locSet.add(r.v);
  const locOpts = Array.from(locSet)
    .sort()
    .map((v) => ({ value: v, label: v }));

  const brandRows = await db
    .select({ name: schema.yarnBrands.name })
    .from(schema.yarnBrands)
    .orderBy(schema.yarnBrands.name);

  const partyOpts = parties.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  const countOpts = countList.map((c) => ({ value: c.code, label: `${c.code} — ${c.description}${c.type ? ' ' + c.type : ''}` }));
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));
  const countDescByCode = new Map(countList.map((c) => [c.code, c.description]));
  const countBrandMap: Record<string, Record<string, string>> = Object.fromEntries(
    countList.map((c) => [c.code, { brand: c.description ?? "" }])
  );

  // AutoFill map: picking a party in Transfer-From copies it to Transfer-To.
  const fromToMap: Record<string, Record<string, string>> = {};
  for (const p of partyOpts) fromToMap[p.value] = { transferToParty: p.value };

  // Server-computed stock for (count, fromParty, fromLocation) on the current voucher.
  let stockBag: number | null = null;
  let stockLbs: number | null = null;
  if (editing && editing.countCode && editing.transferFromParty) {
    const whereClauses = [
      eq(schema.intYarnTransfer.countCode, editing.countCode),
      eq(schema.intYarnTransfer.transferFromParty, editing.transferFromParty),
      ne(schema.intYarnTransfer.id, editing.id),
    ];
    if (editing.locationFrom) {
      whereClauses.push(eq(schema.intYarnTransfer.locationFrom, editing.locationFrom));
    }
    const agg = await db
      .select({
        bags: sql<number>`COALESCE(SUM(${schema.intYarnTransfer.qtyBags}), 0)`,
        lbs: sql<number>`COALESCE(SUM(${schema.intYarnTransfer.qtyLbs}), 0)`,
      })
      .from(schema.intYarnTransfer)
      .where(and(...whereClauses));
    stockBag = agg[0]?.bags ?? 0;
    stockLbs = agg[0]?.lbs ?? 0;
  }

  async function saveAction(formData: FormData) {
    "use server";
    try {
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const isUpdate = Number.isFinite(id) && id > 0;
    const backQ = isUpdate ? `?id=${id}` : `?adding=1`;

    const vDate = txt(formData.get("vDate")) ?? today();
    await assertPeriodOpen(vDate, "INVENTORY");

    const qtyBags = num(formData.get("qtyBags"));
    let qtyLbs = num(formData.get("qtyLbs"));

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
      let nl = num(netLbsArr[i]);
      if (!cn && gk == null && nk == null && nl == null) continue;
      if (nl == null && nk != null) nl = round(nk * 2.2046, 3);
      validLines.push({
        srNo: validLines.length + 1,
        cartonNo: cn || null,
        grossKgs: gk,
        netKgs: nk,
        netLbs: nl,
      });
    }

    const cartonLbsSum = validLines.reduce((s, l) => s + (l.netLbs ?? 0), 0);
    const hasCartons = validLines.some((l) => (l.netLbs ?? 0) > 0);
    if (hasCartons) {
      const rounded = round(cartonLbsSum, 3);
      if (qtyLbs != null && Math.abs(qtyLbs - rounded) > 0.01) {
        redirect(`/inventory/yarn-transfer${backQ}&error=lbs_mismatch`);
      }
      qtyLbs = rounded;
    } else if (qtyLbs == null && qtyBags != null && qtyBags > 0) {
      qtyLbs = round(qtyBags * 100, 2);
    }

    if (!((qtyBags ?? 0) > 0 || (qtyLbs ?? 0) > 0)) {
      redirect(`/inventory/yarn-transfer${backQ}&error=qty_required`);
    }

    const ratePerLbs = num(formData.get("ratePerLbs"));
    // Always recompute amount server-side; ignore any client-submitted value.
    const amount = ratePerLbs != null ? round((qtyLbs ?? 0) * ratePerLbs, 2) : null;

    const header = {
      vDate,
      type: txt(formData.get("type")),
      time: txt(formData.get("time")),
      lvNo: intVal(formData.get("lvNo")),
      condition: txt(formData.get("condition")) ?? "FRS",
      transferFromParty: txt(formData.get("transferFromParty")),
      locationFrom: txt(formData.get("locationFrom")),
      transferToParty: txt(formData.get("transferToParty")),
      locationTo: txt(formData.get("locationTo")),
      // stockBag / stockLbs are display-only, computed on read
      stockBag: null,
      stockLbs: null,
      countCode: txt(formData.get("countCode")),
      qtyBags,
      qtyLbs,
      amount,
      ratePerLbs,
      brand: txt(formData.get("brand")),
      yarnLotNo: txt(formData.get("yarnLotNo")),
      setNo: txt(formData.get("setNo")),
      imgBlock: txt(formData.get("imgBlock")),
      remarks: txt(formData.get("remarks")),
      rkd: num(formData.get("rkd")),
    };

    const nowIso = new Date().toISOString();

    try {
      if (isUpdate) {
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
          const lvRow = await tx
            .select({ maxLv: sql<number>`COALESCE(MAX(${schema.intYarnTransfer.lvNo}), 0)` })
            .from(schema.intYarnTransfer);
          const nextLv = (lvRow[0]?.maxLv ?? 0) + 1;
          const inserted = await tx
            .insert(schema.intYarnTransfer)
            .values({ ...header, lvNo: header.lvNo ?? nextLv, vNo, postedDate: nowIso })
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
        redirect(`/inventory/yarn-transfer${backQ}&error=code_exists`);
      }
      throw e;
    }
    } catch (e) {
      const err = e as { message?: string; digest?: string };
      if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
      const thru = parseLockedThroughFromError(err.message ?? "");
      if (thru) redirect(`/inventory/yarn-transfer?error=period_locked&thru=${thru}`);
      throw e;
    }
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const session = await getSession();
    if (session?.roleName !== "ADMIN") redirect("/inventory/yarn-transfer?error=admin_only");
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.intYarnTransferLine).where(eq(schema.intYarnTransferLine.transferId, id));
      await tx.delete(schema.intYarnTransfer).where(eq(schema.intYarnTransfer.id, id));
    });
    revalidatePath("/inventory/yarn-transfer");
    redirect(`/inventory/yarn-transfer`);
  }

  const ROWS = Math.max(3, lines.length + 3);
  const showForm = !!editing || isAdding;
  const lvDisplay = editing?.lvNo ?? lastLvNo ?? "";
  const displayedStockBag = stockBag ?? editing?.stockBag ?? "";
  const displayedStockLbs = stockLbs ?? editing?.stockLbs ?? "";

  return (
    <Shell active="yarn-transfer">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
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

        {params.error && ERROR_MESSAGES[params.error] && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {ERROR_MESSAGES[params.error]}
            {params.error === "period_locked" && params.thru && (
              <> — locked through <span className="mono">{params.thru}</span></>
            )}
          </div>
        )}

        <datalist id="iyt-lot-list">
          {priorLots.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>

        <datalist id="iyt-brands">
          {brandRows.map((b) => (
            <option key={b.name} value={b.name} />
          ))}
        </datalist>

        <form id="iyt-find-form" method="GET" action="/inventory/yarn-transfer" className="hidden" />

        <div className="border border-black p-4 mb-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New — YARN INTERNAL TRANSFER" : editing ? `Edit — ${editing.vNo}` : "YARN INTERNAL TRANSFER"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/yarn-transfer?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="iyt-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              {editing ? (
                <form action={deleteAction} className="inline">
                  <input type="hidden" name="id" value={editing.id} />
                  <ConfirmButton message="Delete this voucher and its cartons? This cannot be undone.">
                    Delete
                  </ConfirmButton>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled
                  title="Save the voucher first to enable delete"
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Delete
                </button>
              )}
              <a href="/inventory/yarn-transfer" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>

          {showForm && (
            <form id="iyt-save-form" action={saveAction}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <input type="hidden" name="one" defaultValue="1" readOnly />
              <AutoAmount qty="qtyLbs" rate="ratePerLbs" target="amount" />
              <RowCalc target="netLbs" a="netKgs" factor={2.2046} round={3} />
              <AutoFill watch="transferFromParty" map={fromToMap} combos={["transferToParty"]} />
              <AutoFill watch="countCode" map={countBrandMap} inputs={["brand"]} />

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
                        <input name="lvNo" type="number" step="1" className="input-box mono bg-gray-100" defaultValue={lvDisplay} readOnly />
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
                        <input name="time" className="input-box mono" defaultValue={editing?.time ?? nowTime()} />
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
                        <Combobox name="transferFromParty" options={partyOpts} defaultValue={editing?.transferFromParty ?? ""} placeholder="Select party" />
                      </div>
                      <div className="md:col-span-9">
                        <label className="label block mb-1">Location From (GDN)</label>
                        <Combobox name="locationFrom" options={locOpts} defaultValue={editing?.locationFrom ?? ""} placeholder="Type or select location" />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Time</label>
                        <input className="input-box mono" defaultValue={nowTime()} readOnly tabIndex={-1} />
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">TRANSFER TO ( + )</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
                      <div className="md:col-span-12">
                        <label className="label block mb-1">Transfer To (Party)</label>
                        <Combobox name="transferToParty" options={partyOpts} defaultValue={editing?.transferToParty ?? editing?.transferFromParty ?? ""} placeholder="Select party" />
                      </div>
                      <div className="md:col-span-9">
                        <label className="label block mb-1">Location To (GDN)</label>
                        <Combobox name="locationTo" options={locOpts} defaultValue={editing?.locationTo ?? ""} placeholder="Type or select location" />
                      </div>
                      <div className="md:col-span-3">
                        <label className="label block mb-1">Time</label>
                        <input className="input-box mono" defaultValue={nowTime()} readOnly tabIndex={-1} />
                      </div>
                    </div>
                  </div>

                  <div className="border border-black p-4">
                    <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3 text-[var(--muted)]">COUNT-DETAIL</div>
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-3">
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Stock Bage</label>
                        <input type="number" step="0.01" className="input-box mono bg-gray-100 text-right" defaultValue={displayedStockBag} readOnly tabIndex={-1} />
                      </div>
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Stock Lbs</label>
                        <input type="number" step="0.01" className="input-box mono bg-gray-100 text-right" defaultValue={displayedStockLbs} readOnly tabIndex={-1} />
                      </div>

                      <div className="md:col-span-4">
                        <label className="label block mb-1">Count Code (F9)</label>
                        <Combobox name="countCode" options={countOpts} defaultValue={editing?.countCode ?? ""} placeholder="Select count" />
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
                        <input name="amount" type="number" step="0.01" className="input-box mono text-right bg-gray-100" defaultValue={editing?.amount ?? ""} readOnly />
                      </div>
                      <div className="md:col-span-4">
                        <label className="label block mb-1">Brand</label>
                        <input name="brand" list="iyt-brands" className="input-box mono" defaultValue={editing?.brand ?? ""} />
                      </div>

                      <div className="md:col-span-6">
                        <label className="label block mb-1">Yarn Lot # (F9)</label>
                        <input name="yarnLotNo" list="iyt-lot-list" className="input-box mono" defaultValue={editing?.yarnLotNo ?? ""} />
                      </div>
                      <div className="md:col-span-6">
                        <label className="label block mb-1">Set No.</label>
                        <input name="setNo" className="input-box mono" defaultValue={editing?.setNo ?? ""} />
                      </div>

                      <div className="md:col-span-12">
                        <label className="label block mb-1">Imag Block</label>
                        <div className="flex items-stretch gap-1">
                          <input name="imgBlock" className="input-box mono flex-1" defaultValue={editing?.imgBlock ?? ""} placeholder="filename" />
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
                                <td><input name="netLbs" type="number" step="0.001" className="input-box mono text-[12px] text-right bg-gray-50" defaultValue={l?.netLbs ?? ""} /></td>
                                <td className="text-center"><RowClearButton /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="text-[10px] text-[var(--muted)] p-2 border-t border-black">
                      Net Lbs = Net Kgs × 2.2046. Header Qty Lbs is the carton total.
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
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>
                        <div>{r.transferFromParty ?? "-"}</div>
                        {r.transferFromParty && partyCodeByDesc.get(r.transferFromParty) && (
                          <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(r.transferFromParty)}</div>
                        )}
                      </a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>
                        <div>{r.transferToParty ?? "-"}</div>
                        {r.transferToParty && partyCodeByDesc.get(r.transferToParty) && (
                          <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(r.transferToParty)}</div>
                        )}
                      </a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>
                        <div>{r.countCode ?? "-"}</div>
                        {r.countCode && countDescByCode.get(r.countCode) && (
                          <div className="text-[11px] text-[var(--muted)]">{countDescByCode.get(r.countCode)}</div>
                        )}
                      </a></td>
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
