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

const int = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v as string, 10);
  return Number.isFinite(n) ? n : null;
};

const today = () => new Date().toISOString().slice(0, 10);

function nextContNoFromRows(rows: { contNo: string }[], prefix: string): string {
  const nums = rows
    .map((r) => {
      const m = r.contNo?.match(new RegExp("^" + prefix + "-(\\d+)$"));
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + "-" + String(next).padStart(5, "0");
}

export default async function YarnPurchaseContractPage({
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

  const contracts = findFilter
    ? await db
        .select()
        .from(schema.extYarnPurContract)
        .where(sql`
          ${schema.extYarnPurContract.contNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnPurContract.partyCode} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnPurContract.countCode} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnPurContract.brand} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnPurContract.broker} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.extYarnPurContract.id))
    : await db
        .select()
        .from(schema.extYarnPurContract)
        .orderBy(desc(schema.extYarnPurContract.id));

  const selected = isEditing ? contracts.find((c) => c.id === idParam) ?? null : null;
  const formContract = isAdding ? null : selected;

  const deliveries = formContract
    ? await db
        .select()
        .from(schema.extYarnPurContractDelivery)
        .where(eq(schema.extYarnPurContractDelivery.contractId, formContract.id))
        .orderBy(schema.extYarnPurContractDelivery.id)
    : [];

  const upcomingContNo = nextContNoFromRows(contracts, "YPC");
  const upcomingLContNo = contracts.length + 1;

  async function saveContract(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const contDate = ((formData.get("cont_date") as string) || "").trim() || today();
    const expdDate = ((formData.get("expd_date") as string) || "").trim() || null;
    const refno = ((formData.get("refno") as string) || "").trim() || null;
    const partyCode = ((formData.get("party_code") as string) || "").trim() || null;
    const broker = ((formData.get("broker") as string) || "").trim() || null;
    const agePercent = num(formData.get("age_percent"));
    const brokagePerBag = num(formData.get("brokage_per_bag"));
    const countCode = ((formData.get("count_code") as string) || "").trim() || null;
    const ratio = ((formData.get("ratio") as string) || "").trim() || null;
    const brand = ((formData.get("brand") as string) || "").trim() || null;
    const qtyBags = num(formData.get("qty_bags"));
    const ratePerLbs = num(formData.get("rate_per_lbs"));
    const amount = (qtyBags ?? 0) * (ratePerLbs ?? 0);
    const days = int(formData.get("days"));
    const remarks = ((formData.get("remarks") as string) || "").trim() || null;
    const img = ((formData.get("img") as string) || "").trim() || null;
    const status = ((formData.get("status") as string) || "R").trim() || "R";

    const delivDates = formData.getAll("delivery_date") as string[];
    const doNos = formData.getAll("do_no") as string[];
    const bagsList = formData.getAll("bags") as string[];
    const locs = formData.getAll("ycd_dlv_loc") as string[];

    const validDeliveries: {
      deliveryDate: string | null;
      doNo: string | null;
      bags: number | null;
      ycdDlvLoc: string | null;
    }[] = [];

    for (let i = 0; i < delivDates.length; i++) {
      const d = (delivDates[i] || "").trim();
      const dn = (doNos[i] || "").trim();
      const b = num(bagsList[i]);
      const l = (locs[i] || "").trim();
      if (!d && !dn && b == null && !l) continue;
      validDeliveries.push({
        deliveryDate: d || null,
        doNo: dn || null,
        bags: b,
        ycdDlvLoc: l || null,
      });
    }

    const nowIso = new Date().toISOString();

    if (Number.isFinite(id) && id > 0) {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.extYarnPurContract)
          .set({
            contDate, expdDate, refno, partyCode, broker, agePercent, brokagePerBag,
            countCode, ratio, brand, qtyBags, ratePerLbs, amount, days, remarks, img, status,
            modifiedDate: nowIso,
          })
          .where(eq(schema.extYarnPurContract.id, id));

        await tx
          .delete(schema.extYarnPurContractDelivery)
          .where(eq(schema.extYarnPurContractDelivery.contractId, id));

        if (validDeliveries.length) {
          await tx
            .insert(schema.extYarnPurContractDelivery)
            .values(validDeliveries.map((d) => ({ ...d, contractId: id })));
        }
      });
      revalidatePath("/external/contracts/yarn-purchase");
      redirect(`/external/contracts/yarn-purchase?id=${id}`);
    } else {
      const providedContNo = ((formData.get("cont_no") as string) || "").trim();

      let newId = 0;
      let codeExists = false;
      try {
        newId = await db.transaction(async (tx) => {
          const existingRows = await tx
            .select({ contNo: schema.extYarnPurContract.contNo })
            .from(schema.extYarnPurContract);
          const contNo = providedContNo || nextContNoFromRows(existingRows, "YPC");
          const nextL = existingRows.length + 1;

          const inserted = await tx
            .insert(schema.extYarnPurContract)
            .values({
              contNo, lContNo: nextL, contDate, expdDate, refno, partyCode, broker,
              agePercent, brokagePerBag, countCode, ratio, brand, qtyBags, ratePerLbs, amount,
              days, remarks, img, status,
              postedDate: nowIso,
            })
            .returning({ id: schema.extYarnPurContract.id });
          const insertedId = inserted[0].id;

          if (validDeliveries.length) {
            await tx
              .insert(schema.extYarnPurContractDelivery)
              .values(validDeliveries.map((d) => ({ ...d, contractId: insertedId })));
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
        redirect(`/external/contracts/yarn-purchase?error=code_exists`);
      }
      revalidatePath("/external/contracts/yarn-purchase");
      redirect(`/external/contracts/yarn-purchase?id=${newId}`);
    }
  }

  async function deleteContract(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.extYarnPurContractDelivery)
        .where(eq(schema.extYarnPurContractDelivery.contractId, id));
      await tx.delete(schema.extYarnPurContract).where(eq(schema.extYarnPurContract.id, id));
    });
    revalidatePath("/external/contracts/yarn-purchase");
    redirect("/external/contracts/yarn-purchase");
  }

  const statusOptions = [
    { v: "R", l: "R - Running" },
    { v: "C", l: "C - Completed" },
    { v: "F", l: "F - Finished" },
    { v: "X", l: "X - Cancelled" },
  ];

  const emptySlotCount = Math.max(8 - deliveries.length, 3);
  const emptySlots = Array.from({ length: emptySlotCount }, (_, i) => i);

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const totals = contracts.reduce(
    (a, c) => {
      a.bags += c.qtyBags ?? 0;
      a.amt += c.amount ?? 0;
      return a;
    },
    { bags: 0, amt: 0 }
  );

  return (
    <Shell active="ext-ypc">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">YARN PURCHASE CONTRACT</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {contracts.length} contract{contracts.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={contracts.map((c) => ({
              contNo: c.contNo,
              partyCode: c.partyCode,
              broker: c.broker,
              countCode: c.countCode,
              brand: c.brand,
              qtyBags: c.qtyBags,
              ratePerLbs: c.ratePerLbs,
              amount: c.amount,
              status: c.status,
            }))}
            columns={[
              { key: "contNo", label: "Cont No" },
              { key: "partyCode", label: "Party" },
              { key: "broker", label: "Broaker" },
              { key: "countCode", label: "Count" },
              { key: "brand", label: "Brand" },
              { key: "qtyBags", label: "Qty Bags" },
              { key: "ratePerLbs", label: "Rate/Lbs" },
              { key: "amount", label: "Amount" },
              { key: "status", label: "Status" },
            ]}
            filename="yarn-purchase-contracts"
            sheetName="YarnPurchase"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-6">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{contracts.length}</div>
            <div className="stat-label">Total Contracts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{formatNum(totals.bags)}</div>
            <div className="stat-label">Total Qty Bags</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{formatNum(totals.amt)}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Contract number already exists. Try again.
          </div>
        )}

        <form
          id="ypc-find-form"
          method="GET"
          action="/external/contracts/yarn-purchase"
          className="hidden"
        ></form>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — YARN PURCHASE CONTRACT"
                : formContract
                ? `Edit — ${formContract.contNo}`
                : "YARN PURCHASE CONTRACT"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/external/contracts/yarn-purchase?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <button type="submit" form="ypc-save-form" className="btn btn-sm">
                Save
              </button>
              <PrintButton label="Print" />
              {formContract && (
                <form action={deleteContract} className="inline">
                  <input type="hidden" name="id" value={formContract.id} />
                  <button type="submit" className="btn btn-outline btn-sm">
                    Del
                  </button>
                </form>
              )}
              <a href="/external/contracts/yarn-purchase" className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          <form id="ypc-save-form" action={saveContract}>
            {formContract && <input type="hidden" name="id" value={formContract.id} />}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-4 gap-y-3 lg:gap-y-4">
              <div className="lg:col-span-3">
                <label className="label block mb-1">Cont. Date</label>
                <input
                  name="cont_date"
                  type="date"
                  className="input-box mono"
                  defaultValue={formContract?.contDate ?? today()}
                  required
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Cont. No</label>
                <input
                  name="cont_no"
                  className="input-box mono bg-gray-100"
                  defaultValue={formContract?.contNo ?? upcomingContNo}
                  readOnly
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">LCont.No</label>
                <input
                  className="input-box mono bg-gray-100 text-center"
                  defaultValue={formContract?.lContNo ?? upcomingLContNo}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Find</label>
                <div className="flex gap-2">
                  <input
                    form="ypc-find-form"
                    name="find"
                    className="input-box mono flex-1"
                    defaultValue={params.find ?? ""}
                    placeholder="cont / party / count / brand"
                  />
                  <button form="ypc-find-form" type="submit" className="btn btn-outline btn-sm">
                    Find
                  </button>
                </div>
              </div>

              <div className="lg:col-span-3">
                <label className="label block mb-1">Expd Dte</label>
                <input
                  name="expd_date"
                  type="date"
                  className="input-box mono"
                  defaultValue={formContract?.expdDate ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Status</label>
                <select
                  name="status"
                  className="input-box"
                  defaultValue={formContract?.status ?? "R"}
                >
                  {statusOptions.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Posted</label>
                <input
                  className="input-box mono bg-gray-100 text-[12px]"
                  defaultValue={formContract?.postedDate?.slice(0, 10) ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Modified</label>
                <input
                  className="input-box mono bg-gray-100 text-[12px]"
                  defaultValue={formContract?.modifiedDate?.slice(0, 10) ?? ""}
                  readOnly
                  tabIndex={-1}
                />
              </div>

              <div className="lg:col-span-3">
                <label className="label block mb-1">Refno</label>
                <input
                  name="refno"
                  className="input-box mono"
                  defaultValue={formContract?.refno ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Party Code</label>
                <input
                  name="party_code"
                  className="input-box mono"
                  defaultValue={formContract?.partyCode ?? ""}
                />
              </div>
              <div className="lg:col-span-5">
                <label className="label block mb-1">
                  Broaker{" "}
                  <span className="text-[10px] font-normal text-[var(--muted)] normal-case tracking-normal">
                    F9
                  </span>
                </label>
                <input
                  name="broker"
                  className="input-box mono"
                  defaultValue={formContract?.broker ?? ""}
                />
              </div>

              <div className="lg:col-span-3">
                <label className="label block mb-1">%Age</label>
                <input
                  name="age_percent"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.agePercent ?? ""}
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Brokage Per Bage</label>
                <input
                  name="brokage_per_bag"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.brokagePerBag ?? ""}
                />
              </div>

              <div className="lg:col-span-4">
                <label className="label block mb-1">Count Code</label>
                <input
                  name="count_code"
                  className="input-box mono"
                  defaultValue={formContract?.countCode ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Ratio</label>
                <input
                  name="ratio"
                  className="input-box mono"
                  defaultValue={formContract?.ratio ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Brand</label>
                <input
                  name="brand"
                  className="input-box mono"
                  defaultValue={formContract?.brand ?? ""}
                />
              </div>

              <div className="lg:col-span-4">
                <label className="label block mb-1">Qty (Bags)</label>
                <input
                  name="qty_bags"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.qtyBags ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Rate /Lbs</label>
                <input
                  name="rate_per_lbs"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.ratePerLbs ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Amount</label>
                <input
                  name="amount"
                  type="number"
                  step="any"
                  className="input-box mono bg-gray-100"
                  defaultValue={formContract?.amount ?? ""}
                  readOnly
                />
              </div>

              <div className="lg:col-span-2">
                <label className="label block mb-1">Days</label>
                <input
                  name="days"
                  type="number"
                  step="1"
                  className="input-box mono"
                  defaultValue={formContract?.days ?? ""}
                />
              </div>
              <div className="lg:col-span-8">
                <label className="label block mb-1">Remarks</label>
                <input
                  name="remarks"
                  className="input-box"
                  defaultValue={formContract?.remarks ?? ""}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Img</label>
                <input
                  name="img"
                  className="input-box mono"
                  defaultValue={formContract?.img ?? ""}
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                  Delivery Schedual
                </div>
                <div className="overflow-x-auto border border-black">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "22%" }}>Delivery Date</th>
                        <th style={{ width: "25%" }}>DO #</th>
                        <th style={{ width: "18%" }}>Bags</th>
                        <th>Ycd Dlv Loc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((d) => (
                        <tr key={d.id}>
                          <td>
                            <input
                              name="delivery_date"
                              type="date"
                              className="input-box mono text-[12px]"
                              defaultValue={d.deliveryDate ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="do_no"
                              className="input-box mono text-[12px]"
                              defaultValue={d.doNo ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="bags"
                              type="number"
                              step="any"
                              className="input-box mono text-[12px]"
                              defaultValue={d.bags ?? ""}
                            />
                          </td>
                          <td>
                            <input
                              name="ycd_dlv_loc"
                              className="input-box mono text-[12px]"
                              defaultValue={d.ycdDlvLoc ?? ""}
                            />
                          </td>
                        </tr>
                      ))}
                      {emptySlots.map((i) => (
                        <tr key={`e-${i}`}>
                          <td>
                            <input
                              name="delivery_date"
                              type="date"
                              className="input-box mono text-[12px]"
                            />
                          </td>
                          <td>
                            <input name="do_no" className="input-box mono text-[12px]" />
                          </td>
                          <td>
                            <input
                              name="bags"
                              type="number"
                              step="any"
                              className="input-box mono text-[12px]"
                            />
                          </td>
                          <td>
                            <input name="ycd_dlv_loc" className="input-box mono text-[12px]" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-2">
                  Empty rows are ignored on save. On update, delivery lines are replaced with the current grid.
                </div>
              </div>

              <div className="lg:col-span-1">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                  Brows
                </div>
                <div className="border border-[var(--border-light)] p-3 text-[11px] text-[var(--muted)] mono min-h-[140px]">
                  {formContract ? (
                    <div>
                      <div className="mb-1">Contract: {formContract.contNo}</div>
                      <div className="mb-1">Lines: {deliveries.length}</div>
                      <div className="text-[10px]">── placeholder ──</div>
                    </div>
                  ) : (
                    <div className="text-[10px]">── placeholder ──</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
              <button type="submit" className="btn btn-sm">
                Save
              </button>
              <a href="/external/contracts/yarn-purchase" className="btn btn-outline btn-sm">
                Exit
              </a>
              <div className="ml-auto">
                <label className="label block mb-1">Alt-S Password</label>
                <input className="input-box mono" placeholder="password" type="password" />
              </div>
            </div>
          </form>
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            Contracts
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Cont. No</th>
                  <th>Date</th>
                  <th>Party</th>
                  <th>Count</th>
                  <th>Brand</th>
                  <th className="text-right">Qty Bags</th>
                  <th className="text-right">Rate/Lbs</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const isSel = c.id === selected?.id;
                  const href = `/external/contracts/yarn-purchase?id=${c.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr
                      key={c.id}
                      className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                    >
                      <td className="mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.contNo}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.contDate}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.partyCode ?? "-"}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.countCode ?? "-"}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.brand ?? "-"}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.qtyBags)}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.ratePerLbs)}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px] font-bold">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.amount)}
                        </a>
                      </td>
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.status}
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {contracts.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="text-center text-[13px] text-[var(--muted)] py-6"
                    >
                      No contracts. Click <b>New</b> above to create one.
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
