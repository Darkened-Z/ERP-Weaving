import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { FindingPicker } from "@/components/finding-picker";
import { AutoAmount } from "@/components/auto-amount";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today } from "@/lib/time";
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

const ERROR_MESSAGES: Record<string, string> = {
  code_exists: "Contract number already exists. Try again.",
  qty_rate_required: "Qty (Bags) and Rate/Lbs are both required.",
  period_locked: "Period is locked. Cannot save for this date.",
  admin_only: "Only ADMIN can delete contracts.",
};

export default async function IntYarnPurchaseContractPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; fparty?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";

  const findFilter = params.find?.trim();
  const escFind = findFilter?.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = escFind ? `%${escFind}%` : "";
  const fParty = (params.fparty ?? "").trim();

  const contractsAll = findFilter
    ? await db
        .select()
        .from(schema.intYarnPurchaseContract)
        .where(sql`
          ${schema.intYarnPurchaseContract.contNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnPurchaseContract.partyCode} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnPurchaseContract.countCode} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnPurchaseContract.brand} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intYarnPurchaseContract.broker} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intYarnPurchaseContract.id))
    : await db
        .select()
        .from(schema.intYarnPurchaseContract)
        .orderBy(desc(schema.intYarnPurchaseContract.id));

  // Party-wise finding, layered on top of the text find.
  const contracts = contractsAll.filter((c) => (!fParty || c.partyCode === fParty));

  const selected = isEditing ? contracts.find((c) => c.id === idParam) ?? null : null;
  const formContract = isAdding ? null : selected;

  const deliveries = formContract
    ? await db
        .select()
        .from(schema.intYarnPurchaseContractDelivery)
        .where(eq(schema.intYarnPurchaseContractDelivery.contractId, formContract.id))
        .orderBy(schema.intYarnPurchaseContractDelivery.id)
    : [];

  const nextRow = await db
    .select({
      maxN: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 5) AS INTEGER)), 0)`,
    })
    .from(schema.intYarnPurchaseContract);
  const upcomingNumber = (nextRow[0]?.maxN ?? 0) + 1;
  const upcomingContNo = `IYC-${String(upcomingNumber).padStart(4, "0")}`;

  const lRow = await db
    .select({ maxL: sql<number>`coalesce(max(l_cont_no), 0)` })
    .from(schema.intYarnPurchaseContract);
  const maxLContNo = lRow[0]?.maxL ?? 0;

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
    })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);

  const countList = await db
    .select({ code: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts)
    .where(eq(schema.yarnCounts.status, "A"))
    .orderBy(schema.yarnCounts.countCode);

  const brandList = await db
    .select({ name: schema.yarnBrands.name })
    .from(schema.yarnBrands)
    .orderBy(schema.yarnBrands.name);
  const blendList = await db
    .select({ description: schema.yarnBlends.description })
    .from(schema.yarnBlends)
    .orderBy(schema.yarnBlends.description);

  const partyOpts = parties.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  // Full-page finding list rows for the Party field (value stays the description so save keeps working).
  const partyFindRows = parties.map((p) => ({ value: p.description, code: p.code, description: p.description }));
  const countOpts = countList.map((c) => ({ value: c.code, label: `${c.code} — ${c.description}${c.type ? ' ' + c.type : ''}`, desc: c.description }));
  const brandOpts = brandList.map((b) => ({ value: b.name, label: b.name }));
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));
  const countDescByCode = new Map(countList.map((c) => [c.code, c.description]));

  async function saveContract(formData: FormData) {
    "use server";
    try {
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const isUpdate = Number.isFinite(id) && id > 0;
    const backQ = isUpdate ? `?id=${id}` : `?adding=1`;

    const contDate = txt(formData.get("cont_date")) ?? today();
    await assertPeriodOpen(contDate, "INVENTORY");
    const expdDate = txt(formData.get("expd_date"));
    const refno = txt(formData.get("refno"));
    const partyCode = txt(formData.get("party_code"));
    const broker = txt(formData.get("broker"));
    const agePercent = num(formData.get("age_percent"));
    const brokagePerBag = num(formData.get("brokage_per_bag"));
    const countCode = txt(formData.get("count_code"));
    const ratio = txt(formData.get("ratio"));
    const brand = txt(formData.get("brand"));
    const qtyBags = num(formData.get("qty_bags"));
    const ratePerLbs = num(formData.get("rate_per_lbs"));
    if (!((qtyBags ?? 0) > 0) || !((ratePerLbs ?? 0) > 0)) {
      redirect(`/inventory/contracts/yarn-purchase${backQ}&error=qty_rate_required`);
    }
    // 1 bag = 100 lbs; rate is per-lbs (Oracle: QTY_BAG * RATE * 100)
    const qtyLbs = Math.round((qtyBags ?? 0) * 100 * 100) / 100;
    const amount = Math.round((qtyBags ?? 0) * (ratePerLbs ?? 0) * 100 * 100) / 100;
    const remarks = txt(formData.get("remarks"));
    const status = txt(formData.get("status")) ?? "R";
    const deliveryPlace = txt(formData.get("delivery_place"));

    const delivDates = formData.getAll("delivery_date") as string[];
    const bagsList = formData.getAll("delivery_bags") as string[];

    const validDeliveries: {
      deliveryDate: string | null;
      bags: number | null;
    }[] = [];

    for (let i = 0; i < delivDates.length; i++) {
      const d = (delivDates[i] || "").trim();
      const b = num(bagsList[i]);
      if (!d && b == null) continue;
      validDeliveries.push({ deliveryDate: d || null, bags: b });
    }

    const nowIso = new Date().toISOString();

    if (isUpdate) {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.intYarnPurchaseContract)
          .set({
            contDate,
            expdDate,
            refno,
            partyCode,
            broker,
            agePercent,
            brokagePerBag,
            countCode,
            ratio,
            brand,
            qtyBags,
            qtyLbs,
            ratePerLbs,
            deliveryPlace,
            amount,
            remarks,
            status,
            modifiedDate: nowIso,
          })
          .where(eq(schema.intYarnPurchaseContract.id, id));

        await tx
          .delete(schema.intYarnPurchaseContractDelivery)
          .where(eq(schema.intYarnPurchaseContractDelivery.contractId, id));

        if (validDeliveries.length) {
          await tx
            .insert(schema.intYarnPurchaseContractDelivery)
            .values(validDeliveries.map((d) => ({ ...d, contractId: id })));
        }
      });
      revalidatePath("/inventory/contracts/yarn-purchase");
      redirect(`/inventory/contracts/yarn-purchase?id=${id}`);
    } else {
      let newId = 0;
      let codeExists = false;
      try {
        newId = await db.transaction(async (tx) => {
          const row = await tx
            .select({
              maxN: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 5) AS INTEGER)), 0)`,
            })
            .from(schema.intYarnPurchaseContract);
          const nextN = (row[0]?.maxN ?? 0) + 1;
          const contNo = `IYC-${String(nextN).padStart(4, "0")}`;

          const lRowIns = await tx
            .select({ maxL: sql<number>`coalesce(max(l_cont_no), 0)` })
            .from(schema.intYarnPurchaseContract);
          const nextL = (lRowIns[0]?.maxL ?? 0) + 1;

          const inserted = await tx
            .insert(schema.intYarnPurchaseContract)
            .values({
              contNo,
              lContNo: nextL,
              contDate,
              expdDate,
              refno,
              partyCode,
              broker,
              agePercent,
              brokagePerBag,
              countCode,
              ratio,
              brand,
              qtyBags,
              qtyLbs,
              ratePerLbs,
              deliveryPlace,
              amount,
              remarks,
              status,
              postedDate: nowIso,
            })
            .returning({ id: schema.intYarnPurchaseContract.id });
          const insertedId = inserted[0].id;

          if (validDeliveries.length) {
            await tx
              .insert(schema.intYarnPurchaseContractDelivery)
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
        redirect(`/inventory/contracts/yarn-purchase${backQ}&error=code_exists`);
      }
      revalidatePath("/inventory/contracts/yarn-purchase");
      redirect(`/inventory/contracts/yarn-purchase?id=${newId}`);
    }
    } catch (e) {
      const err = e as { message?: string; digest?: string };
      if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
      const thru = parseLockedThroughFromError(err.message ?? "");
      if (thru) redirect(`/inventory/contracts/yarn-purchase?error=period_locked&thru=${thru}`);
      throw e;
    }
  }

  async function deleteContract(formData: FormData) {
    "use server";
    const session = await getSession();
    if (session?.roleName !== "ADMIN") redirect("/inventory/contracts/yarn-purchase?error=admin_only");
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.intYarnPurchaseContractDelivery)
        .where(eq(schema.intYarnPurchaseContractDelivery.contractId, id));
      await tx
        .delete(schema.intYarnPurchaseContract)
        .where(eq(schema.intYarnPurchaseContract.id, id));
    });
    revalidatePath("/inventory/contracts/yarn-purchase");
    redirect("/inventory/contracts/yarn-purchase");
  }

  const statusOptions = [
    { v: "R", l: "R - Running" },
    { v: "C", l: "C - Completed" },
    { v: "F", l: "F - Finished" },
    { v: "X", l: "X - Cancelled" },
  ];

  const gridRowCount = Math.max(12, deliveries.length + 3);
  const gridRows = Array.from({ length: gridRowCount }, (_, i) => deliveries[i] ?? null);

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
    <Shell active="int-c-ypc">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">YARN CONTRACT (WVG)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {contracts.length} contract{contracts.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={contracts.map((c) => ({
              contNo: c.contNo,
              contDate: c.contDate,
              partyCode: c.partyCode,
              broker: c.broker,
              countCode: c.countCode,
              brand: c.brand,
              qtyBags: c.qtyBags,
              ratePerLbs: c.ratePerLbs,
              status: c.status,
            }))}
            columns={[
              { key: "contNo", label: "Cont#" },
              { key: "contDate", label: "Cont Date" },
              { key: "partyCode", label: "Party" },
              { key: "broker", label: "Broker" },
              { key: "countCode", label: "Count Code" },
              { key: "brand", label: "Brand" },
              { key: "qtyBags", label: "Qty Bags" },
              { key: "ratePerLbs", label: "Rate/Lbs" },
              { key: "status", label: "Status" },
            ]}
            filename="int-yarn-contract"
            sheetName="YarnContract"
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

        {params.error && ERROR_MESSAGES[params.error] && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {ERROR_MESSAGES[params.error]}
          </div>
        )}

        <form
          id="iyc-find-form"
          method="GET"
          action="/inventory/contracts/yarn-purchase"
          className="hidden"
        ></form>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — YARN CONTRACT (WVG)"
                : formContract
                ? `Edit — ${formContract.contNo}`
                : "YARN CONTRACT (WVG)"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <button type="submit" form="iyc-save-form" className="btn btn-sm">
                Save
              </button>
              <a href="/inventory/contracts/yarn-purchase?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <PrintButton label="Print" />
              {formContract ? (
                <form action={deleteContract} className="inline">
                  <input type="hidden" name="id" value={formContract.id} />
                  <ConfirmButton message="Delete this contract and its deliveries? This cannot be undone.">
                    Delete
                  </ConfirmButton>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled
                  title="Save the contract first to enable delete"
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Delete
                </button>
              )}
              <a href="/inventory/contracts/yarn-purchase" className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          <form id="iyc-save-form" action={saveContract}>
            {formContract && <input type="hidden" name="id" value={formContract.id} />}
            <input type="hidden" name="one" defaultValue="1" readOnly />
            <AutoAmount qty="qty_bags" rate="one" target="qty_lbs" factor={100} round={0} />
            <AutoAmount qty="qty_bags" rate="rate_per_lbs" target="amount" factor={100} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-4 gap-y-3 gform">
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
                <label className="label block mb-1">Cont.#</label>
                <input
                  name="cont_no_display"
                  className="input-box mono bg-gray-100"
                  defaultValue={formContract?.contNo ?? upcomingContNo}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">LCont No</label>
                <input
                  className="input-box mono bg-gray-100 text-center"
                  defaultValue={formContract?.lContNo ?? maxLContNo}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Find</label>
                <div className="flex gap-2">
                  <input
                    form="iyc-find-form"
                    name="find"
                    className="input-box mono flex-1"
                    defaultValue={params.find ?? ""}
                    placeholder="cont / party / count / brand"
                  />
                  <button form="iyc-find-form" type="submit" className="btn btn-outline btn-sm">
                    Find
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <select
                    form="iyc-find-form"
                    name="fparty"
                    defaultValue={fParty}
                    className="input-box mono text-[13px] flex-1"
                  >
                    <option value="">— All parties —</option>
                    {partyFindRows.map((p) => (
                      <option key={p.value} value={p.value}>{p.code} — {p.description}</option>
                    ))}
                  </select>
                  {(findFilter || fParty) && (
                    <a href="/inventory/contracts/yarn-purchase" className="btn btn-outline btn-sm">Clear</a>
                  )}
                </div>
              </div>

              <div className="lg:col-span-3">
                <label className="label block mb-1">Expd Date</label>
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
                <div className="text-[10px] text-[var(--muted)] mt-1 mono">
                  (R-Running, C-Completed, F-Finished, X-Cancelled)
                </div>
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
                <label className="label block mb-1">Ref No</label>
                <input
                  name="refno"
                  className="input-box mono"
                  defaultValue={formContract?.refno ?? ""}
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Party</label>
                <FindingPicker
                  name="party_code"
                  defaultValue={formContract?.partyCode ?? ""}
                  rows={partyFindRows}
                  title="ACCOUNT — FIND PARTY"
                  placeholder="Select party"
                  className="input-box mono text-[13px] cursor-pointer"
                />
              </div>
              <div className="lg:col-span-5">
                <label className="label block mb-1">Broker</label>
                <Combobox
                  name="broker"
                  options={partyOpts}
                  defaultValue={formContract?.broker ?? ""}
                  placeholder="Select broker"
                />
              </div>

              <div className="lg:col-span-6">
                <label className="label block mb-1">Brokage Per Bag</label>
                <input
                  name="brokage_per_bag"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.brokagePerBag ?? ""}
                />
              </div>
              <div className="lg:col-span-6">
                <label className="label block mb-1">%Age</label>
                <input
                  name="age_percent"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.agePercent ?? ""}
                />
              </div>

              <div className="lg:col-span-4">
                <label className="label block mb-1">Count Code</label>
                <Combobox
                  name="count_code"
                  options={countOpts}
                  defaultValue={formContract?.countCode ?? ""}
                  placeholder="Select count"
                  descTargetId="iyc-count-desc"
                />
                <input
                  id="iyc-count-desc"
                  className="input-box mono text-[11px] bg-gray-100 mt-1"
                  defaultValue={
                    countOpts.find((o) => o.value === (formContract?.countCode ?? ""))?.desc ?? ""
                  }
                  readOnly
                  tabIndex={-1}
                  placeholder="count description"
                />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Ratio</label>
                <input
                  name="ratio"
                  list="iypc-blends"
                  className="input-box mono"
                  defaultValue={formContract?.ratio ?? ""}
                />
                <datalist id="iypc-blends">
                  {blendList.map((b) => (
                    <option key={b.description} value={b.description} />
                  ))}
                </datalist>
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Brand</label>
                <Combobox
                  name="brand"
                  options={brandOpts}
                  defaultValue={formContract?.brand ?? ""}
                  placeholder="Select brand"
                />
              </div>

              <div className="lg:col-span-3">
                <label className="label block mb-1">Qty (Bags) *</label>
                <input
                  name="qty_bags"
                  type="number"
                  step="any"
                  min={0.01}
                  className="input-box mono"
                  defaultValue={formContract?.qtyBags ?? ""}
                  required
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Qty (Lbs)</label>
                <input
                  name="qty_lbs"
                  type="number"
                  step="any"
                  className="input-box mono bg-gray-100"
                  defaultValue={formContract?.qtyLbs ?? formContract?.days ?? ""}
                  readOnly
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Rate Per Lbs *</label>
                <input
                  name="rate_per_lbs"
                  type="number"
                  step="any"
                  min={0.01}
                  className="input-box mono"
                  defaultValue={formContract?.ratePerLbs ?? ""}
                  required
                />
              </div>
              <div className="lg:col-span-3">
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

              <div className="lg:col-span-12 gform-full">
                <label className="label block mb-1">Delivery Place</label>
                <input
                  name="delivery_place"
                  className="input-box"
                  defaultValue={formContract?.deliveryPlace ?? formContract?.img ?? ""}
                />
              </div>
              <div className="lg:col-span-12 gform-full">
                <label className="label block mb-1">Remarks</label>
                <input
                  name="remarks"
                  className="input-box"
                  defaultValue={formContract?.remarks ?? ""}
                />
              </div>
            </div>

            <div className="mt-6">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
                Delivery Schedual
              </div>
              <div className="overflow-x-auto border border-black" style={{ maxWidth: "480px" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "50%" }}>Delivery Date</th>
                      <th style={{ width: "38%" }}>Bags</th>
                      <th style={{ width: "12%" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {gridRows.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            name="delivery_date"
                            type="date"
                            className="input-box mono text-[12px]"
                            defaultValue={row?.deliveryDate ?? ""}
                          />
                        </td>
                        <td>
                          <input
                            name="delivery_bags"
                            type="number"
                            step="any"
                            className="input-box mono text-[12px] text-right"
                            defaultValue={row?.bags ?? ""}
                          />
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="text-[var(--muted)] hover:text-black mono text-[12px]"
                            aria-label="Clear row"
                            title="Clear row"
                          >
                            X
                          </button>
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

            <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
              <button type="submit" className="btn btn-sm">
                Save
              </button>
              <a href="/inventory/contracts/yarn-purchase?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <PrintButton label="Print" />
              <a href="/inventory/contracts/yarn-purchase" className="btn btn-outline btn-sm">
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
                  <th>Cont#</th>
                  <th>Cont Date</th>
                  <th>Party</th>
                  <th>Broker</th>
                  <th>Count Code</th>
                  <th>Brand</th>
                  <th className="text-right">Qty Bags</th>
                  <th className="text-right">Rate/Lbs</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const isSel = c.id === selected?.id;
                  const href = `/inventory/contracts/yarn-purchase?id=${c.id}`;
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
                          <div>{c.partyCode ?? "-"}</div>
                          {c.partyCode && partyCodeByDesc.get(c.partyCode) && (
                            <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(c.partyCode)}</div>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          <div>{c.broker ?? "-"}</div>
                          {c.broker && partyCodeByDesc.get(c.broker) && (
                            <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(c.broker)}</div>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          <div>{c.countCode ?? "-"}</div>
                          {c.countCode && countDescByCode.get(c.countCode) && (
                            <div className="text-[11px] text-[var(--muted)]">{countDescByCode.get(c.countCode)}</div>
                          )}
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
                    <td colSpan={9} className="text-center text-[13px] text-[var(--muted)] py-6">
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
