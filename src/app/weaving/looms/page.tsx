import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { AutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { LoomNoValidator } from "@/components/loom-no-validator";
import { UrlStrip } from "@/components/url-strip";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; q?: string; shed?: string }>;
}) {
  const params = await searchParams;
  const looms = await db.select().from(schema.looms).orderBy(schema.looms.loomNo);
  const shedFilter = (params.shed ?? "").trim();
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
  // Next loom # per shed — uses the max loom_no GLOBALLY so the suggestion
  // stays unique across every shed (loom_no is UNIQUE). Adding-mode gets it
  // via AutoFill; edit-mode users who change the shed also get an updated
  // suggestion so the loom # is refreshed to the next free number.
  const maxLoomNoGlobal = looms.reduce((m, l) => Math.max(m, l.loomNo), 0);
  const nextLoomByShed = Object.fromEntries(
    sheds.map((s) => [s, { loom_no: maxLoomNoGlobal + 1 }])
  );

  const q = (params.q ?? "").trim();
  const ql = q.toLowerCase();
  const shedFiltered = shedFilter ? looms.filter((l) => l.shed === shedFilter) : looms;
  // Next code for adding — max id + 1 (id is auto-increment PK; matches what SQLite will assign)
  const nextCode = looms.reduce((m, l) => Math.max(m, l.id), 0) + 1;
  const listed = !q
    ? shedFiltered
    : shedFiltered.filter(
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

  async function freeLoom(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string);
    if (!id) return;
    // Clear the loom's current beam / contract / product / work-status so the
    // loom becomes available for a new beam mount (Oracle: SET_LOOM_FREE).
    // Also detach the beam so it goes back to LOADED (empty on this loom).
    const [loom] = await db
      .select({ loomNo: schema.looms.loomNo, currentBeam: schema.looms.currentBeam })
      .from(schema.looms)
      .where(eq(schema.looms.id, id))
      .limit(1);
    if (!loom) redirect("/weaving/looms");
    await db.update(schema.looms).set({
      currentBeam: null,
      currentContract: null,
      currentProduct: null,
      statusWrk: "F",  // F = Free
    }).where(eq(schema.looms.id, id));
    if (loom.currentBeam) {
      await db.update(schema.beams).set({ statusWrk: "LOADED", loomNo: null })
        .where(eq(schema.beams.beamNo, loom.currentBeam));
    }
    revalidatePath("/weaving/looms");
    redirect(`/weaving/looms?id=${id}`);
  }

  return (
    <Shell active="looms">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">Looms Entries (WVG)</h1>
          <div className="flex items-center gap-4">
            <span className="text-[13px] text-[var(--muted)]">
              Status: A=Active · S=Stop · M=Maintenance · D=Dismantled | Wrk: R=Running · F=Free · B=Broken
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
              {formItem && (() => {
                const busy = !!(formItem.currentBeam || formItem.currentContract || formItem.statusWrk === "R");
                if (busy) {
                  return (
                    <form action={freeLoom} className="inline">
                      <input type="hidden" name="id" value={formItem.id} />
                      <ConfirmButton
                        message={`Free loom ${formItem.loomNo}? Any running beam/contract will be detached (beam goes back to LOADED).`}
                        title="Detach the current beam / contract and mark loom Free"
                      >
                        Free Loom
                      </ConfirmButton>
                    </form>
                  );
                }
                return (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled
                    title="Loom is already free — no beam/contract mounted"
                    style={{ opacity: 0.5, cursor: "not-allowed" }}
                  >
                    Free Loom
                  </button>
                );
              })()}
              {formItem && (
                <form action={deleteLoom} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <ConfirmButton>Delete</ConfirmButton>
                </form>
              )}
            </div>
          </div>

          {params.error && <UrlStrip param="error" />}
          {params.error === "dup" && (
            <div data-role="loom-error-banner" className="mb-3 border border-[var(--danger)] text-[var(--danger)] px-3 py-2 text-[12px] font-semibold flex items-center justify-between">
              <span>That loom number is already in use — pick a different one. The Code stays fixed.</span>
              <a
                href={formItem ? `/weaving/looms?id=${formItem.id}` : "/weaving/looms"}
                className="text-[11px] text-[var(--muted)] hover:text-[var(--danger)] mono"
                title="Dismiss"
              >
                ✕ close
              </a>
            </div>
          )}
          {params.error === "in_use" && (
            <div className="mb-3 border border-[var(--danger)] text-[var(--danger)] px-3 py-2 text-[12px] font-semibold flex items-center justify-between">
              <span>This loom is referenced by beams, production records, or has a current beam assigned. Clear the references before deleting.</span>
              <a
                href={formItem ? `/weaving/looms?id=${formItem.id}` : "/weaving/looms"}
                className="text-[11px] text-[var(--muted)] hover:text-[var(--danger)] mono"
                title="Dismiss"
              >
                ✕ close
              </a>
            </div>
          )}
          <form action={saveLoom}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}
            {/* AutoFill fires whenever shed changes — in both add AND edit modes.
                In edit mode, if the operator switches shed, loom_no is refreshed
                to the next globally-unique number. The inline LoomNoValidator
                catches any collision immediately if the operator manually types. */}
            <AutoFill watch="shed" map={nextLoomByShed} inputs={["loom_no"]} />
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-3">
              <div>
                <label className="label block mb-1">Code</label>
                <input className="input-box mono bg-gray-100" value={formItem ? String(formItem.id) : String(nextCode)} readOnly tabIndex={-1} />
              </div>
              <div>
                <label className="label block mb-1">Shed No</label>
                <Combobox name="shed" options={shedOpts} defaultValue={formItem?.shed ?? ""} className="input-box" />
              </div>
              <div>
                <label className="label block mb-1">Loom No</label>
                <input name="loom_no" type="number" className="input-box mono" defaultValue={formItem?.loomNo ?? ""} required />
                <LoomNoValidator
                  takenByLoomNo={Object.fromEntries(looms.map((l) => [String(l.loomNo), l.id]))}
                  currentId={formItem?.id}
                />
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
                  <option value="M">M - Maintenance</option>
                  <option value="D">D - Dismantled</option>
                </select>
              </div>
              <div>
                <label className="label block mb-1">Lm Allocation Type</label>
                <input name="lm_allocation" className="input-box" defaultValue={formItem?.make ?? "AP"} />
              </div>
              <div>
                <label className="label block mb-1">Status Wrk</label>
                <select name="status_wrk" className="input-box" defaultValue={formItem?.statusWrk ?? ""}>
                  <option value="">—</option>
                  <option value="R">R - Running (beam mounted)</option>
                  <option value="F">F - Free (ready for beam)</option>
                  <option value="S">S - Stopped</option>
                  <option value="B">B - Broken</option>
                  <option value="M">M - Maintenance</option>
                </select>
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

        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-[0.1em] font-semibold">Filter</span>
          <a
            href={q ? `/weaving/looms?q=${encodeURIComponent(q)}` : "/weaving/looms"}
            className={`btn btn-sm ${!shedFilter ? "" : "btn-outline"}`}
          >
            All ({looms.length})
          </a>
          {sheds.map((s) => {
            const n = looms.filter((l) => l.shed === s).length;
            const active = shedFilter === s;
            const href = `/weaving/looms?shed=${encodeURIComponent(s)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
            return (
              <a key={s} href={href} className={`btn btn-sm ${active ? "" : "btn-outline"}`}>
                Shed {s} ({n})
              </a>
            );
          })}
        </div>
        <form method="get" className="flex items-center gap-2 mb-3">
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Find</div>
          <input name="q" defaultValue={q} className="input-box flex-1 text-[13px]" placeholder="Find Loom Desc / Loom No..." />
          {shedFilter && <input type="hidden" name="shed" value={shedFilter} />}
          <button type="submit" className="btn btn-outline btn-sm">Find</button>
          {q && <a href={shedFilter ? `/weaving/looms?shed=${encodeURIComponent(shedFilter)}` : "/weaving/looms"} className="btn btn-outline btn-sm">Clear</a>}
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
