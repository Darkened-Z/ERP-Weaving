import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { FindingPicker } from "@/components/finding-picker";
import { AutoAmount } from "@/components/auto-amount";
import { ConfirmButton } from "@/components/confirm-button";
import { ImageAttach } from "@/components/image-attach";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { today as pkToday } from "@/lib/time";
import { assertPeriodOpen } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";

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

const today = () => pkToday();

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

export default async function YarnSalesContractPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string; fparty?: string }>;
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
        .from(schema.extYarnSalContract)
        .where(sql`
          ${schema.extYarnSalContract.contNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnSalContract.partyCode} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnSalContract.countCode} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnSalContract.brand} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extYarnSalContract.broker} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.extYarnSalContract.id))
    : await db
        .select()
        .from(schema.extYarnSalContract)
        .orderBy(desc(schema.extYarnSalContract.id));

  // Party-wise finding, layered on top of the text find.
  const contracts = contractsAll.filter((c) => (!fParty || c.partyCode === fParty));

  const selected = isEditing ? contracts.find((c) => c.id === idParam) ?? null : null;
  const formContract = isAdding ? null : selected;

  const deliveries = formContract
    ? await db
        .select()
        .from(schema.extYarnSalContractDelivery)
        .where(eq(schema.extYarnSalContractDelivery.contractId, formContract.id))
        .orderBy(schema.extYarnSalContractDelivery.id)
    : [];

  const upcomingContNo = nextContNoFromRows(contractsAll, "YSC");
  // LV shows the LAST saved local number (Oracle FRM_LVNO semantics)
  const upcomingLContNo = contractsAll.reduce((m, c) => Math.max(m, c.lContNo ?? 0), 0);

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
      level: schema.chartOfAccounts.level,
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

  const partyOpts = parties.map((p) => ({
    value: String(p.code),
    label: `${p.descShort ?? p.code} — ${p.description}`,
    desc: p.description,
  }));
  // Full-page finding list rows for the Party field (value stays the account code so save keeps working).
  const partyFindRows = parties.map((p) => ({ value: String(p.code), code: String(p.code), description: p.description }));
  const countOpts = countList.map((c) => ({
    value: String(c.code),
    label: `${c.code} — ${c.description}${c.type ? ` ${c.type}` : ""}`,
    desc: c.description,
  }));
  const brandOpts = brandList.map((b) => ({ value: b.name, label: b.name }));
  const partyDescByCode = new Map(parties.map((p) => [String(p.code), p.description]));
  const countDescByCode = new Map(countList.map((c) => [String(c.code), c.description]));

  async function saveContract(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const contDate = ((formData.get("cont_date") as string) || "").trim() || today();
    const expdDate = ((formData.get("expd_date") as string) || "").trim() || null;
    const refno = ((formData.get("refno") as string) || "").trim() || null;
    const partyCode = ((formData.get("party_code") as string) || "").trim() || null;
    const broker = ((formData.get("broker") as string) || "").trim() || null;
    const brokagePercentage = num(formData.get("brokage_percentage"));
    const agePercent = num(formData.get("age_percent"));
    const countCode = ((formData.get("count_code") as string) || "").trim() || null;
    const ratio = ((formData.get("ratio") as string) || "").trim() || null;
    const brand = ((formData.get("brand") as string) || "").trim() || null;
    const qtyBags = num(formData.get("qty_bags"));
    const ratePerLbs = num(formData.get("rate_per_lbs"));
    if (!qtyBags || !ratePerLbs) {
      redirect(`/external/contracts/yarn-sales?error=qty_rate_required`);
    }
    // 1 bag = 100 lbs; rate is per-lbs (Oracle: QTY_BAG * RATE * 100)
    const qtyLbs = qtyBags * 100;
    const amount = Math.round(qtyBags * ratePerLbs * 100 * 100) / 100;
    const days = int(formData.get("days"));
    const remarks = ((formData.get("remarks") as string) || "").trim() || null;
    const img = ((formData.get("img") as string) || "").trim() || null;
    const status = ((formData.get("status") as string) || "R").trim() || "R";

    const delivDates = formData.getAll("delivery_date") as string[];
    const bagsList = formData.getAll("bags") as string[];
    const locs = formData.getAll("ycd_dlv_loc") as string[];

    const validDeliveries: {
      deliveryDate: string | null;
      bags: number | null;
      ycdDlvLoc: string | null;
    }[] = [];

    for (let i = 0; i < delivDates.length; i++) {
      const d = (delivDates[i] || "").trim();
      const b = num(bagsList[i]);
      const l = (locs[i] || "").trim();
      if (!d && b == null && !l) continue;
      validDeliveries.push({
        deliveryDate: d || null,
        bags: b,
        ycdDlvLoc: l || null,
      });
    }

    // Oracle pre-commit: delivery total must stay within ±5% of contract qty
    const dlvTotal = validDeliveries.reduce((s, d) => s + (d.bags ?? 0), 0);
    if (dlvTotal > 0 && (dlvTotal < qtyBags * 0.95 || dlvTotal > qtyBags * 1.05)) {
      redirect(`/external/contracts/yarn-sales?error=qty_tolerance`);
    }

    const nowIso = new Date().toISOString();

    try {
      await assertPeriodOpen(contDate, "INVENTORY");

      if (Number.isFinite(id) && id > 0) {
        await db.transaction(async (tx) => {
          await tx
            .update(schema.extYarnSalContract)
            .set({
              contDate, expdDate, refno, partyCode, broker, brokagePercentage, agePercent,
              countCode, ratio, brand, qtyBags, qtyLbs, ratePerLbs, amount, days, remarks, img, status,
              modifiedDate: nowIso,
            })
            .where(eq(schema.extYarnSalContract.id, id));

          await tx
            .delete(schema.extYarnSalContractDelivery)
            .where(eq(schema.extYarnSalContractDelivery.contractId, id));

          if (validDeliveries.length) {
            await tx
              .insert(schema.extYarnSalContractDelivery)
              .values(validDeliveries.map((d) => ({ ...d, contractId: id })));
          }
        });
        revalidatePath("/external/contracts/yarn-sales");
        redirect(`/external/contracts/yarn-sales?id=${id}`);
      } else {
        const providedContNo = ((formData.get("cont_no") as string) || "").trim();

        let newId = 0;
        let codeExists = false;
        try {
          newId = await db.transaction(async (tx) => {
            const existingRows = await tx
              .select({ contNo: schema.extYarnSalContract.contNo })
              .from(schema.extYarnSalContract);
            const contNo = providedContNo || nextContNoFromRows(existingRows, "YSC");
            const [{ maxL }] = await tx
              .select({ maxL: sql<number>`coalesce(max(${schema.extYarnSalContract.lContNo}), 0)` })
              .from(schema.extYarnSalContract);
            const nextL = maxL + 1;

            const inserted = await tx
              .insert(schema.extYarnSalContract)
              .values({
                contNo, lContNo: nextL, contDate, expdDate, refno, partyCode, broker,
                brokagePercentage, agePercent, countCode, ratio, brand, qtyBags, qtyLbs, ratePerLbs, amount,
                days, remarks, img, status,
                postedDate: nowIso,
              })
              .returning({ id: schema.extYarnSalContract.id });
            const insertedId = inserted[0].id;

            if (validDeliveries.length) {
              await tx
                .insert(schema.extYarnSalContractDelivery)
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
          redirect(`/external/contracts/yarn-sales?error=code_exists`);
        }
        revalidatePath("/external/contracts/yarn-sales");
        redirect(`/external/contracts/yarn-sales?id=${newId}`);
      }
    } catch (e: unknown) {
      const digest = (e as { digest?: string })?.digest ?? "";
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw e;
      const msg = (e as { message?: string })?.message ?? "";
      const m = /Period locked through (\d{4}-\d{2}-\d{2})/.exec(msg);
      if (m) {
        redirect(`/external/contracts/yarn-sales?error=period_locked&thru=${m[1]}`);
      }
      throw e;
    }
  }

  async function deleteContract(formData: FormData) {
    "use server";
    const s = await getSession();
    if (s?.roleName !== "ADMIN") redirect("/external/contracts/yarn-sales?error=admin_only");
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.extYarnSalContractDelivery)
        .where(eq(schema.extYarnSalContractDelivery.contractId, id));
      await tx.delete(schema.extYarnSalContract).where(eq(schema.extYarnSalContract.id, id));
    });
    revalidatePath("/external/contracts/yarn-sales");
    redirect("/external/contracts/yarn-sales");
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
    <Shell active="ext-ysc">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">YARN SALES CONTRACT</h1>
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
            filename="yarn-sales-contracts"
            sheetName="YarnSales"
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
        {params.error === "qty_rate_required" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Qty (Bags) and Rate /Lbs are required.
          </div>
        )}
        {params.error === "qty_tolerance" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Delivery bags total must be within ±5% of contract qty.
          </div>
        )}
        {params.error === "period_locked" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Period locked through {params.thru ?? "?"}. Nothing was saved.
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can delete contracts.
          </div>
        )}

        <form
          id="ysc-find-form"
          method="GET"
          action="/external/contracts/yarn-sales"
          className="hidden"
        ></form>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — YARN SALES CONTRACT"
                : formContract
                ? `Edit — ${formContract.contNo}`
                : "YARN SALES CONTRACT"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/external/contracts/yarn-sales?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <button type="submit" form="ysc-save-form" className="btn btn-sm">
                Save
              </button>
              <PrintButton label="Print" />
              {formContract && (
                <a
                  href={`/external/contracts/yarn-sales/${formContract.id}/print`}
                  target="_blank"
                  className="btn btn-outline btn-sm"
                >
                  Print Contract
                </a>
              )}
              {formContract && (
                <form action={deleteContract} className="inline">
                  <input type="hidden" name="id" value={formContract.id} />
                  <ConfirmButton message="Delete this contract and its deliveries?">
                    Del
                  </ConfirmButton>
                </form>
              )}
              <a href="/external/contracts/yarn-sales" className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          <form id="ysc-save-form" action={saveContract}>
            {formContract && <input type="hidden" name="id" value={formContract.id} />}
            <input type="hidden" name="one" value="1" readOnly />
            <AutoAmount qty="qty_bags" rate="one" target="qty_lbs" factor={100} round={0} />
            <AutoAmount qty="qty_bags" rate="rate_per_lbs" target="amount" factor={100} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-4 gap-y-3 lg:gap-y-4 gform">
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
                    form="ysc-find-form"
                    name="find"
                    className="input-box mono flex-1"
                    defaultValue={params.find ?? ""}
                    placeholder="cont / party / count / brand"
                  />
                  <button form="ysc-find-form" type="submit" className="btn btn-outline btn-sm">
                    Find
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <select
                    form="ysc-find-form"
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
                    <a href="/external/contracts/yarn-sales" className="btn btn-outline btn-sm">Clear</a>
                  )}
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
              <div className="lg:col-span-2">
                <label className="label block mb-1">Party Code</label>
                <FindingPicker name="party_code" defaultValue={String(formContract?.partyCode ?? "")} rows={partyFindRows} title="ACCOUNT — FIND PARTY" placeholder="Select party" className="input-box mono text-[13px] cursor-pointer" />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Party Name</label>
                <input id="ysc-party-desc" className="input-box mono bg-gray-100" readOnly tabIndex={-1} defaultValue={formContract?.partyCode ? partyDescByCode.get(String(formContract.partyCode)) ?? "" : ""} />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">
                  Broaker{" "}
                  <span className="text-[10px] font-normal text-[var(--muted)] normal-case tracking-normal">
                    F9
                  </span>
                </label>
                <Combobox name="broker" options={partyOpts} defaultValue={formContract?.broker ?? ""} placeholder="SARCHC" descTargetId="ysc-broker-desc" />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Broker Name</label>
                <input id="ysc-broker-desc" className="input-box mono bg-gray-100" readOnly tabIndex={-1} defaultValue={formContract?.broker ? partyDescByCode.get(String(formContract.broker)) ?? "" : ""} />
              </div>

              <div className="lg:col-span-3">
                <label className="label block mb-1">Brokage Percentage</label>
                <input
                  name="brokage_percentage"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formContract?.brokagePercentage ?? ""}
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

              <div className="lg:col-span-2">
                <label className="label block mb-1">Count Code</label>
                <Combobox name="count_code" options={countOpts} defaultValue={String(formContract?.countCode ?? "")} placeholder="55" descTargetId="ysc-count-desc" />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Count Desc</label>
                <input id="ysc-count-desc" className="input-box mono bg-gray-100" readOnly tabIndex={-1} defaultValue={formContract?.countCode ? countDescByCode.get(String(formContract.countCode)) ?? "" : ""} />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Ratio</label>
                <input
                  name="ratio"
                  list="ysc-blends"
                  className="input-box mono"
                  defaultValue={formContract?.ratio ?? ""}
                />
                <datalist id="ysc-blends">
                  {blendList.map((b) => (
                    <option key={b.description} value={b.description} />
                  ))}
                </datalist>
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Brand</label>
                <Combobox name="brand" options={brandOpts} defaultValue={formContract?.brand ?? ""} placeholder="Select brand" />
              </div>

              <div className="lg:col-span-3">
                <label className="label block mb-1">Qty (Bags)</label>
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
                  defaultValue={formContract?.qtyLbs ?? ""}
                  readOnly
                />
              </div>
              <div className="lg:col-span-3">
                <label className="label block mb-1">Rate /Lbs</label>
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
                <ImageAttach name="img" defaultValue={formContract?.img ?? ""} />
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
                        <th style={{ width: "30%" }}>Delivery Date</th>
                        <th style={{ width: "25%" }}>Bags</th>
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
              <a href="/external/contracts/yarn-sales" className="btn btn-outline btn-sm">
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
                  <th>Party</th>
                  <th style={{ minWidth: 280 }}>Prd. Desc</th>
                  <th className="text-right">Qty (Lbs)</th>
                  <th className="text-right">Rate</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const isSel = c.id === selected?.id;
                  const href = `/external/contracts/yarn-sales?id=${c.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  const countDesc = c.countCode ? countDescByCode.get(String(c.countCode)) : undefined;
                  const prdDesc = countDesc || c.countCode || null;
                  const prdSub = [c.countCode, c.ratio].filter(Boolean).join(" · ");
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
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.partyCode ?? "-"}
                          {c.partyCode && partyDescByCode.get(String(c.partyCode)) && (
                            <span className="block text-[11px] opacity-70">{partyDescByCode.get(String(c.partyCode))}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]" style={{ minWidth: 280 }}>
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {prdDesc ?? "-"}
                          {countDesc && prdSub && (
                            <span className="block text-[11px] opacity-70 mono">{prdSub}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.qtyLbs)}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.ratePerLbs)}
                        </a>
                      </td>
                      <td className="mono text-[12px] whitespace-nowrap">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.contDate}
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
                      colSpan={7}
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
