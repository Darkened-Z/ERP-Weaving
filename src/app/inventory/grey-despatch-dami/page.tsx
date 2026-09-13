import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { today } from "@/lib/time";
import { ConfirmButton } from "@/components/confirm-button";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { num, intVal, txt, nextVNoFromRows, escLike } from "@/lib/form";
import Link from "next/link";
import { DamiLineGrid } from "./dami-line-grid";

export const dynamic = "force-dynamic";

export default async function GreyDespatchDamiPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; find?: string; thru?: string }>;
}) {
  const params = await searchParams;
  const idParam = params.id ? parseInt(params.id, 10) : NaN;
  const isEditing = Number.isFinite(idParam) && idParam > 0;
  const isAdding = params.adding === "1";

  const findFilter = params.find?.trim();
  const escFind = findFilter != null ? escLike(findFilter) : undefined;
  const pat = escFind ? `%${escFind}%` : "";

  const damis = findFilter
    ? await db
        .select()
        .from(schema.intGreyDespatchDami)
        .where(sql`
          ${schema.intGreyDespatchDami.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatchDami.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatchDami.subParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatchDami.remarks} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intGreyDespatchDami.id))
    : await db
        .select()
        .from(schema.intGreyDespatchDami)
        .orderBy(desc(schema.intGreyDespatchDami.id));

  const selected = isEditing ? damis.find((d) => d.id === idParam) ?? null : null;
  const formItem = isAdding ? null : selected;

  // Load lines if editing
  const existingLines = formItem
    ? await db
        .select()
        .from(schema.intGreyDespatchDamiLine)
        .where(eq(schema.intGreyDespatchDamiLine.damiId, formItem.id))
        .orderBy(schema.intGreyDespatchDamiLine.srNo)
    : [];

  const upcomingVNo = nextVNoFromRows(damis, "IGDD");
  const upcomingLvNo = damis.length + 1;

  // Grey constructions for DSP quality LOV
  const greyConstructions = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction)
    .orderBy(schema.greyConstruction.code);

  // Pakki Parchi list for linking
  const pakkiParchis = await db
    .select({
      id: schema.greyPakiParchi.id,
      ppNo: schema.greyPakiParchi.ppNo,
      ppDate: schema.greyPakiParchi.ppDate,
      party: schema.greyPakiParchi.party,
      qtyThan: schema.greyPakiParchi.qtyThan,
      qtyMtrs: schema.greyPakiParchi.qtyMtrs,
      contractNo: schema.greyPakiParchi.contractNo,
    })
    .from(schema.greyPakiParchi)
    .orderBy(sql`pp_date DESC`);

  async function saveDami(formData: FormData) {
    "use server";
    try {
      const idRaw = formData.get("id") as string | null;
      const id = idRaw ? parseInt(idRaw, 10) : NaN;
      const isUpdate = Number.isFinite(id) && id > 0;
      const vDate = txt(formData.get("v_date")) ?? today();
      await assertPeriodOpen(vDate, "INVENTORY");

      const session = await getSession();

      const data = {
        vDate,
        lvNo: intVal(formData.get("lv_no")),
        pakki_parchi_id: intVal(formData.get("pakki_parchi_id")) ?? null,
        purchaseParty: txt(formData.get("purchase_party")),
        saleParty: txt(formData.get("sale_party")),
        subParty: txt(formData.get("sub_party")),
        party: txt(formData.get("sub_party")), // keep party synced with subParty for backwards compat
        contNo: txt(formData.get("cont_no")),
        salDate: txt(formData.get("sal_date")),
        dspQuality: txt(formData.get("dsp_quality")),
        dspQualityDesc: txt(formData.get("dsp_quality_desc")),
        width: num(formData.get("width")),
        product: txt(formData.get("product")),
        productDesc: txt(formData.get("product_desc")),
        than: intVal(formData.get("than")),
        mtrs: num(formData.get("mtrs")),
        rate: num(formData.get("rate")),
        ratePer: num(formData.get("rate_per")),
        rateSal: num(formData.get("rate_sal")),
        printingName: txt(formData.get("printing_name")),
        printingLocation: txt(formData.get("printing_location")),
        brokerName: txt(formData.get("broker_name")),
        term: txt(formData.get("term")),
        remarks: txt(formData.get("remarks")),
        printedAt: new Date().toISOString(),
        postedBy: session?.login ?? null,
        modifiedDate: new Date().toISOString(),
      };

      // Parse line rows from form
      const lineCount = intVal(formData.get("line_count")) ?? 0;
      const lineRows: { srNo: number; than: number; mtrs: number | null }[] = [];
      for (let i = 0; i < lineCount; i++) {
        const than = intVal(formData.get(`line_than_${i}`)) ?? 1;
        const mtrsRaw = num(formData.get(`line_mtrs_${i}`));
        const srNo = intVal(formData.get(`line_sr_${i}`)) ?? i + 1;
        if (mtrsRaw != null) {
          lineRows.push({ srNo, than, mtrs: mtrsRaw });
        }
      }

      let uniqueError = false;
      let savedId: number | null = null;

      try {
        savedId = await db.transaction(async (tx) => {
          let did: number;
          if (isUpdate) {
            await tx.update(schema.intGreyDespatchDami).set(data).where(eq(schema.intGreyDespatchDami.id, id));
            did = id;
          } else {
            const existing = await tx.select({ vNo: schema.intGreyDespatchDami.vNo }).from(schema.intGreyDespatchDami);
            const [lvRowIn] = await tx
              .select({ m: sql<number>`COALESCE(MAX(${schema.intGreyDespatchDami.lvNo}),0)` })
              .from(schema.intGreyDespatchDami);
            const nextLvNo = Number(lvRowIn?.m ?? 0) + 1;
            const providedVNo = txt(formData.get("v_no"));
            const vNo = providedVNo ?? nextVNoFromRows(existing, "IGDD");
            const [ins] = await tx
              .insert(schema.intGreyDespatchDami)
              .values({
                ...data,
                vNo,
                lvNo: data.lvNo ?? nextLvNo,
                postedDate: new Date().toISOString(),
              })
              .returning({ id: schema.intGreyDespatchDami.id });
            did = ins.id;
          }

          // Save line rows
          if (lineRows.length > 0) {
            await tx.delete(schema.intGreyDespatchDamiLine).where(eq(schema.intGreyDespatchDamiLine.damiId, did));
            await tx.insert(schema.intGreyDespatchDamiLine).values(
              lineRows.map((r) => ({ damiId: did, srNo: r.srNo, than: r.than, mtrs: r.mtrs }))
            );
          }

          return did;
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
        const q = isUpdate ? `?id=${id}&error=code_exists` : `?adding=1&error=code_exists`;
        redirect("/inventory/grey-despatch-dami" + q);
      }
      if (savedId === null) return;

      revalidatePath("/inventory/grey-despatch-dami");
      redirect(`/inventory/grey-despatch-dami?id=${savedId}`);
    } catch (e) {
      const err = e as { message?: string; digest?: string };
      if (err.digest && err.digest.startsWith("NEXT_REDIRECT")) throw e;
      const thru = parseLockedThroughFromError(err.message ?? "");
      if (thru) redirect(`/inventory/grey-despatch-dami?error=period_locked&thru=${thru}`);
      throw e;
    }
  }

  async function deleteDami(formData: FormData) {
    "use server";
    const session = await getSession();
    if (session?.roleName !== "ADMIN") redirect("/inventory/grey-despatch-dami?error=admin_only");
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.intGreyDespatchDamiLine).where(eq(schema.intGreyDespatchDamiLine.damiId, id));
      await tx.delete(schema.intGreyDespatchDami).where(eq(schema.intGreyDespatchDami.id, id));
    });
    revalidatePath("/inventory/grey-despatch-dami");
    redirect("/inventory/grey-despatch-dami");
  }

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const totals = damis.reduce(
    (a, d) => {
      a.than += d.than ?? 0;
      a.mtrs += d.mtrs ?? 0;
      return a;
    },
    { than: 0, mtrs: 0 }
  );

  const initialLineRows = existingLines.map((l) => ({
    srNo: l.srNo,
    than: l.than,
    mtrs: l.mtrs != null ? String(l.mtrs) : "",
  }));

  return (
    <Shell active="grey-despatch-dami">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; top: 0; left: 0; width: 100%; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="animate-in">
        {/* ── Top bar ── */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4 no-print">
          <div>
            <h1 className="page-title">GREY DESPATCH DAMI</h1>
            <p className="text-[13px] text-[var(--muted)] mt-1">
              {damis.length} slip{damis.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={damis.map((d) => ({
              vNo: d.vNo, vDate: d.vDate, subParty: d.subParty,
              printingLocation: d.printingLocation, productDesc: d.productDesc,
              than: d.than, mtrs: d.mtrs,
            }))}
            columns={[
              { key: "vNo", label: "V.No" }, { key: "vDate", label: "Date" },
              { key: "subParty", label: "Party" }, { key: "printingLocation", label: "Despatch Loc" },
              { key: "productDesc", label: "Product" }, { key: "than", label: "Than" }, { key: "mtrs", label: "Mtrs" },
            ]}
            filename="grey-despatch-dami"
            sheetName="DespatchDami"
          />
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-px bg-black border border-black mb-4 no-print">
          <div className="bg-white p-3"><div className="mono text-xl font-bold">{damis.length}</div><div className="stat-label">Total Slips</div></div>
          <div className="bg-white p-3"><div className="mono text-xl font-bold">{formatNum(totals.than)}</div><div className="stat-label">Total Than</div></div>
          <div className="bg-white p-3"><div className="mono text-xl font-bold">{formatNum(totals.mtrs)}</div><div className="stat-label">Total Mtrs</div></div>
        </div>

        {/* ── Errors ── */}
        {params.error === "code_exists" && <div className="border-2 border-[var(--danger)] px-4 py-2 mb-3 text-[12px] text-[var(--danger)] font-semibold mono no-print">V.No already exists.</div>}
        {params.error === "period_locked" && <div className="border-2 border-[var(--danger)] px-4 py-2 mb-3 text-[12px] text-[var(--danger)] font-semibold mono no-print">Period is locked{params.thru && <> — through <span className="mono">{params.thru}</span></>}.</div>}
        {params.error === "admin_only" && <div className="border-2 border-[var(--danger)] px-4 py-2 mb-3 text-[12px] text-[var(--danger)] font-semibold mono no-print">Only ADMIN can delete.</div>}

        <form id="dami-find-form" method="GET" action="/inventory/grey-despatch-dami" className="hidden"></form>

        {/* ── MAIN LAYOUT: Form (left 2/3) + Line Grid (right 1/3) ── */}
        <div className="flex gap-4 items-start">

          {/* ─── LEFT: Form ─── */}
          <div className="flex-1 border border-black p-4 mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2 no-print">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                {isAdding ? "New Slip" : formItem ? `Edit — ${formItem.vNo}` : "Grey Despatch Dami"}
              </div>
              <div className="flex gap-2 flex-wrap">
                <a href="/inventory/grey-despatch-dami?adding=1" className="btn btn-outline btn-sm">New</a>
                <button type="submit" form="dami-save-form" className="btn btn-sm">Save</button>
                <PrintButton label="Print" />
                <a href="/inventory/grey-despatch-dami" className="btn btn-outline btn-sm">Exit</a>
                {formItem ? (
                  <form action={deleteDami} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message={`Delete ${formItem.vNo}? Cannot be undone.`}>Delete</ConfirmButton>
                  </form>
                ) : null}
              </div>
            </div>

            <form id="dami-save-form" action={saveDami}>
              {formItem && <input type="hidden" name="id" value={formItem.id} />}

              {/* ── Pakki Parchi Link ── */}
              <div className="mb-3 p-3 border border-[var(--accent)] bg-[#eff6ff] rounded">
                <label className="label block mb-1 text-[var(--accent)] font-semibold">🔗 Link to Pakki Parchi</label>
                <select
                  name="pakki_parchi_id"
                  className="input-box mono text-[11px] w-full"
                  defaultValue={formItem?.pakki_parchi_id ?? ""}
                >
                  <option value="">— No link (standalone Dami) —</option>
                  {pakkiParchis.map((pp) => (
                    <option key={pp.id} value={pp.id}>
                      PP#{pp.ppNo} | {pp.ppDate} | {pp.party} | Than:{pp.qtyThan ?? 0} | Mtr:{pp.qtyMtrs ?? 0}{pp.contractNo ? ` | Cont:${pp.contractNo}` : ""}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-[var(--muted)] mt-1">Select the Pakki Parchi (purchase record) this Dami Voucher was issued against.</div>
              </div>

              {/* Row 1: Date, V.No, LvNo, Find */}
              <div className="grid grid-cols-12 gap-2 mb-3 gform">
                <div className="col-span-2">
                  <label className="label block mb-1">V.Date</label>
                  <input name="v_date" type="date" className="input-box mono" defaultValue={formItem?.vDate ?? today()} required />
                </div>
                <div className="col-span-2">
                  <label className="label block mb-1">V.No</label>
                  <input name="v_no" className="input-box mono bg-gray-100" defaultValue={formItem?.vNo ?? upcomingVNo} readOnly />
                </div>
                <div className="col-span-2">
                  <label className="label block mb-1">Lv No</label>
                  <input name="lv_no" type="number" className="input-box mono bg-gray-100 text-center" defaultValue={formItem?.lvNo ?? upcomingLvNo} readOnly />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Sal Date</label>
                  <input name="sal_date" type="date" className="input-box mono" defaultValue={formItem?.salDate ?? ""} />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Find</label>
                  <div className="flex gap-1">
                    <input form="dami-find-form" name="find" className="input-box mono flex-1" defaultValue={params.find ?? ""} placeholder="V.No / party" />
                    <button form="dami-find-form" type="submit" className="btn btn-outline btn-sm">Go</button>
                  </div>
                </div>
              </div>

              {/* Row 2 gone: Purchase Party + Cont # + Term all removed. Each is
                  kept as a hidden input so an existing voucher does not lose those
                  values on edit; the DB columns are untouched. */}
              <input type="hidden" name="purchase_party" defaultValue={formItem?.purchaseParty ?? ""} />
              <input type="hidden" name="cont_no" defaultValue={formItem?.contNo ?? ""} />
              <input type="hidden" name="term" defaultValue={formItem?.term ?? ""} />

              {/* Row 3: Sale Party only. Sub Party removed. */}
              <div className="grid grid-cols-12 gap-2 mb-3 gform">
                <div className="col-span-12">
                  <label className="label block mb-1">Sale Party</label>
                  <input name="sale_party" className="input-box" defaultValue={formItem?.saleParty ?? ""} placeholder="Sale party name..." />
                </div>
                <input type="hidden" name="sub_party" defaultValue={formItem?.subParty ?? ""} />
              </div>

              {/* Row 4: DSP Quality (Grey Construction) */}
              <div className="grid grid-cols-12 gap-2 mb-3 gform">
                <div className="col-span-3">
                  <label className="label block mb-1">Dsp. Quality Code</label>
                  <select name="dsp_quality" className="input-box mono text-[11px]" defaultValue={formItem?.dspQuality ?? ""}>
                    <option value="">— select —</option>
                    {greyConstructions.map((g) => (
                      <option key={g.code} value={g.code}>{g.code}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-9">
                  <label className="label block mb-1">Grey Construction</label>
                  <input name="dsp_quality_desc" className="input-box mono text-[11px]" defaultValue={formItem?.dspQualityDesc ?? ""} placeholder="71 X 56  30/S MVS  PV 65;35 X 20/S PVT  PV 80;20" />
                </div>
              </div>

              {/* Row 5: Width, Product */}
              <div className="grid grid-cols-12 gap-2 mb-3 gform">
                <div className="col-span-2">
                  <label className="label block mb-1">Width</label>
                  <input name="width" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.width ?? ""} placeholder='61"' />
                </div>
                <div className="col-span-2">
                  <label className="label block mb-1">Product Code</label>
                  <input name="product" className="input-box mono" defaultValue={formItem?.product ?? ""} />
                </div>
                <div className="col-span-8">
                  <label className="label block mb-1">Product Name</label>
                  <input name="product_desc" className="input-box" defaultValue={formItem?.productDesc ?? ""} placeholder="OUDH SUTTING / SAMI SAB..." />
                </div>
              </div>

              {/* Row 6: Than + Meter (both auto). Rate / Rate Per / Rate Sal removed.
                  The three rate fields stay as hidden inputs so any existing values
                  survive an edit. */}
              <div className="grid grid-cols-12 gap-2 mb-3 gform">
                <div className="col-span-6">
                  <label className="label block mb-1">Than (auto)</label>
                  <input id="dami-than" name="than" type="number" className="input-box mono text-right bg-blue-50" defaultValue={formItem?.than ?? ""} readOnly />
                </div>
                <div className="col-span-6">
                  <label className="label block mb-1">Meter (auto)</label>
                  <input id="dami-mtrs" name="mtrs" type="number" step="any" className="input-box mono text-right bg-blue-50" defaultValue={formItem?.mtrs ?? ""} readOnly />
                </div>
                <input type="hidden" name="rate" defaultValue={formItem?.rate ?? ""} />
                <input type="hidden" name="rate_per" defaultValue={formItem?.ratePer ?? ""} />
                <input type="hidden" name="rate_sal" defaultValue={formItem?.rateSal ?? ""} />
              </div>

              {/* Row 7: Printing Name / Location. Broker Name removed. */}
              <div className="grid grid-cols-12 gap-2 mb-3 gform">
                <div className="col-span-4">
                  <label className="label block mb-1">Printing Name</label>
                  <input name="printing_name" className="input-box" defaultValue={formItem?.printingName ?? ""} placeholder="GHIDY" />
                </div>
                <div className="col-span-8">
                  <label className="label block mb-1">Printing Location</label>
                  <input name="printing_location" className="input-box" defaultValue={formItem?.printingLocation ?? ""} placeholder="GHOSIA DYING LAHORE" />
                </div>
                <input type="hidden" name="broker_name" defaultValue={formItem?.brokerName ?? ""} />
              </div>

              {/* Row 8: Remarks */}
              <div className="grid grid-cols-12 gap-2 mb-3 gform">
                <div className="col-span-12">
                  <label className="label block mb-1">Remarks</label>
                  <input name="remarks" className="input-box" defaultValue={formItem?.remarks ?? ""} />
                </div>
              </div>

              {/* Save buttons */}
              <div className="flex items-end gap-2 mt-4 flex-wrap no-print">
                <button type="submit" className="btn btn-sm">Save</button>
                <a href="/inventory/grey-despatch-dami?adding=1" className="btn btn-outline btn-sm">New</a>
                <a href="/inventory/grey-despatch-dami" className="btn btn-outline btn-sm">Exit</a>
                {formItem ? (
                  <form action={deleteDami} className="inline">
                    <input type="hidden" name="id" value={formItem.id} />
                    <ConfirmButton message={`Delete ${formItem.vNo}?`}>Delete</ConfirmButton>
                  </form>
                ) : null}
              </div>

            </form>

            {/* ── Saved Slip Preview (Image 3 style) ── */}
            {formItem && (
              <div className="border border-[var(--border)] mt-5 p-4 bg-[var(--surface)] print-area">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] mb-1">Saved Voucher</div>
                    <div className="font-bold text-lg mono">V.No: {formItem.vNo}</div>
                  </div>
                  <div className="text-right text-[11px]">
                    <div className="text-[var(--muted)]">Date</div>
                    <div className="font-bold mono">{formItem.vDate}</div>
                    {formItem.postedBy && <div className="text-[var(--muted)] mt-1">Posted by: <b>{formItem.postedBy}</b></div>}
                  </div>
                </div>

                {/* Pakki Parchi link badge */}
                {formItem.pakki_parchi_id ? (() => {
                  const pp = pakkiParchis.find(p => p.id === formItem.pakki_parchi_id);
                  return pp ? (
                    <div className="mb-3 p-2 bg-green-50 border border-green-300 rounded text-[12px] flex items-center gap-3">
                      <span className="text-green-700 font-bold text-[11px] uppercase tracking-wide">✅ Linked to Pakki Parchi</span>
                      <span className="mono font-bold">PP#{pp.ppNo}</span>
                      <span>{pp.ppDate}</span>
                      <span className="text-[var(--muted)]">{pp.party}</span>
                      <span className="ml-auto text-[var(--muted)]">Than: <b>{pp.qtyThan}</b> | Mtr: <b>{pp.qtyMtrs}</b></span>
                    </div>
                  ) : null;
                })() : (
                  <div className="mb-3 p-2 bg-amber-50 border border-amber-300 rounded text-[11px] text-amber-700">
                    ⚠️ Not linked to any Pakki Parchi — edit and select one above.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] mb-3">
                  <div><span className="text-[var(--muted)]">Sale Party: </span><b>{formItem.saleParty ?? "—"}</b></div>
                  <div><span className="text-[var(--muted)]">Sal Date: </span><b>{formItem.salDate ?? "—"}</b></div>
                  <div className="col-span-2"><span className="text-[var(--muted)]">Dsp. Quality: </span><b>{formItem.dspQuality}{formItem.dspQualityDesc ? ` | ${formItem.dspQualityDesc}` : ""}</b></div>
                  <div><span className="text-[var(--muted)]">Product: </span><b>{formItem.product}{formItem.productDesc ? ` | ${formItem.productDesc}` : ""}</b></div>
                  <div><span className="text-[var(--muted)]">Width: </span><b>{formItem.width ? `${formItem.width}"` : "—"}</b></div>
                  <div><span className="text-[var(--muted)]">Than: </span><b className="text-[var(--accent)]">{formatNum(formItem.than)}</b></div>
                  <div><span className="text-[var(--muted)]">Meter: </span><b className="text-[var(--accent)]">{formatNum(formItem.mtrs)}</b></div>
                  <div><span className="text-[var(--muted)]">Printing Name: </span><b>{formItem.printingName ?? "—"}</b></div>
                  <div><span className="text-[var(--muted)]">Printing Location: </span><b>{formItem.printingLocation ?? "—"}</b></div>
                  {formItem.remarks && <div className="col-span-2"><span className="text-[var(--muted)]">Remarks: </span><b>{formItem.remarks}</b></div>}
                </div>

                {/* Link to print/voucher page */}
                <div className="mt-3 no-print">
                  <Link
                    href={`/inventory/grey-despatch-dami/${formItem.id}/voucher`}
                    target="_blank"
                    className="btn btn-sm"
                  >
                    Print Delivery Voucher
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* ─── RIGHT: Piece Line Grid ─── */}
          <div className="w-56 shrink-0 border border-black p-3">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">Pieces (Than / Mtr)</div>
            <div className="text-[10px] text-[var(--muted)] mb-2">Press Enter to add next row</div>
            <DamiLineGrid
              initialLines={initialLineRows}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  // Sync grid totals to main form fields
                  (function() {
                    function syncTotals() {
                      var rows = document.querySelectorAll('[name^="line_than_"]');
                      var mrows = document.querySelectorAll('[name^="line_mtrs_"]');
                      var than = 0, mtrs = 0;
                      rows.forEach(function(r) { than += parseInt(r.value) || 0; });
                      mrows.forEach(function(r) { mtrs += parseFloat(r.value) || 0; });
                      var thanEl = document.getElementById('dami-than');
                      var mtrsEl = document.getElementById('dami-mtrs');
                      if (thanEl) thanEl.value = than;
                      if (mtrsEl) mtrsEl.value = mtrs.toFixed(2);
                    }
                    document.addEventListener('change', syncTotals);
                    document.addEventListener('input', syncTotals);
                    document.addEventListener('keyup', syncTotals);
                    syncTotals();
                  })();
                `,
              }}
            />
          </div>
        </div>

        {/* ── Slips List ── */}
        <div className="border border-black no-print">
          <div className="px-4 py-2 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">Dami Slips</div>
          <div className="overflow-x-auto" style={{ maxHeight: "55vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>Date</th>
                  <th>Sub Party</th>
                  <th>Despatch Loc</th>
                  <th>Product</th>
                  <th className="text-right">Than</th>
                  <th className="text-right">Mtrs</th>
                  <th>Voucher</th>
                </tr>
              </thead>
              <tbody>
                {damis.map((d) => {
                  const isSel = d.id === selected?.id;
                  const href = `/inventory/grey-despatch-dami?id=${d.id}`;
                  const st = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={d.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono font-bold text-[13px]"><a href={href} className="no-underline block" style={st}>{d.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={st}>{d.vDate}</a></td>
                      <td className="text-[12px]"><a href={href} className="no-underline block" style={st}>{d.subParty ?? d.party ?? "—"}</a></td>
                      <td className="text-[12px]"><a href={href} className="no-underline block" style={st}>{d.printingLocation ?? "—"}</a></td>
                      <td className="text-[12px]"><a href={href} className="no-underline block" style={st}>{d.productDesc ?? "—"}</a></td>
                      <td className="text-right mono text-[13px]"><a href={href} className="no-underline block" style={st}>{formatNum(d.than)}</a></td>
                      <td className="text-right mono text-[13px]"><a href={href} className="no-underline block" style={st}>{formatNum(d.mtrs)}</a></td>
                      <td>
                        <a href={`/inventory/grey-despatch-dami/${d.id}/voucher`} target="_blank" className="btn btn-outline btn-sm" style={isSel ? { color: "white", borderColor: "white" } : {}}>Voucher</a>
                      </td>
                    </tr>
                  );
                })}
                {damis.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-[13px] text-[var(--muted)] py-6">No slips. Click <b>New</b> to create one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
