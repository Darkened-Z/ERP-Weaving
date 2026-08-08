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

const intVal = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v as string, 10);
  return Number.isFinite(n) ? n : null;
};

const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};

const today = () => new Date().toISOString().slice(0, 10);

const GREY_TYPES = ["FRS", "REJ"];

export default async function GreyTransferPage({
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
    .orderBy(schema.chartOfAccounts.description);

  const nextVNoVal = await db
    .select({
      m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extGreyTransfer.vNo}, 5) AS INTEGER)), 0)`,
    })
    .from(schema.extGreyTransfer);
  const upcomingVNo = "GTR-" + String((nextVNoVal[0]?.m ?? 0) + 1).padStart(4, "0");
  const upcomingLvNo = transfers.length + 1;

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
    const stockThan = intVal(formData.get("stock_than"));
    const stockMtr = num(formData.get("stock_mtr"));
    const partyTo = txt(formData.get("party_to"));
    const qualityTo = txt(formData.get("quality_to"));
    const remarks = txt(formData.get("remarks"));

    const nowIso = new Date().toISOString();

    if (Number.isFinite(id) && id > 0) {
      await db
        .update(schema.extGreyTransfer)
        .set({
          vDate, greyType, partyFrom, qualityFrom, than, meters, stockThan, stockMtr,
          partyTo, qualityTo, remarks, modifiedDate: nowIso,
        })
        .where(eq(schema.extGreyTransfer.id, id));

      revalidatePath("/external/grey/transfer");
      redirect(`/external/grey/transfer?id=${id}`);
    } else {
      const existingRows = await db
        .select({
          m: sql<number>`coalesce(max(CAST(SUBSTR(${schema.extGreyTransfer.vNo}, 5) AS INTEGER)), 0)`,
        })
        .from(schema.extGreyTransfer);
      const maxN = existingRows[0]?.m ?? 0;
      const vNo = "GTR-" + String(maxN + 1).padStart(4, "0");
      const cntAll = await db.select({ c: sql<number>`count(*)` }).from(schema.extGreyTransfer);
      const nextL = (cntAll[0]?.c ?? 0) + 1;

      let newId = 0;
      try {
        const inserted = await db
          .insert(schema.extGreyTransfer)
          .values({
            vNo, lvNo: nextL, vDate, greyType, partyFrom, qualityFrom, than, meters,
            stockThan, stockMtr, partyTo, qualityTo, remarks, postedDate: nowIso,
          })
          .returning({ id: schema.extGreyTransfer.id });
        newId = inserted[0].id;
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message ?? "";
        if (/UNIQUE|constraint/i.test(msg)) {
          redirect(`/external/grey/transfer?error=code_exists`);
        }
        throw e;
      }

      revalidatePath("/external/grey/transfer");
      redirect(`/external/grey/transfer?id=${newId}`);
    }
  }

  async function deleteTransfer(formData: FormData) {
    "use server";
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
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
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

        <datalist id="gt-parties">
          {parties.map((p) => (
            <option key={p.code} value={p.description}>
              {p.code}
            </option>
          ))}
        </datalist>

        <form id="gt-find-form" method="GET" action="/external/grey/transfer" className="hidden"></form>

        <div className="border border-black p-5 mb-6">
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
              {formTransfer && (
                <form action={deleteTransfer} className="inline">
                  <input type="hidden" name="id" value={formTransfer.id} />
                  <button type="submit" className="btn btn-outline btn-sm">
                    Del
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3 mb-4">
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
              <input className={roCls + " text-center"} defaultValue={formTransfer?.lvNo ?? upcomingLvNo} readOnly tabIndex={-1} />
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
              <div className="p-4 grid grid-cols-12 gap-3">
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
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <input name="party_from_code" className="input-box mono" placeholder="Code" />
                    <input
                      name="party_from"
                      list="gt-parties"
                      className="input-box mono"
                      placeholder="Description"
                      defaultValue={formTransfer?.partyFrom ?? ""}
                    />
                  </div>
                </div>

                <div className="col-span-12">
                  <label className="label block mb-1">Quality</label>
                  <input name="quality_from" className="input-box mono" defaultValue={formTransfer?.qualityFrom ?? ""} />
                </div>

                <div className="col-span-3">
                  <label className="label block mb-1">Than</label>
                  <input name="than" type="number" step="1" className="input-box mono text-right" defaultValue={formTransfer?.than ?? ""} />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Meters</label>
                  <input name="meters" type="number" step="any" className="input-box mono text-right" defaultValue={formTransfer?.meters ?? ""} />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Stock Than</label>
                  <input
                    name="stock_than"
                    type="number"
                    step="1"
                    className={roCls + " text-right"}
                    defaultValue={formTransfer?.stockThan ?? ""}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                <div className="col-span-3">
                  <label className="label block mb-1">Stock Mtr</label>
                  <input
                    name="stock_mtr"
                    type="number"
                    step="any"
                    className={roCls + " text-right"}
                    defaultValue={formTransfer?.stockMtr ?? ""}
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
              <div className="p-4 grid grid-cols-12 gap-3">
                <div className="col-span-6">
                  <label className="label block mb-1">Party To</label>
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <input name="party_to_code" className="input-box mono" placeholder="Code" />
                    <input
                      name="party_to"
                      list="gt-parties"
                      className="input-box mono"
                      placeholder="Description"
                      defaultValue={formTransfer?.partyTo ?? ""}
                    />
                  </div>
                </div>
                <div className="col-span-6">
                  <label className="label block mb-1">Quality</label>
                  <input name="quality_to" className="input-box mono" defaultValue={formTransfer?.qualityTo ?? ""} />
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
              {formTransfer && (
                <button
                  type="submit"
                  formAction={deleteTransfer}
                  className="btn btn-outline btn-sm"
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
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{t.partyFrom ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{t.partyTo ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{t.qualityFrom ?? "-"}</a></td>
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
