import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { ConfirmButton } from "@/components/confirm-button";
import { BeamWtCalc } from "@/components/int-conv-calc";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const DETAIL_ROWS = 6;

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

const today = () => new Date().toISOString().slice(0, 10);

const ERROR_MESSAGES: Record<string, string> = {
  code_exists: "Contract number already exists. Try again.",
  wt_zero: "Detail rows present but computed WT is zero. Fix Cal Count / Ends / No. of Width.",
};

export default async function BeamContractExtWsPage({
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
        .from(schema.intBeamContractExtWs)
        .where(sql`
          ${schema.intBeamContractExtWs.contNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intBeamContractExtWs.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intBeamContractExtWs.sizingParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intBeamContractExtWs.warpingParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intBeamContractExtWs.converterParty} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intBeamContractExtWs.id))
    : await db
        .select()
        .from(schema.intBeamContractExtWs)
        .orderBy(desc(schema.intBeamContractExtWs.id));

  const selected = isEditing ? contracts.find((c) => c.id === idParam) ?? null : null;
  const formContract = isAdding ? null : selected;

  const detailRows = formContract
    ? await db
        .select()
        .from(schema.intBeamContractExtWsDetail)
        .where(eq(schema.intBeamContractExtWsDetail.contractId, formContract.id))
        .orderBy(schema.intBeamContractExtWsDetail.srNo)
    : [];

  const detailGrid = Array.from({ length: DETAIL_ROWS }, (_, i) => detailRows.find((r) => r.srNo === i + 1) ?? null);

  const nextRow = await db
    .select({
      maxN: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 6) AS INTEGER)), 0)`,
    })
    .from(schema.intBeamContractExtWs);
  const upcomingNumber = (nextRow[0]?.maxN ?? 0) + 1;
  const upcomingContNo = `IBWS-${String(upcomingNumber).padStart(4, "0")}`;

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
    })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 4`)
    .orderBy(schema.chartOfAccounts.description);

  const countList = await db
    .select({ code: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts)
    .orderBy(schema.yarnCounts.countCode);

  const greyList = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction)
    .orderBy(schema.greyConstruction.code);

  const productList = await db
    .select({ code: schema.products.code, description: schema.products.description })
    .from(schema.products)
    .orderBy(schema.products.description);

  const partyOpts = parties.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  const greyOpts = greyList.map((g) => ({ value: g.code, label: `${g.code} — ${g.description}` }));
  const productOpts = productList.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));

  async function saveContract(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const isUpdate = Number.isFinite(id) && id > 0;
    const backQ = isUpdate ? `?id=${id}` : `?adding=1`;

    const contDate = txt(formData.get("cont_date")) ?? today();
    const expDate = txt(formData.get("exp_date"));
    const sizingParty = txt(formData.get("sizing_party"));
    const warpingParty = txt(formData.get("warping_party"));
    const party = txt(formData.get("party"));
    const converterParty = txt(formData.get("converter_party"));
    const wrpCode = txt(formData.get("wrp_code"));
    const noOfWidthRaw = num(formData.get("no_of_width"));
    const noOfWidth = noOfWidthRaw ?? 1;
    const prdCode = txt(formData.get("prd_code"));
    const vtype = txt(formData.get("vtype"));
    const ratePerBeam = num(formData.get("rate_per_beam"));
    const terms = txt(formData.get("terms"));
    const remarks = txt(formData.get("remarks"));
    const status = txt(formData.get("status")) ?? "R";

    // Detail rows — 6 fixed slots
    const detailParsed: {
      srNo: number;
      countCode: string | null;
      brand: string | null;
      calCount: number | null;
      ends: number | null;
      wtPerMtr: number;
    }[] = [];
    const widthDiv = noOfWidth > 0 ? noOfWidth : 1;
    for (let i = 1; i <= DETAIL_ROWS; i++) {
      const countCode = txt(formData.get(`d_count_code_${i}`));
      const brand = txt(formData.get(`d_brand_${i}`));
      const calCount = num(formData.get(`d_cal_count_${i}`));
      const ends = num(formData.get(`d_ends_${i}`));
      if (!countCode && !brand && calCount == null && ends == null) continue;
      const wtPerMtr =
        calCount && calCount > 0
          ? round((((ends ?? 0) * 1.0936) / 840 / calCount) / widthDiv, 6)
          : 0;
      detailParsed.push({
        srNo: detailParsed.length + 1,
        countCode,
        brand,
        calCount,
        ends,
        wtPerMtr,
      });
    }

    const headerEnds = round(detailParsed.reduce((s, r) => s + (r.ends ?? 0), 0), 2);
    const headerWtPerMtr = round(detailParsed.reduce((s, r) => s + r.wtPerMtr, 0), 6);

    if (detailParsed.length > 0 && headerWtPerMtr <= 0) {
      redirect(`/inventory/contracts/beam-ext-ws${backQ}&error=wt_zero`);
    }

    const nowIso = new Date().toISOString();

    const headerVals = {
      contDate,
      expDate,
      sizingParty,
      warpingParty,
      party,
      converterParty,
      wrpCode,
      noOfWidth,
      prdCode,
      vtype,
      ends: headerEnds || null,
      wtPerMtr: headerWtPerMtr || null,
      ratePerBeam,
      terms,
      remarks,
      status,
    };

    if (isUpdate) {
      await db.transaction(async (tx) => {
        await tx
          .update(schema.intBeamContractExtWs)
          .set({ ...headerVals, modifiedDate: nowIso })
          .where(eq(schema.intBeamContractExtWs.id, id));
        await tx
          .delete(schema.intBeamContractExtWsDetail)
          .where(eq(schema.intBeamContractExtWsDetail.contractId, id));
        if (detailParsed.length) {
          await tx
            .insert(schema.intBeamContractExtWsDetail)
            .values(detailParsed.map((d) => ({ contractId: id, ...d })));
        }
      });
      revalidatePath("/inventory/contracts/beam-ext-ws");
      redirect(`/inventory/contracts/beam-ext-ws?id=${id}`);
    } else {
      let newId = 0;
      let codeExists = false;
      try {
        newId = await db.transaction(async (tx) => {
          const row = await tx
            .select({
              maxN: sql<number>`coalesce(max(CAST(SUBSTR(cont_no, 6) AS INTEGER)), 0)`,
            })
            .from(schema.intBeamContractExtWs);
          const nextN = (row[0]?.maxN ?? 0) + 1;
          const contNo = `IBWS-${String(nextN).padStart(4, "0")}`;

          const inserted = await tx
            .insert(schema.intBeamContractExtWs)
            .values({
              contNo,
              ...headerVals,
              postedDate: nowIso,
            })
            .returning({ id: schema.intBeamContractExtWs.id });
          const insertedId = inserted[0].id;

          if (detailParsed.length) {
            await tx
              .insert(schema.intBeamContractExtWsDetail)
              .values(detailParsed.map((d) => ({ contractId: insertedId, ...d })));
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
        redirect(`/inventory/contracts/beam-ext-ws${backQ}&error=code_exists`);
      }
      revalidatePath("/inventory/contracts/beam-ext-ws");
      redirect(`/inventory/contracts/beam-ext-ws?id=${newId}`);
    }
  }

  async function deleteContract(formData: FormData) {
    "use server";
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      await tx
        .delete(schema.intBeamContractExtWsDetail)
        .where(eq(schema.intBeamContractExtWsDetail.contractId, id));
      await tx
        .delete(schema.intBeamContractExtWs)
        .where(eq(schema.intBeamContractExtWs.id, id));
    });
    revalidatePath("/inventory/contracts/beam-ext-ws");
    redirect("/inventory/contracts/beam-ext-ws");
  }

  const statusOptions = [
    { v: "R", l: "R - Running" },
    { v: "C", l: "C - Completed" },
    { v: "F", l: "F - Finished" },
    { v: "X", l: "X - Cancelled" },
  ];

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const showForm = !!formContract || isAdding;
  const gridCellCls = "input-box mono text-[12px]";
  const gridCellNumCls = "input-box mono text-[12px] text-right";
  const gridCellCalcCls = "input-box mono text-[12px] text-right bg-gray-100";

  return (
    <Shell active="int-c-bews">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Beam Contract External Warping / Sizing</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {contracts.length} contract{contracts.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={contracts.map((c) => ({
              contNo: c.contNo,
              contDate: c.contDate,
              expDate: c.expDate,
              party: c.party,
              sizingParty: c.sizingParty,
              warpingParty: c.warpingParty,
              converterParty: c.converterParty,
              wrpCode: c.wrpCode,
              noOfWidth: c.noOfWidth,
              ends: c.ends,
              wtPerMtr: c.wtPerMtr,
              ratePerBeam: c.ratePerBeam,
              status: c.status,
            }))}
            columns={[
              { key: "contNo", label: "Cont#" },
              { key: "contDate", label: "Cont Date" },
              { key: "expDate", label: "Exp Date" },
              { key: "party", label: "Party" },
              { key: "sizingParty", label: "Sizing Party" },
              { key: "warpingParty", label: "Warping Party" },
              { key: "converterParty", label: "Converter Party" },
              { key: "wrpCode", label: "WRP Code" },
              { key: "noOfWidth", label: "No.Width" },
              { key: "ends", label: "Ends" },
              { key: "wtPerMtr", label: "WT/Mtr" },
              { key: "ratePerBeam", label: "Rate/Beam" },
              { key: "status", label: "Status" },
            ]}
            filename="int-beam-contract-ext-ws"
            sheetName="BeamContractExtWs"
          />
        </div>

        {params.error && ERROR_MESSAGES[params.error] && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {ERROR_MESSAGES[params.error]}
          </div>
        )}

        <datalist id="ibws-count-list">
          {countList.map((c) => (
            <option key={c.code} value={c.code}>{c.description}</option>
          ))}
        </datalist>

        <form
          id="ibws-find-form"
          method="GET"
          action="/inventory/contracts/beam-ext-ws"
          className="hidden"
        ></form>

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — Beam Contract Ext W/S"
                : formContract
                ? `Edit — ${formContract.contNo}`
                : "Beam Contract Ext W/S"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <button type="submit" form="ibws-save-form" className="btn btn-sm">
                Save
              </button>
              <a href="/inventory/contracts/beam-ext-ws?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <PrintButton label="Print" />
              {formContract && (
                <form action={deleteContract} className="inline">
                  <input type="hidden" name="id" value={formContract.id} />
                  <ConfirmButton message="Delete this contract and its detail rows? This cannot be undone.">
                    Delete
                  </ConfirmButton>
                </form>
              )}
              <a href="/inventory/contracts/beam-ext-ws" className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </div>

          {showForm && (
            <form id="ibws-save-form" action={saveContract}>
              {formContract && <input type="hidden" name="id" value={formContract.id} />}
              <BeamWtCalc />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-4 gap-y-3">
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
                    className="input-box mono bg-gray-100"
                    defaultValue={formContract?.contNo ?? upcomingContNo}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Exp. Date</label>
                  <input
                    name="exp_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formContract?.expDate ?? ""}
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Find</label>
                  <div className="flex gap-2">
                    <input
                      form="ibws-find-form"
                      name="find"
                      className="input-box mono flex-1"
                      defaultValue={params.find ?? ""}
                      placeholder="cont / party"
                    />
                    <button form="ibws-find-form" type="submit" className="btn btn-outline btn-sm">
                      Find
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-3">
                  <label className="label block mb-1">Sizing Party</label>
                  <Combobox
                    name="sizing_party"
                    options={partyOpts}
                    defaultValue={formContract?.sizingParty ?? ""}
                    placeholder="Select party"
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Warping Party</label>
                  <Combobox
                    name="warping_party"
                    options={partyOpts}
                    defaultValue={formContract?.warpingParty ?? ""}
                    placeholder="Select party"
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Party</label>
                  <Combobox
                    name="party"
                    options={partyOpts}
                    defaultValue={formContract?.party ?? ""}
                    placeholder="Select party"
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Converter Party</label>
                  <Combobox
                    name="converter_party"
                    options={partyOpts}
                    defaultValue={formContract?.converterParty ?? ""}
                    placeholder="Select party"
                  />
                </div>

                <div className="lg:col-span-4">
                  <label className="label block mb-1">WRP Code (Grey Const)</label>
                  <Combobox
                    name="wrp_code"
                    options={greyOpts}
                    defaultValue={formContract?.wrpCode ?? ""}
                    placeholder="Select construction"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">No. of Width</label>
                  <input
                    name="no_of_width"
                    type="number"
                    step="any"
                    className="input-box mono text-right"
                    defaultValue={formContract?.noOfWidth ?? 1}
                  />
                </div>
                <div className="lg:col-span-4">
                  <label className="label block mb-1">Prd Code (Product)</label>
                  <Combobox
                    name="prd_code"
                    options={productOpts}
                    defaultValue={formContract?.prdCode ?? ""}
                    placeholder="Select product"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">V-Type</label>
                  <input
                    name="vtype"
                    className="input-box mono"
                    defaultValue={formContract?.vtype ?? ""}
                  />
                </div>

                <div className="lg:col-span-4">
                  <label className="label block mb-1">Rate Per Beam</label>
                  <input
                    name="rate_per_beam"
                    type="number"
                    step="any"
                    className="input-box mono text-right"
                    defaultValue={formContract?.ratePerBeam ?? ""}
                  />
                </div>
                <div className="lg:col-span-4">
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
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Total Ends</label>
                  <input
                    name="ends_total"
                    type="number"
                    step="any"
                    className="input-box mono text-right bg-gray-100"
                    defaultValue={formContract?.ends ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Total WT/Mtr</label>
                  <input
                    name="wt_total"
                    type="number"
                    step="any"
                    className="input-box mono text-right bg-gray-100"
                    defaultValue={formContract?.wtPerMtr ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>

                <div className="lg:col-span-6">
                  <label className="label block mb-1">Posted</label>
                  <input
                    className="input-box mono bg-gray-100 text-[12px]"
                    defaultValue={formContract?.postedDate?.slice(0, 10) ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="lg:col-span-6">
                  <label className="label block mb-1">Modified</label>
                  <input
                    className="input-box mono bg-gray-100 text-[12px]"
                    defaultValue={formContract?.modifiedDate?.slice(0, 10) ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>

                <div className="lg:col-span-12">
                  <label className="label block mb-1">Terms</label>
                  <input
                    name="terms"
                    className="input-box"
                    defaultValue={formContract?.terms ?? ""}
                  />
                </div>
                <div className="lg:col-span-12">
                  <label className="label block mb-1">Remarks</label>
                  <input
                    name="remarks"
                    className="input-box"
                    defaultValue={formContract?.remarks ?? ""}
                  />
                </div>
              </div>

              <div className="border border-black mt-6">
                <div className="bg-gray-50 border-b border-black px-3 py-2 text-[12px] uppercase tracking-[0.1em] font-bold">
                  Count Detail ({DETAIL_ROWS} rows)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-1 py-1 border-b border-black" style={{ width: 30 }}>Sr#</th>
                        <th className="px-1 py-1 border-b border-black">Count Code</th>
                        <th className="px-1 py-1 border-b border-black">Brand</th>
                        <th className="px-1 py-1 border-b border-black text-right">Cal Count</th>
                        <th className="px-1 py-1 border-b border-black text-right">Ends</th>
                        <th className="px-1 py-1 border-b border-black text-right">WT/Mtr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailGrid.map((r, idx) => {
                        const i = idx + 1;
                        return (
                          <tr key={i}>
                            <td className="px-1 py-0.5 border-b border-[var(--border-light)] mono text-center">{i}</td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input
                                name={`d_count_code_${i}`}
                                list="ibws-count-list"
                                className={gridCellCls}
                                defaultValue={r?.countCode ?? ""}
                              />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input
                                name={`d_brand_${i}`}
                                className={gridCellCls}
                                defaultValue={r?.brand ?? ""}
                              />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input
                                name={`d_cal_count_${i}`}
                                type="number"
                                step="any"
                                className={gridCellNumCls}
                                defaultValue={r?.calCount ?? ""}
                              />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input
                                name={`d_ends_${i}`}
                                type="number"
                                step="any"
                                className={gridCellNumCls}
                                defaultValue={r?.ends ?? ""}
                              />
                            </td>
                            <td className="px-0.5 py-0.5 border-b border-[var(--border-light)]">
                              <input
                                name={`d_wt_${i}`}
                                type="number"
                                step="any"
                                className={gridCellCalcCls}
                                defaultValue={r?.wtPerMtr ?? ""}
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
                <div className="text-[10px] text-[var(--muted)] p-2 border-t border-black">
                  WT/Mtr = ((Ends × 1.0936 / 840) / Cal Count) / No. of Width. Empty detail rows are ignored on save.
                </div>
              </div>

              <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                <button type="submit" className="btn btn-sm">
                  Save
                </button>
                <a href="/inventory/contracts/beam-ext-ws?adding=1" className="btn btn-outline btn-sm">
                  New
                </a>
                <PrintButton label="Print" />
                <a href="/inventory/contracts/beam-ext-ws" className="btn btn-outline btn-sm">
                  Exit
                </a>
                <div className="ml-auto">
                  <label className="label block mb-1">Alt-S Password</label>
                  <input className="input-box mono" placeholder="password" type="password" />
                </div>
              </div>
            </form>
          )}
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
                  <th>Exp Date</th>
                  <th>Party</th>
                  <th>Sizing Party</th>
                  <th>Warping Party</th>
                  <th>Converter</th>
                  <th className="text-right">Ends</th>
                  <th className="text-right">WT/Mtr</th>
                  <th className="text-right">Rate/Beam</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const isSel = c.id === selected?.id;
                  const href = `/inventory/contracts/beam-ext-ws?id=${c.id}`;
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
                      <td className="mono text-[12px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {c.expDate ?? "-"}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          <div>{c.party ?? "-"}</div>
                          {c.party && partyCodeByDesc.get(c.party) && (
                            <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(c.party)}</div>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          <div>{c.sizingParty ?? "-"}</div>
                          {c.sizingParty && partyCodeByDesc.get(c.sizingParty) && (
                            <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(c.sizingParty)}</div>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          <div>{c.warpingParty ?? "-"}</div>
                          {c.warpingParty && partyCodeByDesc.get(c.warpingParty) && (
                            <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(c.warpingParty)}</div>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          <div>{c.converterParty ?? "-"}</div>
                          {c.converterParty && partyCodeByDesc.get(c.converterParty) && (
                            <div className="text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(c.converterParty)}</div>
                          )}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.ends)}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.wtPerMtr)}
                        </a>
                      </td>
                      <td className="text-right mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {formatNum(c.ratePerBeam)}
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
                    <td colSpan={11} className="text-center text-[13px] text-[var(--muted)] py-6">
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
