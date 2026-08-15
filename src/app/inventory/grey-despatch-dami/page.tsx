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

function nextVNoFromRows(rows: { vNo: string }[], prefix: string): string {
  const nums = rows
    .map((r) => {
      const m = r.vNo?.match(new RegExp("^" + prefix + "-(\\d+)$"));
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return prefix + "-" + String(next).padStart(4, "0");
}

export default async function GreyDespatchDamiPage({
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

  const damis = findFilter
    ? await db
        .select()
        .from(schema.intGreyDespatchDami)
        .where(sql`
          ${schema.intGreyDespatchDami.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatchDami.party} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatchDami.doParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intGreyDespatchDami.remarks} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intGreyDespatchDami.id))
    : await db
        .select()
        .from(schema.intGreyDespatchDami)
        .orderBy(desc(schema.intGreyDespatchDami.id));

  const originals = await db
    .select({
      id: schema.intGreyDespatch.id,
      vNo: schema.intGreyDespatch.vNo,
      vDate: schema.intGreyDespatch.vDate,
      party: schema.intGreyDespatch.party,
      doParty: schema.intGreyDespatch.doParty,
    })
    .from(schema.intGreyDespatch)
    .orderBy(desc(schema.intGreyDespatch.id));

  const selected = isEditing ? damis.find((d) => d.id === idParam) ?? null : null;
  const formItem = isAdding ? null : selected;

  const selectedOriginal = formItem?.originalDespatchId
    ? originals.find((o) => o.id === formItem.originalDespatchId) ?? null
    : null;

  const upcomingVNo = nextVNoFromRows(damis, "IGDD");
  const upcomingLvNo = damis.length + 1;

  async function saveDami(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;
    const isUpdate = Number.isFinite(id) && id > 0;

    const originalDespatchId = intVal(formData.get("original_despatch_id"));
    let party: string | null = txt(formData.get("party"));
    let doParty: string | null = txt(formData.get("do_party"));

    if (originalDespatchId) {
      const [orig] = await db
        .select({
          party: schema.intGreyDespatch.party,
          doParty: schema.intGreyDespatch.doParty,
        })
        .from(schema.intGreyDespatch)
        .where(eq(schema.intGreyDespatch.id, originalDespatchId))
        .limit(1);
      if (orig) {
        party = orig.party;
        doParty = orig.doParty;
      }
    }

    const data = {
      vDate: txt(formData.get("v_date")) ?? today(),
      lvNo: intVal(formData.get("lv_no")),
      originalDespatchId,
      party,
      doParty,
      than: intVal(formData.get("than")),
      mtrs: num(formData.get("mtrs")),
      remarks: txt(formData.get("remarks")),
      printedAt: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
    };

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
          const providedVNo = txt(formData.get("v_no"));
          const vNo = providedVNo ?? nextVNoFromRows(existing, "IGDD");
          const [ins] = await tx
            .insert(schema.intGreyDespatchDami)
            .values({
              ...data,
              vNo,
              lvNo: data.lvNo ?? existing.length + 1,
              postedDate: new Date().toISOString(),
            })
            .returning({ id: schema.intGreyDespatchDami.id });
          did = ins.id;
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
  }

  async function deleteDami(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.delete(schema.intGreyDespatchDami).where(eq(schema.intGreyDespatchDami.id, id));
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

  return (
    <Shell active="grey-despatch-dami">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">GREY CLOTH DESPATCH DAMI</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {damis.length} dami slip{damis.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={damis.map((d) => ({
              vNo: d.vNo,
              vDate: d.vDate,
              party: d.party,
              doParty: d.doParty,
              than: d.than,
              mtrs: d.mtrs,
              remarks: d.remarks,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "party", label: "Party" },
              { key: "doParty", label: "Do Party" },
              { key: "than", label: "Than" },
              { key: "mtrs", label: "Mtrs" },
              { key: "remarks", label: "Remarks" },
            ]}
            filename="grey-despatch-dami"
            sheetName="DespatchDami"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-6">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{damis.length}</div>
            <div className="stat-label">Total Slips</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{formatNum(totals.than)}</div>
            <div className="stat-label">Total Than</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{formatNum(totals.mtrs)}</div>
            <div className="stat-label">Total Mtrs</div>
          </div>
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            V.No already exists. Try again.
          </div>
        )}

        <form id="dami-find-form" method="GET" action="/inventory/grey-despatch-dami" className="hidden"></form>

        <div className="border border-black p-5 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New — GREY CLOTH DESPATCH DAMI"
                : formItem
                ? `Edit — ${formItem.vNo}`
                : "GREY CLOTH DESPATCH DAMI"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/grey-despatch-dami?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="dami-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              <a href="/inventory/grey-despatch-dami" className="btn btn-outline btn-sm">Exit</a>
              {formItem && (
                <form action={deleteDami} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                </form>
              )}
            </div>
          </div>

          <form id="dami-save-form" action={saveDami}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}

            <div className="grid grid-cols-12 gap-3 mb-4">
              <div className="col-span-2">
                <label className="label block mb-1">Date</label>
                <input name="v_date" type="date" className="input-box mono" defaultValue={formItem?.vDate ?? today()} required />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">V.No</label>
                <input name="v_no" className="input-box mono bg-gray-100" defaultValue={formItem?.vNo ?? upcomingVNo} readOnly />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">LvNo</label>
                <input name="lv_no" type="number" className="input-box mono bg-gray-100 text-center" defaultValue={formItem?.lvNo ?? upcomingLvNo} readOnly />
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Printed At</label>
                <input className="input-box mono bg-gray-100 text-[11px]" defaultValue={formItem?.printedAt?.slice(0, 16).replace("T", " ") ?? ""} readOnly tabIndex={-1} />
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Find</label>
                <div className="flex gap-2">
                  <input form="dami-find-form" name="find" className="input-box mono flex-1" defaultValue={params.find ?? ""} placeholder="V.No / party" />
                  <button form="dami-find-form" type="submit" className="btn btn-outline btn-sm">Find</button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-3 mb-4">
              <div className="col-span-6">
                <label className="label block mb-1">Original Despatch</label>
                <select name="original_despatch_id" className="input-box mono text-[12px]" defaultValue={formItem?.originalDespatchId ?? ""}>
                  <option value="">— select despatch —</option>
                  {originals.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.vNo} — {o.party ?? "-"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Party (auto)</label>
                <input name="party" className="input-box mono bg-gray-100 text-[12px]" defaultValue={formItem?.party ?? selectedOriginal?.party ?? ""} readOnly />
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Do Party (auto)</label>
                <input name="do_party" className="input-box mono bg-gray-100 text-[12px]" defaultValue={formItem?.doParty ?? selectedOriginal?.doParty ?? ""} readOnly />
              </div>

              <div className="col-span-3">
                <label className="label block mb-1">Than</label>
                <input name="than" type="number" step="1" className="input-box mono text-right" defaultValue={formItem?.than ?? ""} />
              </div>
              <div className="col-span-3">
                <label className="label block mb-1">Mtrs</label>
                <input name="mtrs" type="number" step="any" className="input-box mono text-right" defaultValue={formItem?.mtrs ?? ""} />
              </div>

              <div className="col-span-12">
                <label className="label block mb-1">Remarks</label>
                <input name="remarks" className="input-box" defaultValue={formItem?.remarks ?? ""} />
              </div>
            </div>

            {formItem && (
              <div className="border border-black p-4 bg-gray-50 mb-4 print:bg-white">
                <div className="text-[11px] uppercase tracking-[0.1em] font-bold mb-2">
                  Duplicate Slip Preview
                </div>
                <div className="grid grid-cols-2 gap-3 text-[12px] mono">
                  <div><span className="text-[var(--muted)]">V.No:</span> <b>{formItem.vNo}</b></div>
                  <div><span className="text-[var(--muted)]">Date:</span> {formItem.vDate}</div>
                  <div><span className="text-[var(--muted)]">Party:</span> {formItem.party ?? "-"}</div>
                  <div><span className="text-[var(--muted)]">Do Party:</span> {formItem.doParty ?? "-"}</div>
                  <div><span className="text-[var(--muted)]">Than:</span> {formatNum(formItem.than)}</div>
                  <div><span className="text-[var(--muted)]">Mtrs:</span> {formatNum(formItem.mtrs)}</div>
                  {formItem.remarks && <div className="col-span-2"><span className="text-[var(--muted)]">Remarks:</span> {formItem.remarks}</div>}
                </div>
              </div>
            )}

            <div className="flex items-end gap-2 mt-5 flex-wrap">
              <button type="submit" className="btn btn-sm">Save</button>
              <a href="/inventory/grey-despatch-dami?adding=1" className="btn btn-outline btn-sm">New</a>
              <PrintButton label="Print Slip" />
              <a href="/inventory/grey-despatch-dami" className="btn btn-outline btn-sm">Exit</a>
              {formItem && (
                <form action={deleteDami} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                </form>
              )}
            </div>
          </form>
        </div>

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            Dami Slips
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>Date</th>
                  <th>Party</th>
                  <th>Do Party</th>
                  <th className="text-right">Than</th>
                  <th className="text-right">Mtrs</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {damis.map((d) => {
                  const isSel = d.id === selected?.id;
                  const href = `/inventory/grey-despatch-dami?id=${d.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={d.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono font-bold text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{d.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{d.vDate}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{d.party ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{d.doParty ?? "-"}</a></td>
                      <td className="text-right mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(d.than)}</a></td>
                      <td className="text-right mono text-[13px]"><a href={href} className="no-underline block" style={linkStyle}>{formatNum(d.mtrs)}</a></td>
                      <td className="text-[12px]"><a href={href} className="no-underline block" style={linkStyle}>{d.remarks ?? "-"}</a></td>
                    </tr>
                  );
                })}
                {damis.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-[13px] text-[var(--muted)] py-6">
                      No dami slips. Click <b>New</b> to create one.
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
