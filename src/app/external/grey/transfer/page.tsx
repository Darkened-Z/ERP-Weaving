import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { Combobox } from "@/components/combobox";
import { GreyQualityPicker } from "@/components/grey-quality-picker";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { today } from "@/lib/time";
import { assertPeriodOpen } from "@/lib/period-lock";
import { getSession } from "@/lib/auth";
import { num, intVal, txt } from "@/lib/form";

export const dynamic = "force-dynamic";

const GREY_TYPES = ["FRS", "REJ"];

export default async function GreyTransferPage({
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

  const transfers = findFilter
    ? await db
        .select()
        .from(schema.extGreyTransfer)
        .where(sql`
          ${schema.extGreyTransfer.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extGreyTransfer.partyFrom} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extGreyTransfer.partyTo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extGreyTransfer.qualityFrom} LIKE ${pat} ESCAPE '\\' OR
          ${schema.extGreyTransfer.qualityTo} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.extGreyTransfer.id))
    : await db
        .select()
        .from(schema.extGreyTransfer)
        .orderBy(desc(schema.extGreyTransfer.id));

  const selected = isEditing ? transfers.find((t) => t.id === idParam) ?? null : null;
  const formTransfer = isAdding ? null : selected;

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);
  const greyList = await db
    .select({
      code: schema.greyConstruction.code,
      description: schema.greyConstruction.description,
      width: schema.greyConstruction.width,
      reed: schema.greyConstruction.reed,
      pick: schema.greyConstruction.pick,
      warpCount: schema.greyConstruction.warpCount,
      warp2: schema.greyConstruction.warp2,
      warp3: schema.greyConstruction.warp3,
      warp4: schema.greyConstruction.warp4,
      warp5: schema.greyConstruction.warp5,
      warp6: schema.greyConstruction.warp6,
      warp7: schema.greyConstruction.warp7,
      warp8: schema.greyConstruction.warp8,
      weftCount: schema.greyConstruction.weftCount,
      weft2: schema.greyConstruction.weft2,
      weft3: schema.greyConstruction.weft3,
      weft4: schema.greyConstruction.weft4,
      weft5: schema.greyConstruction.weft5,
      weft6: schema.greyConstruction.weft6,
      weft7: schema.greyConstruction.weft7,
      weft8: schema.greyConstruction.weft8,
      status: schema.greyConstruction.status,
    })
    .from(schema.greyConstruction)
    .where(eq(schema.greyConstruction.status, "A"))
    .orderBy(schema.greyConstruction.code);
  const yarnCountList = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
    .from(schema.yarnCounts)
    .where(eq(schema.yarnCounts.status, "A"))
    .orderBy(schema.yarnCounts.countCode);
  const greyCountLabels: Record<string, string> = Object.fromEntries(
    yarnCountList.map((y) => [
      String(y.countCode).trim().toLowerCase(),
      `${y.countCode} — ${y.description}${y.type ? ` ${y.type}` : ""}`,
    ])
  );

  const partyOpts = parties.map((p) => ({ value: p.description, label: `${p.code} — ${p.description}` }));
  const greyOpts = greyList.map((g) => {
    const rp = g.reed && g.pick ? `R${g.reed} P${g.pick} · ` : "";
    const w = g.width ? `${g.width}" ` : "";
    return {
      value: g.code,
      label: `${g.code} — ${rp}${w}${g.description}`,
      desc: `reed ${g.reed ?? ""} pick ${g.pick ?? ""} ${g.reed ?? ""}/${g.pick ?? ""} ${g.reed ?? ""}x${g.pick ?? ""}`,
    };
  });
  const greyPickerRows = greyList.map((g) => ({
    code: g.code,
    reed: (g.reed ?? null) as number | null,
    pick: (g.pick ?? null) as number | null,
    width: (g.width ?? null) as number | null,
    description: g.description ?? "",
    warpCounts: [g.warpCount, g.warp2, g.warp3, g.warp4, g.warp5, g.warp6, g.warp7, g.warp8].map((x) => (x ?? "") as string),
    weftCounts: [g.weftCount, g.weft2, g.weft3, g.weft4, g.weft5, g.weft6, g.weft7, g.weft8].map((x) => (x ?? "") as string),
    status: (g.status ?? "A") as string,
  }));
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));
  const greyDescByCode = new Map(greyList.map((g) => [g.code, g.description]));

  const nextVNoVal = await db
    .select({
      m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extGreyTransfer.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.extGreyTransfer);
  const upcomingVNo = "GTR-" + String((nextVNoVal[0]?.m ?? 0) + 1).padStart(4, "0");
  const lastLvNo = transfers.reduce((m, t) => Math.max(m, t.lvNo ?? 0), 0);

  let stockThanDisp: number | null = null;
  let stockMtrDisp: number | null = null;
  if (formTransfer?.partyFrom && formTransfer?.qualityFrom) {
    const p = formTransfer.partyFrom;
    const q = formTransfer.qualityFrom;
    const [gdn] = await db
      .select({
        t: sql<number>`coalesce(sum(${schema.extGodownStock.than}), 0)`,
        m: sql<number>`coalesce(sum(${schema.extGodownStock.meter}), 0)`,
      })
      .from(schema.extGodownStock)
      .where(sql`${schema.extGodownStock.type} = 'STOCK'
        AND (${schema.extGodownStock.gdnParty} = ${p} OR ${schema.extGodownStock.purchaseParty} = ${p})
        AND ${schema.extGodownStock.dspQuality} = ${q}`);
    const [kp] = await db
      .select({
        t: sql<number>`coalesce(sum(${schema.extKachiParchi.than}), 0)`,
        m: sql<number>`coalesce(sum(${schema.extKachiParchi.meter}), 0)`,
      })
      .from(schema.extKachiParchi)
      .where(sql`${schema.extKachiParchi.purchaseParty} = ${p}
        AND ${schema.extKachiParchi.dspQuality} = ${q}`);
    // exclude the record being edited so its own deduction doesn't hide the stock it came from
    const [out] = await db
      .select({
        t: sql<number>`coalesce(sum(${schema.extGreyTransfer.than}), 0)`,
        m: sql<number>`coalesce(sum(${schema.extGreyTransfer.meters}), 0)`,
      })
      .from(schema.extGreyTransfer)
      .where(sql`${schema.extGreyTransfer.partyFrom} = ${p}
        AND ${schema.extGreyTransfer.qualityFrom} = ${q}
        AND ${schema.extGreyTransfer.id} != ${formTransfer.id}`);
    const [inn] = await db
      .select({
        t: sql<number>`coalesce(sum(${schema.extGreyTransfer.than}), 0)`,
        m: sql<number>`coalesce(sum(${schema.extGreyTransfer.meters}), 0)`,
      })
      .from(schema.extGreyTransfer)
      .where(sql`${schema.extGreyTransfer.partyTo} = ${p}
        AND ${schema.extGreyTransfer.qualityTo} = ${q}
        AND ${schema.extGreyTransfer.id} != ${formTransfer.id}`);
    stockThanDisp = (gdn?.t ?? 0) - (kp?.t ?? 0) - (out?.t ?? 0) + (inn?.t ?? 0);
    stockMtrDisp = Math.round(((gdn?.m ?? 0) - (kp?.m ?? 0) - (out?.m ?? 0) + (inn?.m ?? 0)) * 100) / 100;
  }

  async function saveTransfer(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const vDate = ((formData.get("v_date") as string) || "").trim() || today();
    const greyType = txt(formData.get("grey_type")) ?? "FRS";
    const partyFrom = txt(formData.get("party_from"));
    const qualityFrom = txt(formData.get("quality_from"));
    const than = intVal(formData.get("than"));
    const meters = num(formData.get("meters"));
    const partyTo = txt(formData.get("party_to"));
    const qualityTo = txt(formData.get("quality_to"));
    const remarks = txt(formData.get("remarks"));

    if (than == null || meters == null) {
      const q = Number.isFinite(id) && id > 0 ? `?id=${id}&error=qty_required` : `?adding=1&error=qty_required`;
      redirect("/external/grey/transfer" + q);
    }

    const nowIso = new Date().toISOString();

    try {
      await assertPeriodOpen(vDate, "INVENTORY");

      if (Number.isFinite(id) && id > 0) {
        await db
          .update(schema.extGreyTransfer)
          .set({
            vDate, greyType, partyFrom, qualityFrom, than, meters,
            partyTo, qualityTo, remarks, modifiedDate: nowIso,
          })
          .where(eq(schema.extGreyTransfer.id, id));

        revalidatePath("/external/grey/transfer");
        redirect(`/external/grey/transfer?id=${id}`);
      } else {
        let newId = 0;
        let codeExists = false;
        try {
          newId = await db.transaction(async (tx) => {
            const existingRows = await tx
              .select({
                m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extGreyTransfer.vNo}, 5) AS INTEGER)), 0)`,
              })
              .from(schema.extGreyTransfer);
            const maxN = existingRows[0]?.m ?? 0;
            const vNo = "GTR-" + String(maxN + 1).padStart(4, "0");
            const lvRow = await tx
              .select({ m: sql<number>`coalesce(max(${schema.extGreyTransfer.lvNo}), 0)` })
              .from(schema.extGreyTransfer);
            const nextL = (lvRow[0]?.m ?? 0) + 1;

            const inserted = await tx
              .insert(schema.extGreyTransfer)
              .values({
                vNo, lvNo: nextL, vDate, greyType, partyFrom, qualityFrom, than, meters,
                partyTo, qualityTo, remarks, postedDate: nowIso,
              })
              .returning({ id: schema.extGreyTransfer.id });
            return inserted[0].id;
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
          redirect(`/external/grey/transfer?error=code_exists`);
        }

        revalidatePath("/external/grey/transfer");
        redirect(`/external/grey/transfer?id=${newId}`);
      }
    } catch (e: unknown) {
      const digest = (e as { digest?: string })?.digest ?? "";
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw e;
      const msg = (e as { message?: string })?.message ?? "";
      const m = /Period locked through (\d{4}-\d{2}-\d{2})/.exec(msg);
      if (m) {
        redirect(`/external/grey/transfer?error=period_locked&thru=${m[1]}`);
      }
      throw e;
    }
  }

  async function deleteTransfer(formData: FormData) {
    "use server";
    const s = await getSession();
    if (s?.roleName !== "ADMIN") redirect("/external/grey/transfer?error=admin_only");
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.delete(schema.extGreyTransfer).where(eq(schema.extGreyTransfer.id, id));
    revalidatePath("/external/grey/transfer");
    redirect("/external/grey/transfer");
  }

  const formatNum = (n?: number | null) =>
    n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const roCls = "input-box mono bg-gray-100";

  const excelRows = transfers.map((t) => ({
    vNo: t.vNo,
    vDate: t.vDate,
    partyFrom: t.partyFrom,
    partyTo: t.partyTo,
    qualityFrom: t.qualityFrom,
    than: t.than,
    meters: t.meters,
  }));

  return (
    <Shell active="ext-gt">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">GREY TRANSFER</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {transfers.length} transfer{transfers.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={excelRows}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "V.Date" },
              { key: "partyFrom", label: "Party From" },
              { key: "partyTo", label: "Party To" },
              { key: "qualityFrom", label: "Quality From" },
              { key: "than", label: "Than" },
              { key: "meters", label: "Meters" },
            ]}
            filename="grey-transfers"
            sheetName="GreyTransfer"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            V.No already exists. Try again.
          </div>
        )}
        {params.error === "qty_required" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Than and Meters are required.
          </div>
        )}
        {params.error === "period_locked" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Period locked through {params.thru ?? "?"}. Nothing was saved.
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can delete records.
          </div>
        )}

        <form id="gt-find-form" method="GET" action="/external/grey/transfer" className="hidden"></form>

        <div className="border border-black p-4 mb-3">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — GREY TRANSFER"
                : formTransfer
                ? `Edit — ${formTransfer.vNo}`
                : "GREY TRANSFER"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/external/grey/transfer?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              <button type="submit" form="gt-save-form" className="btn btn-sm">
                Save
              </button>
              <PrintButton label="Print" />
              <a href="/external/grey/transfer" className="btn btn-outline btn-sm">
                Exit
              </a>
              {formTransfer ? (
                <form action={deleteTransfer} className="inline">
                  <input type="hidden" name="id" value={formTransfer.id} />
                  <ConfirmButton>Del</ConfirmButton>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled
                  title="Save the transfer first to enable delete"
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Del
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3 mb-4 gform">
            <div className="col-span-8">
              <label className="label block mb-1">Find</label>
              <div className="flex gap-2">
                <input
                  form="gt-find-form"
                  name="find"
                  className="input-box mono flex-1"
                  defaultValue={params.find ?? ""}
                  placeholder="v.no / party / quality"
                />
                <button form="gt-find-form" type="submit" className="btn btn-outline btn-sm">
                  Find
                </button>
                {findFilter && (
                  <a href="/external/grey/transfer" className="btn btn-outline btn-sm">
                    Clear
                  </a>
                )}
              </div>
            </div>
            <div className="col-span-1">
              <label className="label block mb-1">V.No</label>
              <input className={roCls} defaultValue={formTransfer?.vNo ?? upcomingVNo} readOnly tabIndex={-1} />
            </div>
            <div className="col-span-1">
              <label className="label block mb-1">LV.No</label>
              <input className={roCls + " text-center"} defaultValue={formTransfer?.lvNo ?? lastLvNo} readOnly tabIndex={-1} />
            </div>
            <div className="col-span-1">
              <label className="label block mb-1">Posted</label>
              <input className={roCls + " text-[11px]"} defaultValue={formTransfer?.postedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
            </div>
            <div className="col-span-1">
              <label className="label block mb-1">Modified</label>
              <input className={roCls + " text-[11px]"} defaultValue={formTransfer?.modifiedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
            </div>
          </div>

          <form id="gt-save-form" action={saveTransfer}>
            {formTransfer && <input type="hidden" name="id" value={formTransfer.id} />}

            <div className="border-2 border-black mb-4" style={{ background: "#FCE7F3" }}>
              <div className="px-4 py-2 border-b-2 border-black text-[12px] uppercase tracking-[0.1em] font-bold" style={{ background: "#F9A8D4" }}>
                TRANSFER FROM (-)
              </div>
              <div className="p-4 grid grid-cols-12 gap-3 gform">
                <div className="col-span-3">
                  <label className="label block mb-1">V. Date</label>
                  <input
                    name="v_date"
                    type="date"
                    className="input-box mono"
                    defaultValue={formTransfer?.vDate ?? today()}
                    required
                  />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Grey Type</label>
                  <select name="grey_type" className="input-box mono" defaultValue={formTransfer?.greyType ?? "FRS"}>
                    {GREY_TYPES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-6">
                  <label className="label block mb-1">Party From</label>
                  <Combobox name="party_from" options={partyOpts} defaultValue={formTransfer?.partyFrom ?? ""} placeholder="Select party" />
                </div>

                <div className="col-span-12">
                  <label className="label block mb-1">Quality</label>
                  <GreyQualityPicker name="quality_from" defaultValue={formTransfer?.qualityFrom ?? ""} rows={greyPickerRows} countLabels={greyCountLabels} />
                </div>

                <div className="col-span-3">
                  <label className="label block mb-1">Than</label>
                  <input name="than" type="number" step="1" required className="input-box mono text-right" defaultValue={formTransfer?.than ?? ""} />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Meters</label>
                  <input name="meters" type="number" step="any" required className="input-box mono text-right" defaultValue={formTransfer?.meters ?? ""} />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Stock Than</label>
                  <input
                    type="number"
                    step="1"
                    className={roCls + " text-right"}
                    defaultValue={stockThanDisp ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Stock Mtr</label>
                  <input
                    type="number"
                    step="any"
                    className={roCls + " text-right"}
                    defaultValue={stockMtrDisp ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
              </div>
            </div>

            <div className="border-2 border-black mb-4" style={{ background: "#FFEDD5" }}>
              <div className="px-4 py-2 border-b-2 border-black text-[12px] uppercase tracking-[0.1em] font-bold" style={{ background: "#FDBA74" }}>
                TRANSFER TO (+)
              </div>
              <div className="p-4 grid grid-cols-12 gap-3 gform">
                <div className="col-span-6">
                  <label className="label block mb-1">Party To</label>
                  <Combobox name="party_to" options={partyOpts} defaultValue={formTransfer?.partyTo ?? ""} placeholder="Select party" />
                </div>
                <div className="col-span-6">
                  <label className="label block mb-1">Quality</label>
                  <GreyQualityPicker name="quality_to" defaultValue={formTransfer?.qualityTo ?? ""} rows={greyPickerRows} countLabels={greyCountLabels} />
                </div>
                <div className="col-span-8">
                  <label className="label block mb-1">Remarks</label>
                  <input name="remarks" className="input-box" defaultValue={formTransfer?.remarks ?? ""} />
                </div>
                <div className="col-span-4">
                  <label className="label block mb-1">Alt-S Password</label>
                  <input className="input-box mono" placeholder="password" type="password" />
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap no-print">
              <button type="submit" className="btn btn-sm">Save</button>
              <a href="/external/grey/transfer?adding=1" className="btn btn-outline btn-sm">New</a>
              <PrintButton label="Print" />
              <a href="/external/grey/transfer" className="btn btn-outline btn-sm">Exit</a>
              {formTransfer ? (
                <form action={deleteTransfer} className="inline">
                  <input type="hidden" name="id" value={formTransfer.id} />
                  <ConfirmButton>Del</ConfirmButton>
                </form>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled
                  title="Save the transfer first to enable delete"
                  style={{ opacity: 0.5, cursor: "not-allowed" }}
                >
                  Del
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold flex items-center justify-between">
            <span>All Grey Transfers</span>
            {findFilter && (
              <a href="/external/grey/transfer" className="btn btn-outline btn-sm">Clear Search</a>
            )}
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>V.Date</th>
                  <th>Party From</th>
                  <th>Party To</th>
                  <th>Quality From</th>
                  <th className="text-right">Meters</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const isSel = t.id === selected?.id;
                  const href = `/external/grey/transfer?id=${t.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={t.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono font-bold"><a href={href} className="no-underline block" style={linkStyle}>{t.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{t.vDate}</a></td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {t.partyFrom ?? "-"}
                          {t.partyFrom && partyCodeByDesc.get(t.partyFrom) && (
                            <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(t.partyFrom)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {t.partyTo ?? "-"}
                          {t.partyTo && partyCodeByDesc.get(t.partyTo) && (
                            <span className="block text-[11px] opacity-70">{partyCodeByDesc.get(t.partyTo)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {t.qualityFrom ?? "-"}
                          {t.qualityFrom && greyDescByCode.get(t.qualityFrom) && (
                            <span className="block text-[11px] opacity-70">{greyDescByCode.get(t.qualityFrom)}</span>
                          )}
                        </a>
                      </td>
                      <td className="text-right mono"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(t.meters)}</a></td>
                    </tr>
                  );
                })}
                {transfers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-[13px] text-[var(--muted)] py-6">
                      No transfers. Click <b>New</b> above to create one.
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
