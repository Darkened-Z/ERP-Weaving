import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { AutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; q?: string }>;
}) {
  const params = await searchParams;
  const looms = await db.select().from(schema.looms).orderBy(schema.looms.loomNo);
  const weavers = await db.select().from(schema.weavers).orderBy(schema.weavers.code);

  const selected = params.id
    ? looms.find((l) => l.id === parseInt(params.id!)) ?? null
    : null;
  const isAdding = params.adding === "1";
  const formItem = isAdding ? null : selected;

  const sheds = [...new Set(looms.map((l) => l.shed))].sort();
  const shedOpts = sheds.map((s) => ({ value: s, label: s }));
  const formanOpts = [...new Set(looms.map((l) => l.forman).filter((f): f is string => !!f))]
    .sort()
    .map((f) => ({ value: f, label: f }));
  const nextLoomByShed = Object.fromEntries(
    sheds.map((s) => [
      s,
      { loom_no: looms.filter((l) => l.shed === s).reduce((m, l) => Math.max(m, l.loomNo), 0) + 1 },
    ])
  );

  const q = (params.q ?? "").trim();
  const ql = q.toLowerCase();
  const listed = !q
    ? looms
    : looms.filter(
        (l) =>
          String(l.loomNo).includes(ql) ||
          l.shed.toLowerCase().includes(ql) ||
          l.type.toLowerCase().includes(ql)
      );

  async function saveLoom(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const shed = (formData.get("shed") as string)?.trim();
    const loomNo = parseInt(formData.get("loom_no") as string);
    const type = (formData.get("loom_desc") as string)?.trim();
    if (!shed || !loomNo || !type) return;

    const rpm = parseInt(formData.get("loom_rpm") as string) || null;
    const actRpm = parseInt(formData.get("act_rpm") as string) || null;
    const weaverName = (formData.get("weaver_name") as string)?.trim() || null;
    const group = (formData.get("group") as string)?.trim() || null;
    const forman = (formData.get("forman") as string)?.trim() || null;
    const status = (formData.get("status") as string)?.trim() || "A";
    const make = (formData.get("lm_allocation") as string)?.trim() || null;
    const statusWrk = (formData.get("status_wrk") as string)?.trim() || null;

    // Pre-check for dup loom_no, EXCLUDING the current row on update.
    const conflict = await db
      .select({ id: schema.looms.id })
      .from(schema.looms)
      .where(eq(schema.looms.loomNo, loomNo))
      .limit(1);
    const conflictId = conflict[0]?.id;
    if (conflictId != null && (!id || parseInt(id) !== conflictId)) {
      redirect("/weaving/looms?error=dup" + (id ? `&id=${id}` : ""));
    }

    let ok = true;
    try {
      if (id) {
        await db.update(schema.looms).set({
          shed, loomNo, type, rpm, actRpm, weaverName, group, forman, status, make, statusWrk,
        }).where(eq(schema.looms.id, parseInt(id)));
      } else {
        await db.insert(schema.looms).values({
          shed, loomNo, type, rpm, actRpm, weaverName, group, forman, status, make, statusWrk,
        });
      }
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? "");
      const code = String((e as { code?: string })?.code ?? "");
      if (msg.includes("UNIQUE") || code === "SQLITE_CONSTRAINT_UNIQUE") ok = false;
      else throw e;
    }
    revalidatePath("/weaving/looms");
    if (!ok) redirect("/weaving/looms?error=dup" + (id ? `&id=${id}` : ""));
    redirect("/weaving/looms?id=" + (id || ""));
  }

  async function deleteLoom(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string);
    if (!id) return;

    const [loom] = await db
      .select({ id: schema.looms.id, loomNo: schema.looms.loomNo, currentBeam: schema.looms.currentBeam })
      .from(schema.looms)
      .where(eq(schema.looms.id, id))
      .limit(1);
    if (!loom) redirect("/weaving/looms");

    if (loom.currentBeam) {
      redirect(`/weaving/looms?id=${id}&error=in_use`);
    }

    const [beamRef] = await db
      .select({ id: schema.beams.id })
      .from(schema.beams)
      .where(eq(schema.beams.loomNo, loom.loomNo))
      .limit(1);
    const [dpRef] = await db
      .select({ id: schema.dailyProduction.id })
      .from(schema.dailyProduction)
      .where(eq(schema.dailyProduction.loomNo, loom.loomNo))
      .limit(1);
    const [ktRef] = await db
      .select({ id: schema.knottingTransactions.id })
      .from(schema.knottingTransactions)
      .where(eq(schema.knottingTransactions.loomNo, loom.loomNo))
      .limit(1);
    // int_daily_production references looms indirectly via set → beams → loom.
    // Approximation: any beam in the daily production set that carries this loom.
    const [intDpRef] = await db
      .select({ id: schema.intDailyProductionSet.id })
      .from(schema.intDailyProductionSet)
      .innerJoin(schema.beams, eq(schema.beams.beamNo, schema.intDailyProductionSet.beamNo))
      .where(eq(schema.beams.loomNo, loom.loomNo))
      .limit(1);

    if (beamRef || dpRef || ktRef || intDpRef) {
      redirect(`/weaving/looms?id=${id}&error=in_use`);
    }

    await db.delete(schema.looms).where(eq(schema.looms.id, id));
    revalidatePath("/weaving/looms");
    redirect("/weaving/looms");
  }

  return (
    <Shell active="looms">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">Looms Entries (WVG)</h1>
          <div className="flex items-center gap-4">
            <span className="text-[13px] text-[var(--muted)]">
              A=Active, S=Stop
            </span>
            <ExcelExportButton
              rows={looms}
              columns={[
                { key: "loomNo", label: "Loom" },
                { key: "shed", label: "Shed No" },
                { key: "type", label: "Loom Desc" },
                { key: "rpm", label: "RPM" },
                { key: "actRpm", label: "Act RPM" },
                { key: "currentContract", label: "Cont#" },
                { key: "weaverName", label: "Weaver Name" },
                { key: "group", label: "Group" },
                { key: "status", label: "Status" },
                { key: "make", label: "Lm Allocation" },
                { key: "statusWrk", label: "Status Wrk" },
              ]}
              filename="looms"
              sheetName="Looms"
            />
          </div>
        </div>

        <div className="border border-black p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding ? "New Loom" : formItem ? "Edit Loom" : "Loom Details"}
            </div>
            <div className="flex gap-2">
              <a href="/weaving/looms?adding=1" className="btn btn-outline btn-sm">New</a>
              {formItem && (
                <a
                  href={`/tickets/new?loom=${encodeURIComponent(formItem.loomNo)}`}
                  className="btn btn-outline btn-sm"
                >
                  Report Issue
                </a>
              )}
              {formItem && (
                <form action={deleteLoom} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <ConfirmButton>Delete</ConfirmButton>
                </form>
              )}
            </div>
          </div>

          {params.error === "dup" && (
            <div className="mb-3 border border-[var(--danger)] text-[var(--danger)] px-3 py-2 text-[12px] font-semibold">
              That loom number is already in use — pick a different one. The Code stays fixed.
            </div>
          )}
          {params.error === "in_use" && (
            <div className="mb-3 border border-[var(--danger)] text-[var(--danger)] px-3 py-2 text-[12px] font-semibold">
              This loom is referenced by beams, production records, or has a current beam assigned. Clear the references before deleting.
            </div>
          )}
          <form action={saveLoom}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}
            {!formItem && <AutoFill watch="shed" map={nextLoomByShed} inputs={["loom_no"]} />}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-3">
              <div>
                <label className="label block mb-1">Code</label>
                <input className="input-box mono bg-gray-100" value={formItem ? String(formItem.id) : "auto"} readOnly tabIndex={-1} />
              </div>
              <div>
                <label className="label block mb-1">Shed No</label>
                <Combobox name="shed" options={shedOpts} defaultValue={formItem?.shed ?? ""} className="input-box" />
              </div>
              <div>
                <label className="label block mb-1">Loom No</label>
                <input name="loom_no" type="number" className="input-box mono" defaultValue={formItem?.loomNo ?? ""} required />
              </div>
              <div>
                <label className="label block mb-1">Loom Desc</label>
                <input name="loom_desc" className="input-box" defaultValue={formItem?.type ?? ""} required />
              </div>
              <div>
                <label className="label block mb-1">Loom RPM</label>
                <input name="loom_rpm" type="number" className="input-box mono" defaultValue={formItem?.rpm ?? ""} />
              </div>
              <div>
                <label className="label block mb-1">Act. RPM</label>
                <input name="act_rpm" type="number" className="input-box mono" defaultValue={formItem?.actRpm ?? ""} />
              </div>
              <div>
                <label className="label block mb-1">Weaver Name</label>
                <select name="weaver_name" className="input-box" defaultValue={formItem?.weaverName ?? ""}>
                  <option value="">--</option>
                  {weavers.map((w) => (
                    <option key={w.id} value={w.name}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label block mb-1">Group</label>
                <select name="group" className="input-box" defaultValue={formItem?.group ?? ""}>
                  <option value="">--</option>
                  {["A", "B", "C", "D", "E", "F"].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label block mb-1">Forman</label>
                <Combobox name="forman" options={formanOpts} defaultValue={formItem?.forman ?? ""} className="input-box" />
              </div>
              <div>
                <label className="label block mb-1">Status</label>
                <select name="status" className="input-box" defaultValue={formItem?.status ?? "A"}>
                  <option value="A">A - Active</option>
                  <option value="S">S - Stop</option>
                </select>
              </div>
              <div>
                <label className="label block mb-1">Lm Allocation Type</label>
                <input name="lm_allocation" className="input-box" defaultValue={formItem?.make ?? "AP"} />
              </div>
              <div>
                <label className="label block mb-1">Status Wrk</label>
                <input name="status_wrk" className="input-box" defaultValue={formItem?.statusWrk ?? ""} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <div className="flex items-center gap-1 mr-2">
                <label className="label">Password</label>
                <input type="password" name="pswd" className="input-box mono w-28" tabIndex={-1} />
              </div>
              <button type="submit" className="btn btn-sm">Save</button>
              <a href="/weaving/looms" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </form>
        </div>

        <form method="get" className="flex items-center gap-2 mb-3">
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Find</div>
          <input name="q" defaultValue={q} className="input-box flex-1 text-[13px]" placeholder="Find Loom Desc / Loom No..." />
          <button type="submit" className="btn btn-outline btn-sm">Find</button>
          {q && <a href="/weaving/looms" className="btn btn-outline btn-sm">Clear</a>}
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Loom</th>
                <th>Shed No</th>
                <th>Loom Desc</th>
                <th className="text-right">RPM</th>
                <th>Cont#</th>
                <th>Weaver Name</th>
                <th>Group</th>
                <th>Status</th>
                <th className="text-right">Act RPM</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((l) => {
                const isSel = l.id === selected?.id;
                return (
                  <tr key={l.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                    <td className="mono font-bold">
                      <a href={`/weaving/looms?id=${l.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="no-underline" style={{ color: isSel ? "white" : "inherit" }}>
                        {l.id}
                      </a>
                    </td>
                    <td className="mono text-[13px]">{l.loomNo}</td>
                    <td className="mono text-[13px]">{l.shed}</td>
                    <td>{l.type}</td>
                    <td className="text-right mono">{l.rpm ?? "-"}</td>
                    <td className="mono text-[13px]">{l.currentContract ?? "-"}</td>
                    <td>{l.weaverName ?? "-"}</td>
                    <td className="text-center">{l.group ?? "-"}</td>
                    <td>
                      <span
                        className="inline-block px-2 py-0.5 text-[11px] font-bold uppercase"
                        style={{
                          background: l.status === "A" ? "black" : "transparent",
                          color: l.status === "A" ? "white" : isSel ? "white" : "black",
                          border: isSel ? "1px solid white" : "1px solid black",
                        }}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="text-right mono">{l.actRpm ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
