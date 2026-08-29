import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { FindingPicker } from "@/components/finding-picker";
import { AutoFill } from "@/components/auto-fill";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PartyCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; q?: string; error?: string }>;
}) {
  const params = await searchParams;
  const counts = await db.select().from(schema.partyCounts).orderBy(schema.partyCounts.partyCode);
  const yarnCounts = await db.select().from(schema.yarnCounts).orderBy(schema.yarnCounts.countCode);
  const accounts = await db.select().from(schema.chartOfAccounts).orderBy(schema.chartOfAccounts.code);

  const selected = params.id
    ? counts.find((c) => c.id === parseInt(params.id!)) ?? null
    : null;
  const isAdding = params.adding === "1";
  const formItem = isAdding ? null : selected;

  const partyDesc = formItem ? accounts.find((a) => a.code === formItem.partyCode)?.description ?? "" : "";
  const countDesc = formItem ? yarnCounts.find((y) => y.id === formItem.countCode)?.description ?? "" : "";

  // Level 5 leaf parties only — actual customer/vendor accounts (e.g. 1.01.01.10.0007).
  // Excludes L4 heads (like INTERNAL DEBTORS) which are group buckets, not parties.
  const partyOpts = accounts
    .filter((a) => a.level >= 5)
    .map((a) => ({ value: a.code, label: `${a.code} — ${a.description}`, desc: a.description }));
  // Strict finding-list rows for the Party field (value = account code). Picking
  // from this list is the only way to set the party, so no orphan codes.
  const partyFindRows = accounts
    .filter((a) => a.level >= 5)
    .map((a) => ({ value: a.code, code: a.code, description: a.description }));
  // Count label joins the yarn count description with its blend/type so operator
  // sees the full blend info (e.g. '2 — 30/S MVS PV 65:35' instead of '2 — 30/S MVS').
  const countOpts = yarnCounts
    .filter((y) => y.status === "A")
    .map((y) => {
      const label = [y.description, y.type].filter(Boolean).join(" ").trim();
      return { value: String(y.id), label: `${y.countCode} — ${label}`, desc: label };
    });

  const q = (params.q ?? "").trim();
  const ql = q.toLowerCase();
  const listed = !q
    ? counts
    : counts.filter((c) => {
        const cRow = yarnCounts.find((y) => y.id === c.countCode);
        const pDesc = accounts.find((a) => a.code === c.partyCode)?.description ?? "";
        return (
          c.partyCode.toLowerCase().includes(ql) ||
          pDesc.toLowerCase().includes(ql) ||
          (cRow?.countCode ?? "").toLowerCase().includes(ql) ||
          (cRow?.description ?? "").toLowerCase().includes(ql)
        );
      });

  async function savePartyCount(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const partyCode = (formData.get("party") as string)?.trim();
    const countCode = parseInt(formData.get("count") as string);
    if (!partyCode || !countCode) return;

    // Guard against orphan entries: the party must be a real account in the
    // chart. Prevents a typed/stale code (e.g. after a chart re-import) from
    // saving a party-count that never matches a selectable party.
    const [acct] = await db
      .select({ code: schema.chartOfAccounts.code })
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.code, partyCode))
      .limit(1);
    if (!acct) {
      redirect("/define/party-counts?" + (id ? `id=${id}&` : "adding=1&") + "error=bad_party");
    }

    const trnType = (formData.get("trn_type") as string)?.trim() || null;
    const countGroup = (formData.get("group") as string)?.trim() || null;
    const status = (formData.get("status_type") as string)?.trim() || null;
    const calCountWarp = parseFloat(formData.get("warp_cal") as string) || null;
    const calCountWeft = parseFloat(formData.get("weft_cal") as string) || null;
    const ratePerLbs = parseFloat(formData.get("rate_lbs") as string) || null;

    let dup = false;
    try {
      if (id) {
        await db.update(schema.partyCounts).set({
          partyCode, countCode, trnType, countGroup, status, calCountWarp, calCountWeft, ratePerLbs,
        }).where(eq(schema.partyCounts.id, parseInt(id)));
      } else {
        await db.insert(schema.partyCounts).values({
          partyCode, countCode, trnType, countGroup, status, calCountWarp, calCountWeft, ratePerLbs,
        });
      }
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? "");
      const code = String((e as { code?: string })?.code ?? "");
      if (msg.includes("UNIQUE") || code === "SQLITE_CONSTRAINT_UNIQUE") {
        dup = true;
      } else {
        throw e;
      }
    }
    if (dup) {
      redirect("/define/party-counts?" + (id ? `id=${id}&` : "adding=1&") + "error=dup");
    }
    revalidatePath("/define/party-counts");
    redirect("/define/party-counts" + (id ? `?id=${id}` : ""));
  }

  async function deletePartyCount(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string);
    if (!id) return;
    await db.delete(schema.partyCounts).where(eq(schema.partyCounts.id, id));
    revalidatePath("/define/party-counts");
    redirect("/define/party-counts");
  }

  return (
    <Shell active="party-counts">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Party Count (WVG/WRP){" "}
            <span className="text-[var(--muted)] text-lg font-normal">({counts.length})</span>
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="border border-black p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding ? "New Entry" : formItem ? "Edit Entry" : "Party Count Details"}
                </div>
                <div className="flex gap-2">
                  <a href="/define/party-counts?adding=1" className="btn btn-outline btn-sm">New</a>
                  {formItem && (
                    <form action={deletePartyCount} className="inline">
                      <input type="hidden" name="id" value={formItem.id} />
                      <ConfirmButton>Delete</ConfirmButton>
                    </form>
                  )}
                </div>
              </div>

              {params.error === "dup" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  This party + count combination already exists.
                </div>
              )}
              {params.error === "bad_party" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  That party account does not exist in the chart. Pick a party from the F9 list.
                </div>
              )}
              <form action={savePartyCount}>
                {formItem && <input type="hidden" name="id" value={formItem.id} />}
                <AutoFill
                  watch="trn_type"
                  map={{ WVG: { party: "" }, WRP: { party: "" }, RWD: { party: "" }, DBF: { party: "" } }}
                  combos={["party"]}
                />
                <div className="grid grid-cols-1 gap-y-3">
                  <div>
                    <label className="label block mb-1">Trn. Type</label>
                    <Combobox
                      name="trn_type"
                      options={[
                        { value: "WVG", label: "WVG" },
                        { value: "WRP", label: "WRP" },
                        { value: "RWD", label: "RWD" },
                        { value: "DBF", label: "DBF" },
                      ]}
                      defaultValue={formItem?.trnType ?? ""}
                      placeholder="--"
                      className="input-box"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label block mb-1">Party <span className="text-[10px] text-[var(--muted)]">(F9 — pick from list, no typing)</span></label>
                    <FindingPicker name="party" defaultValue={formItem?.partyCode ?? ""} rows={partyFindRows} title="ACCOUNT — FIND PARTY" placeholder="Select party" className="input-box mono text-[13px] cursor-pointer" />
                  </div>
                  <div>
                    <label className="label block mb-1">Count</label>
                    <Combobox name="count" options={countOpts} defaultValue={String(formItem?.countCode ?? "")} placeholder="Count Code (F9)" descTargetId="pc-count-desc" />
                  </div>
                  <div>
                    <label className="label block mb-1">Count Desc</label>
                    <input id="pc-count-desc" className="input-box bg-gray-50" defaultValue={countDesc} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="label block mb-1">Group</label>
                    <select name="group" className="input-box" defaultValue={formItem?.countGroup ?? ""}>
                      <option value="">--</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Status Type</label>
                    <select name="status_type" className="input-box" defaultValue={formItem?.status ?? ""}>
                      <option value="">--</option>
                      <option value="A">A</option>
                      <option value="R">R</option>
                      <option value="C">C</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label block mb-1">Warp Cal Count</label>
                      <input name="warp_cal" type="number" step="any" className="input-box mono" defaultValue={formItem?.calCountWarp ?? ""} />
                    </div>
                    <div>
                      <label className="label block mb-1">Weft Cal Count</label>
                      <input name="weft_cal" type="number" step="any" className="input-box mono" defaultValue={formItem?.calCountWeft ?? ""} />
                    </div>
                  </div>
                  <div>
                    <label className="label block mb-1">Rate(Lbs)</label>
                    <input name="rate_lbs" type="number" step="any" className="input-box mono" defaultValue={formItem?.ratePerLbs ?? ""} />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/define/party-counts" className="btn btn-outline btn-sm">Exit</a>
                </div>
              </form>
            </div>
          </div>

          <div>
            <form method="get" className="flex items-center gap-2 mb-3">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Find</div>
              <input name="q" defaultValue={q} className="input-box flex-1 text-[13px]" placeholder="Find Count Cal.Count, Code..." />
              <button type="submit" className="btn btn-outline btn-sm">Find</button>
              {q && <a href="/define/party-counts" className="btn btn-outline btn-sm">Clear</a>}
            </form>
            <div className="overflow-x-auto" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Pc Party Code</th>
                    <th>Count Code</th>
                    <th>Count Desc</th>
                    <th>Trn. Type</th>
                    <th>Party Desc</th>
                    <th className="text-right">Warp Cal Count</th>
                    <th className="text-right">Weft Cal Count</th>
                    <th className="text-right">Rate (Lbs)</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((c) => {
                    const isSel = c.id === selected?.id;
                    const rowHref = `/define/party-counts?id=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
                    const linkStyle = { color: isSel ? "white" : "inherit" };
                    const cDesc = yarnCounts.find((y) => y.id === c.countCode)?.description ?? "";
                    const pDesc = accounts.find((a) => a.code === c.partyCode)?.description ?? "";
                    return (
                      <tr key={c.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td className="mono text-[12px] p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                            {c.partyCode}
                          </a>
                        </td>
                        <td className="mono text-[12px] p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                            {c.countCode}
                          </a>
                        </td>
                        <td className="text-[13px] p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                            {cDesc}
                          </a>
                        </td>
                        <td className="p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                            {c.trnType ?? "-"}
                          </a>
                        </td>
                        <td className="text-[13px] p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1" style={linkStyle}>
                            {pDesc}
                          </a>
                        </td>
                        <td className="mono text-[13px] text-right p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1 text-right" style={linkStyle}>
                            {c.calCountWarp?.toFixed(2) ?? "-"}
                          </a>
                        </td>
                        <td className="mono text-[13px] text-right p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1 text-right" style={linkStyle}>
                            {c.calCountWeft?.toFixed(2) ?? "-"}
                          </a>
                        </td>
                        <td className="mono text-[13px] text-right p-0">
                          <a href={rowHref} className="no-underline block px-2 py-1 text-right" style={linkStyle}>
                            {c.ratePerLbs?.toFixed(2) ?? "-"}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
