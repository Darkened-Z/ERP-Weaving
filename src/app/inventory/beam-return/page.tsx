import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { desc, eq, sql } from "drizzle-orm";
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

export default async function EmptyBeamReturnPage({
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

  const list = findFilter
    ? await db
        .select()
        .from(schema.intEmptyBeamReturn)
        .where(sql`
          ${schema.intEmptyBeamReturn.vNo} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intEmptyBeamReturn.szgWrpParty} LIKE ${pat} ESCAPE '\\' OR
          ${schema.intEmptyBeamReturn.convParty} LIKE ${pat} ESCAPE '\\'
        `)
        .orderBy(desc(schema.intEmptyBeamReturn.id))
    : await db.select().from(schema.intEmptyBeamReturn).orderBy(desc(schema.intEmptyBeamReturn.id));

  const selected = isEditing ? list.find((r) => r.id === idParam) ?? null : null;
  const editing = isAdding ? null : selected;

  const lines = editing
    ? await db
        .select()
        .from(schema.intEmptyBeamReturnLine)
        .where(eq(schema.intEmptyBeamReturnLine.returnId, editing.id))
        .orderBy(schema.intEmptyBeamReturnLine.srNo)
    : [];

  const upcomingVNo = nextVNoFromRows(list, "IBR");

  async function saveAction(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string | null;
    const id = idRaw ? parseInt(idRaw, 10) : NaN;

    const header = {
      vDate: txt(formData.get("vDate")) ?? new Date().toISOString().slice(0, 10),
      trnType: txt(formData.get("trnType")) ?? "SZG",
      statusType: txt(formData.get("statusType")) ?? "EXT",
      lvNo: intVal(formData.get("lvNo")),
      szgWrpParty: txt(formData.get("szgWrpParty")),
      convParty: txt(formData.get("convParty")),
      slipNo: txt(formData.get("slipNo")),
      despLoc: txt(formData.get("despLoc")),
      gpNo: txt(formData.get("gpNo")),
      vehRegNo: txt(formData.get("vehRegNo")),
      driverName: txt(formData.get("driverName")),
    };

    const beamHashes = formData.getAll("beamHash") as string[];
    const companies = formData.getAll("companyName") as string[];
    const weights = formData.getAll("emptyBWeight") as string[];

    const validLines: {
      srNo: number;
      beamHash: string | null;
      companyName: string | null;
      emptyBWeight: number | null;
    }[] = [];
    for (let i = 0; i < beamHashes.length; i++) {
      const bh = (beamHashes[i] || "").trim();
      const cn = (companies[i] || "").trim();
      const w = num(weights[i]);
      if (!bh && !cn && w == null) continue;
      validLines.push({
        srNo: validLines.length + 1,
        beamHash: bh || null,
        companyName: cn || null,
        emptyBWeight: w,
      });
    }

    const nowIso = new Date().toISOString();

    try {
      if (Number.isFinite(id) && id > 0) {
        await db.transaction(async (tx) => {
          await tx
            .update(schema.intEmptyBeamReturn)
            .set({ ...header, modifiedDate: nowIso })
            .where(eq(schema.intEmptyBeamReturn.id, id));
          await tx
            .delete(schema.intEmptyBeamReturnLine)
            .where(eq(schema.intEmptyBeamReturnLine.returnId, id));
          if (validLines.length) {
            await tx
              .insert(schema.intEmptyBeamReturnLine)
              .values(validLines.map((l) => ({ ...l, returnId: id })));
          }
        });
        revalidatePath("/inventory/beam-return");
        redirect(`/inventory/beam-return?id=${id}`);
      } else {
        const providedVNo = ((formData.get("vNo") as string) || "").trim();
        const newId = await db.transaction(async (tx) => {
          const existing = await tx.select({ vNo: schema.intEmptyBeamReturn.vNo }).from(schema.intEmptyBeamReturn);
          const vNo = providedVNo || nextVNoFromRows(existing, "IBR");
          const inserted = await tx
            .insert(schema.intEmptyBeamReturn)
            .values({ ...header, vNo, postedDate: nowIso })
            .returning({ id: schema.intEmptyBeamReturn.id });
          const insertedId = inserted[0].id;
          if (validLines.length) {
            await tx
              .insert(schema.intEmptyBeamReturnLine)
              .values(validLines.map((l) => ({ ...l, returnId: insertedId })));
          }
          return insertedId;
        });
        revalidatePath("/inventory/beam-return");
        redirect(`/inventory/beam-return?id=${newId}`);
      }
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "unknown";
      if (/UNIQUE|constraint/i.test(msg)) {
        redirect(`/inventory/beam-return?error=code_exists`);
      }
      throw e;
    }
  }

  async function deleteAction(formData: FormData) {
    "use server";
    const id = intVal(formData.get("id"));
    if (id === null) return;
    await db.transaction(async (tx) => {
      await tx.delete(schema.intEmptyBeamReturnLine).where(eq(schema.intEmptyBeamReturnLine.returnId, id));
      await tx.delete(schema.intEmptyBeamReturn).where(eq(schema.intEmptyBeamReturn.id, id));
    });
    revalidatePath("/inventory/beam-return");
    redirect(`/inventory/beam-return`);
  }

  const ROWS = Math.max(15, lines.length + 3);
  const showForm = !!editing || isAdding;

  return (
    <Shell active="beam-return">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">EMPTY BEAM RETURN ( WVG )</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {list.length} voucher{list.length === 1 ? "" : "s"}
              {findFilter ? ` matching "${findFilter}"` : ""}
            </p>
          </div>
          <ExcelExportButton
            rows={list.map((r) => ({
              vNo: r.vNo,
              vDate: r.vDate,
              trnType: r.trnType,
              statusType: r.statusType,
              szgWrpParty: r.szgWrpParty,
              convParty: r.convParty,
              gpNo: r.gpNo,
            }))}
            columns={[
              { key: "vNo", label: "V.No" },
              { key: "vDate", label: "Date" },
              { key: "trnType", label: "Trn Type" },
              { key: "statusType", label: "Status" },
              { key: "szgWrpParty", label: "Szg/Wrp Party" },
              { key: "convParty", label: "Conv Party" },
              { key: "gpNo", label: "GP No" },
            ]}
            filename="empty-beam-return"
            sheetName="EmptyBeamReturn"
          />
        </div>

        {params.error === "code_exists" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Voucher number already exists. Try again.
          </div>
        )}

        <form id="ibr-find-form" method="GET" action="/inventory/beam-return" className="hidden" />

        <div className="border border-black p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New — EMPTY BEAM RETURN" : editing ? `Edit — ${editing.vNo}` : "EMPTY BEAM RETURN"}
            </div>
            <div className="flex gap-2 no-print flex-wrap">
              <a href="/inventory/beam-return?adding=1" className="btn btn-outline btn-sm">New</a>
              <button type="submit" form="ibr-save-form" className="btn btn-sm">Save</button>
              <PrintButton label="Print" />
              {editing && (
                <form action={deleteAction} className="inline">
                  <input type="hidden" name="id" value={editing.id} />
                  <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                </form>
              )}
              <a href="/inventory/beam-return" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>

          {showForm && (
            <form id="ibr-save-form" action={saveAction}>
              {editing && <input type="hidden" name="id" value={editing.id} />}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-4 gap-y-3">
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Date</label>
                  <input name="vDate" type="date" className="input-box mono" defaultValue={editing?.vDate ?? today()} required />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Trn.Type</label>
                  <select name="trnType" className="input-box mono" defaultValue={editing?.trnType ?? "SZG"}>
                    <option value="SZG">SZG</option>
                    <option value="WVG">WVG</option>
                    <option value="WRP">WRP</option>
                    <option value="EXT">EXT</option>
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Status Type</label>
                  <select name="statusType" className="input-box mono" defaultValue={editing?.statusType ?? "EXT"}>
                    <option value="EXT">EXT</option>
                    <option value="INT">INT</option>
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">V. No</label>
                  <input name="vNo" className="input-box mono bg-gray-100" defaultValue={editing?.vNo ?? upcomingVNo} readOnly />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">LV.No</label>
                  <input name="lvNo" type="number" step="1" className="input-box mono bg-gray-100" defaultValue={editing?.lvNo ?? ""} readOnly />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Modified</label>
                  <input className="input-box mono bg-gray-100 text-[12px]" defaultValue={editing?.modifiedDate?.slice(0, 10) ?? ""} readOnly tabIndex={-1} />
                </div>

                <div className="lg:col-span-6">
                  <label className="label block mb-1">Szg / Wrp Party</label>
                  <input name="szgWrpParty" className="input-box mono" defaultValue={editing?.szgWrpParty ?? ""} />
                </div>
                <div className="lg:col-span-6">
                  <label className="label block mb-1">Conv. Party</label>
                  <input name="convParty" className="input-box mono" defaultValue={editing?.convParty ?? ""} />
                </div>

                <div className="lg:col-span-3">
                  <label className="label block mb-1">Slip No</label>
                  <input name="slipNo" className="input-box mono" defaultValue={editing?.slipNo ?? ""} />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Desp. Loc</label>
                  <input name="despLoc" className="input-box mono" defaultValue={editing?.despLoc ?? ""} />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">GP. No</label>
                  <input name="gpNo" className="input-box mono" defaultValue={editing?.gpNo ?? ""} />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Veh Reg. No</label>
                  <input name="vehRegNo" className="input-box mono" defaultValue={editing?.vehRegNo ?? ""} />
                </div>
                <div className="lg:col-span-2">
                  <label className="label block mb-1">Driver Name</label>
                  <input name="driverName" className="input-box mono" defaultValue={editing?.driverName ?? ""} />
                </div>
              </div>

              <div className="mt-6 border border-black">
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: "50px" }}>Sr.#</th>
                        <th style={{ width: "20%" }}>Beam #</th>
                        <th>Company Name</th>
                        <th style={{ width: "22%" }} className="text-right">Empty B.Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: ROWS }).map((_, i) => {
                        const l = lines[i];
                        return (
                          <tr key={i}>
                            <td className="mono text-[12px] text-center">{i + 1}</td>
                            <td><input name="beamHash" className="input-box mono text-[12px]" defaultValue={l?.beamHash ?? ""} /></td>
                            <td><input name="companyName" className="input-box mono text-[12px]" defaultValue={l?.companyName ?? ""} /></td>
                            <td><input name="emptyBWeight" type="number" step="0.01" className="input-box mono text-[12px] text-right" defaultValue={l?.emptyBWeight ?? ""} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[10px] text-[var(--muted)] mt-2 px-2">
                  Empty rows are ignored on save. On update, lines are replaced with the current grid.
                </div>
              </div>

              <div className="flex items-end gap-2 mt-6 no-print flex-wrap">
                <button type="submit" className="btn btn-sm">Save</button>
                <a href="/inventory/beam-return" className="btn btn-outline btn-sm">Exit</a>
                <div className="ml-auto">
                  <label className="label block mb-1">Password</label>
                  <input className="input-box mono" placeholder="password" type="password" />
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="border border-black">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Vouchers</div>
            <form className="flex gap-2" method="GET" action="/inventory/beam-return">
              <input name="find" className="input-box mono" defaultValue={params.find ?? ""} placeholder="Find V.No / Party" />
              <button className="btn btn-outline btn-sm" type="submit">Find</button>
            </form>
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.No</th>
                  <th>V.Date</th>
                  <th>Trn Type</th>
                  <th>Status</th>
                  <th>Szg/Wrp Party</th>
                  <th>Conv Party</th>
                  <th>GP No</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const isSel = r.id === selected?.id;
                  const href = `/inventory/beam-return?id=${r.id}`;
                  const style = { color: isSel ? "white" : "inherit" } as const;
                  return (
                    <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block" style={style}>{r.vNo}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.vDate}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.trnType ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.statusType ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>{r.szgWrpParty ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block" style={style}>{r.convParty ?? "-"}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block" style={style}>{r.gpNo ?? "-"}</a></td>
                    </tr>
                  );
                })}
                {list.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-[13px] text-[var(--muted)] py-6">No vouchers. Click <b>New</b> above to create one.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
