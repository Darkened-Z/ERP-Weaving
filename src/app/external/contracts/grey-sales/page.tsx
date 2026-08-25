import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { AutoAmount } from "@/components/auto-amount";
import { Combobox } from "@/components/combobox";
import { ConfirmButton } from "@/components/confirm-button";
import { ImageAttach } from "@/components/image-attach";
import { db, schema } from "@/db";
import { eq, or, sql } from "drizzle-orm";
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

const WEAVE_OPTIONS = ["1/1", "PLAIN", "TWILL", "SATIN", "DRILL"] as const;

const STATUS_OPTIONS = [
  { value: "R", label: "R - Running" },
  { value: "C", label: "C - Completed" },
  { value: "F", label: "F - Finished" },
  { value: "X", label: "X - Cancelled" },
];

const DELIVERY_PARSE_MAX = 50;
const DELIVERY_EMPTY_MIN = 4;

export default async function GreySalesContractPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string }>;
}) {
  const params = await searchParams;
  const isAdding = params.adding === "1";
  const findFilter = params.find?.trim();
  const escFind = findFilter?.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = `%${escFind ?? ""}%`;

  const contracts = findFilter
    ? await db
        .select()
        .from(schema.extGreySalContract)
        .where(
          or(
            sql`${schema.extGreySalContract.contractNo} LIKE ${pat} ESCAPE '\\'`,
            sql`${schema.extGreySalContract.party} LIKE ${pat} ESCAPE '\\'`,
            sql`${schema.extGreySalContract.greyCode} LIKE ${pat} ESCAPE '\\'`
          )
        )
        .orderBy(sql`contract_date DESC, id DESC`)
    : await db
        .select()
        .from(schema.extGreySalContract)
        .orderBy(sql`contract_date DESC, id DESC`);

  const selectedId = params.id ? parseInt(params.id, 10) : NaN;
  const selected = Number.isFinite(selectedId)
    ? contracts.find((c) => c.id === selectedId) ?? null
    : null;
  const formItem = isAdding ? null : selected;

  const deliveries = formItem
    ? await db
        .select()
        .from(schema.extGreySalContractDelivery)
        .where(eq(schema.extGreySalContractDelivery.contractId, formItem.id))
        .orderBy(schema.extGreySalContractDelivery.id)
    : [];

  const today = new Date().toISOString().slice(0, 10);

  const nextContractNo = (() => {
    const maxN = contracts.reduce((max, c) => {
      const m = c.contractNo?.match(/^GSC-(\d+)$/);
      if (!m) return max;
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `GSC-${String(maxN + 1).padStart(4, "0")}`;
  })();

  const lastLContNo = contracts.reduce(
    (max, c) => (c.lContNo && c.lContNo > max ? c.lContNo : max),
    0
  );

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 4`)
    .orderBy(schema.chartOfAccounts.description);
  const greyList = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction)
    .where(eq(schema.greyConstruction.status, "A"))
    .orderBy(schema.greyConstruction.code);

  // Short code (HAMIDAN) is the visible token; full name is the helper description.
  const partyOpts = parties.map((p) => ({
    value: p.description,
    label: `${p.descShort ?? p.code} — ${p.description}`,
    desc: p.description,
  }));
  const partyDescByShort: Record<string, string> = {};
  for (const p of parties) if (p.descShort) partyDescByShort[p.descShort] = p.description;
  const greyOpts = greyList.map((g) => ({ value: g.code, label: `${g.code} — ${g.description}`, desc: g.description }));
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));
  const greyDescByCode = new Map(greyList.map((g) => [g.code, g.description]));

  async function saveContract(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const isNew = !Number.isFinite(id);

    let contractNo = (formData.get("contract_no") as string)?.trim();
    if (isNew || !contractNo) {
      const [{ maxN }] = await db
        .select({
          maxN: sql<number>`coalesce(max(CAST(SUBSTR(contract_no, 5) AS INTEGER)), 0)`,
        })
        .from(schema.extGreySalContract);
      contractNo = `GSC-${String((maxN ?? 0) + 1).padStart(4, "0")}`;
    }

    const contractDate = (formData.get("contract_date") as string)?.trim() || today;
    const expDate = (formData.get("exp_date") as string)?.trim() || null;
    const partyRefNo = (formData.get("party_ref_no") as string)?.trim() || null;
    const party = (formData.get("party") as string)?.trim() || null;
    const broker = (formData.get("broker") as string)?.trim() || null;
    const brokagPerBag = num(formData.get("brokag_per_bag"));
    const perMtr = num(formData.get("per_mtr"));
    const greyCode = (formData.get("grey_code") as string)?.trim() || null;
    const weave = (formData.get("weave") as string)?.trim() || null;
    const salvage = (formData.get("salvage") as string)?.trim() || null;
    const quantityMtr = num(formData.get("quantity_mtr"));
    const ratePerMtr = num(formData.get("rate_per_mtr"));
    const extMtr = num(formData.get("ext_mtr"));
    const amount = ((quantityMtr ?? 0) + (extMtr ?? 0)) * (ratePerMtr ?? 0);
    const extDate = (formData.get("ext_date") as string)?.trim() || null;
    const gstRate = num(formData.get("gst_rate"));
    const days = intVal(formData.get("days"));
    const img = (formData.get("img") as string)?.trim() || null;
    const specialInst = (formData.get("special_inst") as string)?.trim() || null;
    const paymentTerm = (formData.get("payment_term") as string)?.trim() || null;
    const deliveryTerm = (formData.get("delivery_term") as string)?.trim() || null;
    const remarks = (formData.get("remarks") as string)?.trim() || null;
    const status = (formData.get("status") as string)?.trim() || "R";
    const nowIso = new Date().toISOString();

    const data = {
      contractNo,
      contractDate,
      expDate,
      partyRefNo,
      party,
      broker,
      brokagPerBag,
      perMtr,
      greyCode,
      weave,
      salvage,
      quantityMtr,
      ratePerMtr,
      amount,
      days,
      specialInst,
      paymentTerm,
      deliveryTerm,
      remarks,
      extMtr,
      extDate,
      gstRate,
      img,
      status,
      modifiedDate: nowIso,
    };

    const deliveryRows: {
      deliveryDate: string | null;
      meters: number | null;
      location: string | null;
    }[] = [];
    for (let i = 0; i < DELIVERY_PARSE_MAX; i++) {
      const d = (formData.get(`del_date_${i}`) as string)?.trim() || null;
      const m = num(formData.get(`del_meters_${i}`));
      const loc = (formData.get(`del_location_${i}`) as string)?.trim() || null;
      if (d || m !== null || loc) {
        deliveryRows.push({ deliveryDate: d, meters: m, location: loc });
      }
    }

    const errQ = (slug: string) =>
      Number.isFinite(id) ? `?id=${id}&error=${slug}` : `?adding=1&error=${slug}`;

    if (quantityMtr == null || quantityMtr <= 0 || ratePerMtr == null || ratePerMtr <= 0) {
      redirect("/external/contracts/grey-sales" + errQ("qty_rate_required"));
    }

    const totalQty = (quantityMtr ?? 0) + (extMtr ?? 0);
    const deliveryTotal = deliveryRows.reduce((s, d) => s + (d.meters ?? 0), 0);
    if (deliveryTotal > 0 && Math.abs(deliveryTotal - totalQty) > totalQty * 0.05) {
      redirect("/external/contracts/grey-sales" + errQ("qty_tolerance"));
    }

    let contractId: number | null = Number.isFinite(id) ? id : null;
    let uniqueError = false;

    try {
      contractId = await db.transaction(async (tx) => {
        let cid: number | null = Number.isFinite(id) ? id : null;
        if (isNew) {
          const [{ maxL }] = await tx
            .select({
              maxL: sql<number>`coalesce(max(l_cont_no), 0)`,
            })
            .from(schema.extGreySalContract);
          const [inserted] = await tx
            .insert(schema.extGreySalContract)
            .values({
              ...data,
              lContNo: (maxL ?? 0) + 1,
              postedDate: nowIso,
            })
            .returning({ id: schema.extGreySalContract.id });
          cid = inserted.id;
        } else {
          await tx
            .update(schema.extGreySalContract)
            .set(data)
            .where(eq(schema.extGreySalContract.id, id));
        }

        if (cid) {
          await tx
            .delete(schema.extGreySalContractDelivery)
            .where(eq(schema.extGreySalContractDelivery.contractId, cid));

          if (deliveryRows.length > 0) {
            await tx.insert(schema.extGreySalContractDelivery).values(
              deliveryRows.map((d) => ({ ...d, contractId: cid as number }))
            );
          }
        }

        return cid;
      });
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? "");
      const errCode = String((e as { code?: string })?.code ?? "");
      if (msg.includes("UNIQUE") || errCode === "SQLITE_CONSTRAINT_UNIQUE") {
        uniqueError = true;
      } else {
        throw e;
      }
    }

    if (uniqueError) {
      const q = Number.isFinite(id)
        ? `?id=${id}&error=code_exists`
        : `?adding=1&error=code_exists`;
      redirect("/external/contracts/grey-sales" + q);
    }

    revalidatePath("/external/contracts/grey-sales");
    redirect(`/external/contracts/grey-sales?id=${contractId}`);
  }

  async function deleteContract(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;

    await db.transaction(async (tx) => {
      await tx
        .delete(schema.extGreySalContractDelivery)
        .where(eq(schema.extGreySalContractDelivery.contractId, id));
      await tx.delete(schema.extGreySalContract).where(eq(schema.extGreySalContract.id, id));
    });

    revalidatePath("/external/contracts/grey-sales");
    redirect("/external/contracts/grey-sales");
  }

  async function deleteDeliveryRow(formData: FormData) {
    "use server";
    const deleteId = parseInt(formData.get("delete_delivery_id") as string, 10);
    const contractId = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(deleteId) || !Number.isFinite(contractId)) return;

    await db
      .delete(schema.extGreySalContractDelivery)
      .where(eq(schema.extGreySalContractDelivery.id, deleteId));

    revalidatePath("/external/contracts/grey-sales");
    redirect(`/external/contracts/grey-sales?id=${contractId}`);
  }

  const emptyRows = DELIVERY_EMPTY_MIN;
  const totalDeliveryRows = deliveries.length + emptyRows;

  const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  const statusBadge = (s: string | null) => {
    const map: Record<string, { bg: string; fg: string; label: string }> = {
      R: { bg: "black", fg: "white", label: "R" },
      C: { bg: "transparent", fg: "black", label: "C" },
      F: { bg: "transparent", fg: "black", label: "F" },
      X: { bg: "transparent", fg: "var(--muted)", label: "X" },
    };
    const v = map[s ?? ""] ?? { bg: "transparent", fg: "black", label: s ?? "-" };
    return (
      <span
        className="inline-block text-[11px] px-2 py-0.5 uppercase mono"
        style={{
          letterSpacing: "0.05em",
          background: v.bg,
          color: v.fg,
          border: "1px solid black",
        }}
      >
        {v.label}
      </span>
    );
  };

  return (
    <Shell active="ext-gsc">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">GRAY SALES CONTRACT</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {contracts.length} contracts
            </p>
          </div>
          <ExcelExportButton
            rows={contracts}
            columns={[
              { key: "contractNo", label: "Contract No" },
              { key: "party", label: "Party" },
              { key: "greyCode", label: "Grey Code" },
              { key: "weave", label: "Weave" },
              { key: "quantityMtr", label: "Qty Mtr" },
              { key: "ratePerMtr", label: "Rate/Mtr" },
              { key: "amount", label: "Amount" },
              { key: "status", label: "Status" },
            ]}
            filename="grey-sales-contracts"
            sheetName="GreySalContracts"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Contract No already exists. Choose a different code.
          </div>
        )}
        {params.error === "qty_rate_required" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Quantity (Mtr) and Rate / Mtr are required and must be greater than zero.
          </div>
        )}
        {params.error === "qty_tolerance" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Delivery schedule total must be within ±5% of contract quantity plus ext meters.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 mb-8">
          <div className="border border-black p-4">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-black">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                {isAdding ? "New Contract" : formItem ? `Edit Contract - ${formItem.contractNo}` : "New Contract"}
              </div>
              <div className="flex gap-2">
                <a href="/external/contracts/grey-sales?adding=1" className="btn btn-outline btn-sm">New</a>
                {formItem && (
                  <form action={deleteContract} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message="Delete this contract and its delivery schedule? This cannot be undone.">Del</ConfirmButton>
                  </form>
                )}
              </div>
            </div>

            <form action={saveContract}>
              {formItem && <input type="hidden" name="id" value={formItem.id} />}

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Contract Date</label>
                  <input
                    name="contract_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formItem?.contractDate ?? today}
                    required
                  />
                </div>
                <div>
                  <label className="label block mb-1">Contract No</label>
                  <input
                    name="contract_no"
                    className="input-box mono"
                    defaultValue={formItem?.contractNo ?? nextContractNo}
                    readOnly={!!formItem}
                    placeholder="GSC-####"
                  />
                </div>
                <div>
                  <label className="label block mb-1">LCont.No</label>
                  <input
                    className="input-box mono bg-gray-100"
                    defaultValue={formItem?.lContNo ?? lastLContNo}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Find</label>
                  <input
                    className="input-box"
                    placeholder="Use Brows panel"
                    defaultValue=""
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Exp. Date</label>
                  <input
                    name="exp_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formItem?.expDate ?? ""}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Status</label>
                  <select name="status" className="input-box" defaultValue={formItem?.status ?? "R"}>
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Posted</label>
                  <input
                    className="input-box mono bg-gray-100 text-[12px]"
                    defaultValue={formItem?.postedDate?.slice(0, 10) ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Modified</label>
                  <input
                    className="input-box mono bg-gray-100 text-[12px]"
                    defaultValue={formItem?.modifiedDate?.slice(0, 10) ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Party Ref. No</label>
                  <input
                    name="party_ref_no"
                    className="input-box mono"
                    defaultValue={formItem?.partyRefNo ?? ""}
                  />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Party</label>
                  <Combobox name="party" options={partyOpts} defaultValue={formItem?.party ?? ""} placeholder="Select party" className="input-box" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div className="col-span-4">
                  <label className="label block mb-1">
                    Broaker <span className="text-[9px] font-normal">(F9)</span>
                  </label>
                  <Combobox name="broker" options={partyOpts} defaultValue={formItem?.broker ?? ""} placeholder="Select broker" className="input-box" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Brokag Per / Bag</label>
                  <input
                    name="brokag_per_bag"
                    type="number"
                    step="any"
                    className="input-box mono"
                    defaultValue={formItem?.brokagPerBag ?? ""}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Per Mtr</label>
                  <input
                    name="per_mtr"
                    type="number"
                    step="any"
                    className="input-box mono"
                    defaultValue={formItem?.perMtr ?? ""}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Grey Code</label>
                  <Combobox
                    name="grey_code"
                    options={greyOpts}
                    defaultValue={formItem?.greyCode ?? ""}
                    placeholder="Select grey code"
                    descTargetId="gsc-grey-desc"
                  />
                </div>
                <div>
                  <label className="label block mb-1">Construction</label>
                  <input
                    id="gsc-grey-desc"
                    className="input-box bg-gray-100 text-[12px]"
                    defaultValue={greyList.find((g) => g.code === formItem?.greyCode)?.description ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Weave</label>
                  <select name="weave" className="input-box" defaultValue={formItem?.weave ?? "1/1"}>
                    <option value="">--</option>
                    {WEAVE_OPTIONS.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                    {formItem?.weave && !WEAVE_OPTIONS.includes(formItem.weave as typeof WEAVE_OPTIONS[number]) && (
                      <option value={formItem.weave}>{formItem.weave}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Salvage</label>
                  <input
                    name="salvage"
                    className="input-box"
                    defaultValue={formItem?.salvage ?? ""}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Quantity (Mtr)</label>
                  <input
                    name="quantity_mtr"
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    className="input-box mono"
                    defaultValue={formItem?.quantityMtr ?? ""}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Rate / Mtr</label>
                  <input
                    name="rate_per_mtr"
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    className="input-box mono"
                    defaultValue={formItem?.ratePerMtr ?? ""}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Amount</label>
                  <input
                    name="amount"
                    type="number"
                    step="any"
                    className="input-box mono bg-gray-100"
                    defaultValue={formItem?.amount ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              </div>
              <AutoAmount qty="quantity_mtr" qty2="ext_mtr" rate="rate_per_mtr" target="amount" />

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="label block mb-1">Ext. (Mtr)</label>
                  <input
                    name="ext_mtr"
                    type="number"
                    step="any"
                    className="input-box mono"
                    defaultValue={formItem?.extMtr ?? ""}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Ext. Date</label>
                  <input
                    name="ext_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formItem?.extDate ?? ""}
                  />
                </div>
                <div>
                  <label className="label block mb-1">GST Rate</label>
                  <input
                    name="gst_rate"
                    type="number"
                    step="any"
                    className="input-box mono"
                    defaultValue={formItem?.gstRate ?? ""}
                  />
                </div>
                <div>
                  <label className="label block mb-1">Days</label>
                  <input
                    name="days"
                    type="number"
                    step="1"
                    className="input-box mono"
                    defaultValue={formItem?.days ?? ""}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="label block mb-1">Special Inst.</label>
                <input
                  name="special_inst"
                  className="input-box"
                  defaultValue={formItem?.specialInst ?? ""}
                />
              </div>

              <div className="mb-3">
                <label className="label block mb-1">Payment Term</label>
                <input
                  name="payment_term"
                  className="input-box"
                  defaultValue={formItem?.paymentTerm ?? ""}
                />
              </div>

              <div className="mb-3">
                <label className="label block mb-1">Delivery Term</label>
                <input
                  name="delivery_term"
                  className="input-box"
                  defaultValue={formItem?.deliveryTerm ?? ""}
                />
              </div>

              <div className="mb-3">
                <label className="label block mb-1">Evidence Photo</label>
                <ImageAttach name="img" defaultValue={formItem?.img} />
              </div>

              <div className="mb-4">
                <label className="label block mb-1">Remarks</label>
                <input
                  name="remarks"
                  className="input-box"
                  defaultValue={formItem?.remarks ?? ""}
                />
              </div>

              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 mt-6 border-b border-black pb-1">
                Delivery Schesual
              </div>

              <div className="overflow-x-auto mb-4">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>#</th>
                      <th>Date</th>
                      <th>Meters</th>
                      <th>Location</th>
                      <th style={{ width: "60px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map((d, i) => (
                      <tr key={`d-${d.id}`}>
                        <td className="mono text-[12px] text-[var(--muted)]">{i + 1}</td>
                        <td>
                          <input
                            name={`del_date_${i}`}
                            type="date"
                            className="input-box mono text-[13px]"
                            defaultValue={d.deliveryDate ?? ""}
                          />
                        </td>
                        <td>
                          <input
                            name={`del_meters_${i}`}
                            type="number"
                            step="any"
                            className="input-box mono text-[13px]"
                            defaultValue={d.meters ?? ""}
                          />
                        </td>
                        <td>
                          <input
                            name={`del_location_${i}`}
                            className="input-box text-[13px]"
                            defaultValue={d.location ?? ""}
                          />
                        </td>
                        <td>
                          <button
                            type="submit"
                            formAction={deleteDeliveryRow}
                            name="delete_delivery_id"
                            value={d.id}
                            className="btn btn-outline btn-sm"
                            title="Delete row"
                          >
                            X
                          </button>
                        </td>
                      </tr>
                    ))}
                    {Array.from({ length: emptyRows }).map((_, i) => {
                      const idx = deliveries.length + i;
                      return (
                        <tr key={`e-${idx}`}>
                          <td className="mono text-[12px] text-[var(--muted)]">{idx + 1}</td>
                          <td>
                            <input
                              name={`del_date_${idx}`}
                              type="date"
                              className="input-box mono text-[13px]"
                              defaultValue=""
                            />
                          </td>
                          <td>
                            <input
                              name={`del_meters_${idx}`}
                              type="number"
                              step="any"
                              className="input-box mono text-[13px]"
                              defaultValue=""
                            />
                          </td>
                          <td>
                            <input
                              name={`del_location_${idx}`}
                              className="input-box text-[13px]"
                              defaultValue=""
                            />
                          </td>
                          <td className="text-[12px] text-[var(--muted)] text-center">-</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={5} className="text-[11px] text-[var(--muted)] mono">
                        {deliveries.length} saved, {totalDeliveryRows - deliveries.length} empty
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex items-end gap-2 mt-4 flex-wrap">
                <button type="submit" className="btn btn-sm">Save</button>
                <a href="/external/contracts/grey-sales?adding=1" className="btn btn-outline btn-sm">New</a>
                <PrintButton />
                <a href="/external/contracts/grey-sales" className="btn btn-outline btn-sm">Exit</a>
                <div className="ml-auto">
                  <label className="label block mb-1">Alt-S Password</label>
                  <input className="input-box mono" placeholder="password" type="password" />
                </div>
              </div>
            </form>
          </div>

          <div className="border border-black p-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2 pb-2 border-b border-black">
              Brows
            </div>
            <form method="GET" className="mb-3 flex gap-2">
              <input
                name="find"
                className="input-box text-[13px] flex-1"
                placeholder="Search..."
                defaultValue={findFilter ?? ""}
              />
              <button type="submit" className="btn btn-sm">Go</button>
            </form>
            <div className="overflow-y-auto scrollbar-thin" style={{ maxHeight: "60vh" }}>
              {contracts.length === 0 && (
                <div className="text-[12px] text-[var(--muted)] italic py-2">No contracts</div>
              )}
              {contracts.slice(0, 100).map((c) => {
                const isSel = c.id === selected?.id;
                return (
                  <a
                    key={c.id}
                    href={`/external/contracts/grey-sales?id=${c.id}`}
                    className="block no-underline border-b border-gray-200 px-2 py-2"
                    style={{
                      background: isSel ? "black" : "transparent",
                      color: isSel ? "white" : "inherit",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="mono text-[12px] font-bold">{c.contractNo}</div>
                      <div className="text-[10px]" style={{ color: isSel ? "white" : "var(--muted)" }}>
                        {c.contractDate}
                      </div>
                    </div>
                    <div className="text-[11px] truncate">
                      {c.party ?? "-"}
                      {c.party && partyCodeByDesc.get(c.party) ? ` (${partyCodeByDesc.get(c.party)})` : ""}
                    </div>
                    <div className="text-[10px] mono" style={{ color: isSel ? "white" : "var(--muted)" }}>
                      {c.greyCode ?? "-"}
                      {c.greyCode && greyDescByCode.get(c.greyCode) ? ` — ${greyDescByCode.get(c.greyCode)}` : ""}
                      {c.weave ? " / " + c.weave : ""}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Contract No</th>
                <th>Party</th>
                <th>Grey Code</th>
                <th>Weave</th>
                <th className="text-right">Qty Mtr</th>
                <th className="text-right">Rate/Mtr</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const isSel = c.id === selected?.id;
                const href = `/external/contracts/grey-sales?id=${c.id}`;
                const linkStyle = { color: isSel ? "white" : "inherit" };
                return (
                  <tr key={c.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                    <td className="mono font-bold">
                      <a href={href} className="no-underline block" style={linkStyle}>{c.contractNo}</a>
                    </td>
                    <td className="text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {c.party ?? "-"}
                        {c.party && partyCodeByDesc.get(c.party) && (
                          <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(c.party)}</span>
                        )}
                      </a>
                    </td>
                    <td className="mono text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {c.greyCode ?? "-"}
                        {c.greyCode && greyDescByCode.get(c.greyCode) && (
                          <span className="block text-[11px] opacity-70">{greyDescByCode.get(c.greyCode)}</span>
                        )}
                      </a>
                    </td>
                    <td className="text-[13px]">
                      <a href={href} className="no-underline block" style={linkStyle}>{c.weave ?? "-"}</a>
                    </td>
                    <td className="text-right mono">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {c.quantityMtr != null ? fmt(c.quantityMtr) : "-"}
                      </a>
                    </td>
                    <td className="text-right mono">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {c.ratePerMtr != null ? fmt(c.ratePerMtr) : "-"}
                      </a>
                    </td>
                    <td className="text-right mono font-bold">
                      <a href={href} className="no-underline block" style={linkStyle}>
                        {c.amount != null ? fmt(c.amount) : "-"}
                      </a>
                    </td>
                    <td>
                      <a href={href} className="no-underline block" style={linkStyle}>{statusBadge(c.status)}</a>
                    </td>
                  </tr>
                );
              })}
              {contracts.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)]">No contracts found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
