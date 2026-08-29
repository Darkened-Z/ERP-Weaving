import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BeamsPage({
  searchParams,
}: {
  searchParams: Promise<{
    id?: string;
    adding?: string;
    error?: string;
    beam?: string;
    loom?: string;
    shed?: string;
    set?: string;
    szg?: string;
    status?: string;
    prod?: string;
  }>;
}) {
  const params = await searchParams;
  const rows = await db.select().from(schema.beams).orderBy(schema.beams.beamNo);
  const beamStatuses = await db.select().from(schema.beamStatuses);
  const accounts = await db.select().from(schema.chartOfAccounts).orderBy(schema.chartOfAccounts.code);
  const looms = await db
    .select({ loomNo: schema.looms.loomNo, shed: schema.looms.shed })
    .from(schema.looms)
    .orderBy(schema.looms.shed, schema.looms.loomNo);
  const loomOpts = looms.map((l) => ({
    value: String(l.loomNo),
    label: `Shed ${l.shed} · Loom ${l.loomNo}`,
    filterKey: l.shed,
  }));
  const selected = params.id ? rows.find((r) => r.id === parseInt(params.id!)) ?? null : null;
  const isAdding = params.adding === "1";

  // Beams store party names as free text (seed never set them), so the option
  // value is the account description, not the account code.
  const partyOpts = accounts
    .filter((a) => a.level >= 5)
    .map((a) => ({ value: a.description, label: `${a.code} — ${a.description}` }));

  const f = {
    beam: (params.beam ?? "").trim(),
    loom: (params.loom ?? "").trim(),
    shed: (params.shed ?? "").trim(),
    set: (params.set ?? "").trim(),
    szg: (params.szg ?? "").trim(),
    status: (params.status ?? "").trim(),
    prod: (params.prod ?? "").trim(),
  };
  const loomN = f.loom ? parseInt(f.loom, 10) : null;
  const has = (v: string | null, needle: string) => (v ?? "").toLowerCase().includes(needle.toLowerCase());
  const listed = rows.filter(
    (r) =>
      (!f.beam || has(r.beamNo, f.beam)) &&
      (loomN === null || r.loomNo === loomN) &&
      (!f.shed || has(r.shed, f.shed)) &&
      (!f.set || has(r.setNo, f.set) || has(r.beamSetNo, f.set)) &&
      (!f.szg || has(r.szgParty, f.szg)) &&
      (!f.status || r.statusWrk === f.status) &&
      (!f.prod || r.type === f.prod)
  );
  const filterQS = Object.entries(f)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  async function createBeam(formData: FormData) {
    "use server";
    const txt = (k: string) => ((formData.get(k) as string) || "").trim() || null;
    const beamNo = txt("beam_no");
    if (!beamNo) return;
    const loomNoRaw = parseInt(formData.get("loom_no") as string);

    let insertedId: number | null = null;
    let dup = false;
    try {
      const [inserted] = await db.insert(schema.beams).values({
        beamNo,
        type: txt("type") ?? "WARP",
        partyTrade: txt("party_trade"),
        codeConv: txt("code_conv"),
        statusLoc: txt("status_loc"),
        szgParty: txt("szg_party"),
        shed: txt("shed"),
        loomNo: Number.isFinite(loomNoRaw) ? loomNoRaw : null,
        setNo: txt("set_no"),
        beamSetNo: txt("beam_set_no"),
        statusWrk: "EMPTY",
      }).returning({ id: schema.beams.id });
      insertedId = inserted.id;
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? "");
      const code = String((e as { code?: string })?.code ?? "");
      if (msg.includes("UNIQUE") || code === "SQLITE_CONSTRAINT_UNIQUE") {
        dup = true;
      } else {
        throw e;
      }
    }
    if (dup) redirect("/weaving/beams?adding=1&error=dup");
    revalidatePath("/weaving/beams");
    redirect(`/weaving/beams?id=${insertedId}`);
  }

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
      contractNo: txt("contract_no"),
      statusLoc: txt("status_loc"),
      szgParty: txt("szg_party"),
      shed: txt("shed"),
      loomNo: int("loom_no"),
      setNo: txt("set_no"),
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
            <a href="/weaving/beams?adding=1" className="btn btn-sm">Add Beam</a>
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

        <form method="get" className="border border-black p-4 mb-6">
          {params.id && <input type="hidden" name="id" value={params.id} />}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="label block mb-1">FIND LOOM#</label>
              <input name="loom" defaultValue={f.loom} className="input-box mono text-[13px]" placeholder="Loom No" />
            </div>
            <div>
              <label className="label block mb-1">FIND SHED#</label>
              <input name="shed" defaultValue={f.shed} className="input-box mono text-[13px]" placeholder="Shed No" />
            </div>
            <div>
              <label className="label block mb-1">FIND SETNO</label>
              <input name="set" defaultValue={f.set} className="input-box mono text-[13px]" placeholder="Set No" />
            </div>
            <div>
              <label className="label block mb-1">FIND BEAM</label>
              <input name="beam" defaultValue={f.beam} className="input-box mono text-[13px]" placeholder="Beam No" />
            </div>
            <div>
              <label className="label block mb-1">SZG PARTY</label>
              <input name="szg" defaultValue={f.szg} className="input-box mono text-[13px]" placeholder="Sizing Party" />
            </div>
            <div>
              <label className="label block mb-1">FIND STATUS</label>
              <select name="status" defaultValue={f.status} className="input-box text-[13px]">
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
              <select name="prod" defaultValue={f.prod} className="input-box text-[13px]">
                <option value="">All</option>
                <option value="WRP">WRP</option>
                <option value="WVG">WVG</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="btn btn-sm">Find</button>
              <a href="/weaving/beams" className="btn btn-outline btn-sm">Clear</a>
              <a href="/" className="btn btn-outline btn-sm">Exit</a>
            </div>
          </div>
        </form>

        {isAdding && (
          <div className="border border-black p-6 mb-6">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4 flex justify-between items-center">
              <span>New Beam</span>
              <a href="/weaving/beams" className="text-[var(--muted)] hover:text-[var(--fg)] no-underline">✕ Close</a>
            </div>
            {params.error === "dup" && (
              <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                That beam number already exists. Choose a different one.
              </div>
            )}
            <form action={createBeam}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
                <div><label className="label block mb-1">Beams No</label><input name="beam_no" className="input-box mono" required autoFocus /></div>
                <div><label className="label block mb-1">Type</label><input name="type" className="input-box mono" defaultValue="WARP" /></div>
                <div><label className="label block mb-1">Party/Trade</label><Combobox name="party_trade" options={partyOpts} className="input-box" placeholder="Party (F9)" /></div>
                <div><label className="label block mb-1">Code Conv</label><input name="code_conv" className="input-box mono" /></div>
                <div><label className="label block mb-1">Status Loc</label><input name="status_loc" className="input-box" /></div>
                <div><label className="label block mb-1">Szg Party</label><Combobox name="szg_party" options={partyOpts} className="input-box" placeholder="Sizing Party (F9)" /></div>
                <div><label className="label block mb-1">Shed No</label><input name="shed" className="input-box mono" /></div>
                <div><label className="label block mb-1">Loom No</label><Combobox name="loom_no" options={loomOpts} filterByField="shed" className="input-box mono" placeholder="Loom (set Shed first)" /></div>
                <div><label className="label block mb-1">Set#</label><input name="set_no" className="input-box mono" /></div>
                <div><label className="label block mb-1">Beam Set No</label><input name="beam_set_no" className="input-box mono" /></div>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="submit" className="btn btn-sm">Save</button>
                <a href="/weaving/beams" className="btn btn-outline btn-sm">Cancel</a>
              </div>
            </form>
          </div>
        )}

        {selected && !isAdding && (
          <div className="border border-black p-6 mb-6">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4 flex justify-between items-center">
              <span>Edit Beam — {selected.beamNo}</span>
              <a href="/weaving/beams" className="text-[var(--muted)] hover:text-[var(--fg)] no-underline">✕ Close</a>
            </div>
            <form action={saveBeam}>
              <input type="hidden" name="id" value={selected.id} />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3">
                <div><label className="label block mb-1">Type</label><input name="type" className="input-box mono" defaultValue={selected.type ?? ""} /></div>
                <div><label className="label block mb-1">Party/Trade</label><Combobox name="party_trade" options={partyOpts} defaultValue={selected.partyTrade ?? ""} className="input-box" /></div>
                <div><label className="label block mb-1">Code Conv</label><input name="code_conv" className="input-box mono" defaultValue={selected.codeConv ?? ""} /></div>
                <div><label className="label block mb-1">Conv Cont</label><input name="contract_no" className="input-box mono" defaultValue={selected.contractNo ?? ""} /></div>
                <div><label className="label block mb-1">Status Loc</label><input name="status_loc" className="input-box" defaultValue={selected.statusLoc ?? ""} /></div>
                <div><label className="label block mb-1">Szg Party</label><Combobox name="szg_party" options={partyOpts} defaultValue={selected.szgParty ?? ""} className="input-box" /></div>
                <div><label className="label block mb-1">Shed No</label><input name="shed" className="input-box mono" defaultValue={selected.shed ?? ""} /></div>
                <div><label className="label block mb-1">Loom No</label><Combobox name="loom_no" options={loomOpts} filterByField="shed" defaultValue={selected.loomNo != null ? String(selected.loomNo) : ""} className="input-box mono" placeholder="Loom (set Shed first)" /></div>
                <div><label className="label block mb-1">Set#</label><input name="set_no" className="input-box mono" defaultValue={selected.setNo ?? ""} /></div>
                <div><label className="label block mb-1">Beam Set No</label><input name="beam_set_no" className="input-box mono" defaultValue={selected.beamSetNo ?? ""} /></div>
                <div><label className="label block mb-1">Set Status</label><input name="set_status" className="input-box" defaultValue={selected.setStatus ?? ""} /></div>
                <div>
                  <label className="label block mb-1">Status Wrk</label>
                  <select name="status_wrk" className="input-box" defaultValue={selected.statusWrk ?? "RUNNING"}>
                    {beamStatuses.map((s) => (
                      <option key={s.id} value={s.status}>{s.status}</option>
                    ))}
                    {selected.statusWrk && !beamStatuses.some((s) => s.status === selected.statusWrk) && (
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
                <th>Conv Cont</th>
                <th>Status Loc</th>
                <th>Szg Party</th>
                <th>Shed No</th>
                <th>Loom No</th>
                <th>Set#</th>
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
              {listed.map((r) => {
                const isSel = r.id === selected?.id;
                const rowHref = `/weaving/beams?id=${r.id}${filterQS ? `&${filterQS}` : ""}`;
                const linkCls = "block px-2 py-1 no-underline";
                const linkStyle = { color: isSel ? "white" : "inherit" };
                return (
                <tr key={r.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                  <td className="p-0 mono font-bold"><a href={rowHref} className={linkCls} style={linkStyle}>{r.beamNo}</a></td>
                  <td className="p-0 text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.partyTrade ?? "-"}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.codeConv ?? "-"}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.contractNo ?? "-"}</a></td>
                  <td className="p-0 text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.statusLoc ?? "-"}</a></td>
                  <td className="p-0 text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.szgParty ?? "-"}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.shed ?? "-"}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.loomNo ?? "-"}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.setNo ?? "-"}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.beamSetNo ?? "-"}</a></td>
                  <td className="p-0 text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.setStatus ?? "-"}</a></td>
                  <td className="p-0"><a href={rowHref} className={linkCls} style={linkStyle}>{r.type}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.brVno ?? "-"}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.brDate ?? "-"}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.knVno ?? "-"}</a></td>
                  <td className="p-0 mono text-[13px]"><a href={rowHref} className={linkCls} style={linkStyle}>{r.knDate ?? "-"}</a></td>
                  <td className="p-0">
                    <a href={rowHref} className={linkCls} style={linkStyle}>
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
                    </a>
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
