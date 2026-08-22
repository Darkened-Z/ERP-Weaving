import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const rows = await db.select().from(schema.beams).orderBy(schema.beams.beamNo);
  const beamStatuses = await db.select().from(schema.beamStatuses);
  const selected = params.id ? rows.find((r) => r.id === parseInt(params.id!)) ?? null : null;

  async function saveBeam(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string);
    if (!id) return;
    const txt = (k: string) => ((formData.get(k) as string) || "").trim() || null;
    const int = (k: string) => {
      const n = parseInt(formData.get(k) as string);
      return Number.isFinite(n) ? n : null;
    };
    await db.update(schema.beams).set({
      type: txt("type") ?? "WARP",
      partyTrade: txt("party_trade"),
      codeConv: txt("code_conv"),
      statusLoc: txt("status_loc"),
      szgParty: txt("szg_party"),
      shed: txt("shed"),
      loomNo: int("loom_no"),
      beamSetNo: txt("beam_set_no"),
      setStatus: txt("set_status"),
      statusWrk: txt("status_wrk") ?? "RUNNING",
    }).where(eq(schema.beams.id, id));
    revalidatePath("/weaving/beams");
    redirect(`/weaving/beams?id=${id}`);
  }

  const exportRows = rows.map((r) => ({
    ...r,
    shedLoom: r.loomNo ? `${r.shed ?? ""}${r.shed ? "-" : ""}${r.loomNo}` : "",
  }));

  const total = rows.length;

  return (
    <Shell active="beams">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Beams (WRP){" "}
            <span className="text-[var(--muted)] text-lg font-normal">({total})</span>
          </h1>
          <div className="flex items-center gap-2">
            <a href="/weaving/beams/qr" className="btn btn-outline btn-sm">Print QR Stickers</a>
            <a href="/tickets/new" className="btn btn-outline btn-sm">New Ticket</a>
            <ExcelExportButton
            rows={exportRows}
            columns={[
              { key: "beamNo", label: "Beams No" },
              { key: "partyTrade", label: "Party/Trade" },
              { key: "codeConv", label: "Code Conv" },
              { key: "statusLoc", label: "Status Loc" },
              { key: "szgParty", label: "Szg Party" },
              { key: "shedLoom", label: "Shed Loom No" },
              { key: "beamSetNo", label: "Beam Set No" },
              { key: "setStatus", label: "Set Status" },
              { key: "type", label: "Type" },
              { key: "brVno", label: "BR V.No" },
              { key: "brDate", label: "BR Date" },
              { key: "knVno", label: "Kn.V.No" },
              { key: "knDate", label: "Kn. Date" },
              { key: "statusWrk", label: "Status Wrk" },
            ]}
            filename="beams"
            sheetName="Beams"
          />
          </div>
        </div>

        <div className="border border-black p-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="label block mb-1">FIND LOOM#</label>
              <input className="input-box mono text-[13px]" placeholder="Loom No" />
            </div>
            <div>
              <label className="label block mb-1">FIND SHED#</label>
              <input className="input-box mono text-[13px]" placeholder="Shed No" />
            </div>
            <div>
              <label className="label block mb-1">FIND SETNO</label>
              <input className="input-box mono text-[13px]" placeholder="Set No" />
            </div>
            <div>
              <label className="label block mb-1">FIND BEAM</label>
              <input className="input-box mono text-[13px]" placeholder="Beam No" />
            </div>
            <div>
              <label className="label block mb-1">SZG PARTY</label>
              <input className="input-box mono text-[13px]" placeholder="Sizing Party" />
            </div>
            <div>
              <label className="label block mb-1">FIND STATUS</label>
              <select className="input-box text-[13px]">
                <option value="">All</option>
                {beamStatuses.map((s) => (
                  <option key={s.id} value={s.status}>{s.status}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <div>
              <label className="label block mb-1">Beam Prod</label>
              <select className="input-box text-[13px]">
                <option value="">All</option>
                <option value="WRP">WRP</option>
                <option value="WVG">WVG</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button className="btn btn-outline btn-sm">Clear</button>
              <a href="/" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>
        </div>

        {selected && (
          <div className="border border-black p-6 mb-6">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4 flex justify-between items-center">
              <span>Edit Beam — {selected.beamNo}</span>
              <a href="/weaving/beams" className="text-[var(--muted)] hover:text-[var(--fg)] no-underline">✕ Close</a>
            </div>
            <form action={saveBeam}>
              <input type="hidden" name="id" value={selected.id} />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
                <div><label className="label block mb-1">Type</label><input name="type" className="input-box mono" defaultValue={selected.type ?? ""} /></div>
                <div><label className="label block mb-1">Party/Trade</label><input name="party_trade" className="input-box" defaultValue={selected.partyTrade ?? ""} /></div>
                <div><label className="label block mb-1">Code Conv</label><input name="code_conv" className="input-box mono" defaultValue={selected.codeConv ?? ""} /></div>
                <div><label className="label block mb-1">Status Loc</label><input name="status_loc" className="input-box" defaultValue={selected.statusLoc ?? ""} /></div>
                <div><label className="label block mb-1">Szg Party</label><input name="szg_party" className="input-box" defaultValue={selected.szgParty ?? ""} /></div>
                <div><label className="label block mb-1">Shed</label><input name="shed" className="input-box mono" defaultValue={selected.shed ?? ""} /></div>
                <div><label className="label block mb-1">Loom No</label><input name="loom_no" type="number" className="input-box mono" defaultValue={selected.loomNo ?? ""} /></div>
                <div><label className="label block mb-1">Beam Set No</label><input name="beam_set_no" className="input-box mono" defaultValue={selected.beamSetNo ?? ""} /></div>
                <div><label className="label block mb-1">Set Status</label><input name="set_status" className="input-box" defaultValue={selected.setStatus ?? ""} /></div>
                <div>
                  <label className="label block mb-1">Status Wrk</label>
                  <select name="status_wrk" className="input-box" defaultValue={selected.statusWrk ?? "RUNNING"}>
                    <option value="RUNNING">RUNNING</option>
                    <option value="STOP">STOP</option>
                    {beamStatuses.filter((s) => !["RUNNING", "STOP"].includes(s.status)).map((s) => (
                      <option key={s.id} value={s.status}>{s.status}</option>
                    ))}
                    {selected.statusWrk && !["RUNNING", "STOP"].includes(selected.statusWrk) && !beamStatuses.some((s) => s.status === selected.statusWrk) && (
                      <option value={selected.statusWrk}>{selected.statusWrk}</option>
                    )}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="submit" className="btn btn-sm">Save</button>
                <a href="/weaving/beams" className="btn btn-outline btn-sm">Cancel</a>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Beams No</th>
                <th>Party/Trade</th>
                <th>Code Conv</th>
                <th>Status Loc</th>
                <th>Szg Party</th>
                <th>Shed Loom No</th>
                <th>Beam Set No</th>
                <th>Set Status</th>
                <th>Type</th>
                <th>BR V.No</th>
                <th>BR Date</th>
                <th>Kn.V.No</th>
                <th>Kn. Date</th>
                <th>Status Wrk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isSel = r.id === selected?.id;
                return (
                <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                  <td className="mono font-bold">
                    <a href={`/weaving/beams?id=${r.id}`} className="no-underline" style={{ color: isSel ? "white" : "inherit" }}>{r.beamNo}</a>
                  </td>
                  <td className="text-[13px]">{r.partyTrade ?? "-"}</td>
                  <td className="mono text-[13px]">{r.codeConv ?? "-"}</td>
                  <td className="text-[13px]">{r.statusLoc ?? "-"}</td>
                  <td className="text-[13px]">{r.szgParty ?? "-"}</td>
                  <td className="mono text-[13px]">{r.loomNo ? `${r.shed ?? ""}${r.shed ? "-" : ""}${r.loomNo}` : "-"}</td>
                  <td className="mono text-[13px]">{r.beamSetNo ?? "-"}</td>
                  <td className="text-[13px]">{r.setStatus ?? "-"}</td>
                  <td>{r.type}</td>
                  <td className="mono text-[13px]">{r.brVno ?? "-"}</td>
                  <td className="mono text-[13px]">{r.brDate ?? "-"}</td>
                  <td className="mono text-[13px]">{r.knVno ?? "-"}</td>
                  <td className="mono text-[13px]">{r.knDate ?? "-"}</td>
                  <td>
                    <span
                      className="inline-block px-2 py-0.5 text-[11px] font-bold uppercase"
                      style={{
                        background: r.statusWrk === "RUNNING" ? "black" : "transparent",
                        color: r.statusWrk === "RUNNING" ? "white" : "black",
                        border: "1px solid black",
                      }}
                    >
                      {r.statusWrk}
                    </span>
                  </td>
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
