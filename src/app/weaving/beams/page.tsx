import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function BeamsPage() {
  const rows = await db.select().from(schema.beams).orderBy(schema.beams.beamNo);
  const beamStatuses = await db.select().from(schema.beamStatuses);

  const exportRows = rows.map((r) => ({
    ...r,
    shedLoom: r.loomNo ? `${r.shed ?? ""}${r.shed ? "-" : ""}${r.loomNo}` : "",
  }));

  const total = rows.length;
  const running = rows.filter((r) => r.statusWrk === "RUNNING").length;

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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono font-bold">{r.beamNo}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
