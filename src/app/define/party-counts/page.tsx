import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PartyCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string }>;
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

  async function savePartyCount(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const partyCode = (formData.get("party") as string)?.trim();
    const countCode = parseInt(formData.get("count") as string);
    if (!partyCode || !countCode) return;

    const trnType = (formData.get("trn_type") as string)?.trim() || null;
    const countGroup = (formData.get("group") as string)?.trim() || null;
    const status = (formData.get("status_type") as string)?.trim() || null;
    const calCountWarp = parseFloat(formData.get("warp_cal") as string) || null;
    const calCountWeft = parseFloat(formData.get("weft_cal") as string) || null;
    const ratePerLbs = parseFloat(formData.get("rate_lbs") as string) || null;

    if (id) {
      await db.update(schema.partyCounts).set({
        partyCode, countCode, trnType, countGroup, status, calCountWarp, calCountWeft, ratePerLbs,
      }).where(eq(schema.partyCounts.id, parseInt(id)));
    } else {
      await db.insert(schema.partyCounts).values({
        partyCode, countCode, trnType, countGroup, status, calCountWarp, calCountWeft, ratePerLbs,
      });
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
                      <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                    </form>
                  )}
                </div>
              </div>

              <form action={savePartyCount}>
                {formItem && <input type="hidden" name="id" value={formItem.id} />}
                <div className="grid grid-cols-1 gap-y-3">
                  <div>
                    <label className="label block mb-1">Trn. Type</label>
                    <select name="trn_type" className="input-box" defaultValue={formItem?.trnType ?? ""}>
                      <option value="">--</option>
                      <option value="WVG">WVG</option>
                      <option value="WRP">WRP</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Party</label>
                    <input name="party" className="input-box mono" defaultValue={formItem?.partyCode ?? ""} required placeholder="Party Code (F9)" />
                  </div>
                  <div>
                    <label className="label block mb-1">PartyDesc</label>
                    <input className="input-box bg-gray-50" value={partyDesc} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="label block mb-1">Count</label>
                    <input name="count" type="number" className="input-box mono" defaultValue={formItem?.countCode ?? ""} required placeholder="Count Code (F9)" />
                  </div>
                  <div>
                    <label className="label block mb-1">Count Desc</label>
                    <input className="input-box bg-gray-50" value={countDesc} readOnly tabIndex={-1} />
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
            <div className="flex items-center gap-2 mb-3">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Find</div>
              <input className="input-box flex-1 text-[13px]" placeholder="Find Count Cal.Count, Code..." />
            </div>
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
                  {counts.map((c) => {
                    const isSel = c.id === selected?.id;
                    const cDesc = yarnCounts.find((y) => y.id === c.countCode)?.description ?? "";
                    const pDesc = accounts.find((a) => a.code === c.partyCode)?.description ?? "";
                    return (
                      <tr key={c.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td className="mono text-[12px]">
                          <a href={`/define/party-counts?id=${c.id}`} className="no-underline" style={{ color: isSel ? "white" : "inherit" }}>
                            {c.partyCode}
                          </a>
                        </td>
                        <td className="mono text-[12px]">{c.countCode}</td>
                        <td className="text-[13px]">{cDesc}</td>
                        <td>{c.trnType ?? "-"}</td>
                        <td className="text-[13px]">{pDesc}</td>
                        <td className="mono text-[13px] text-right">{c.calCountWarp?.toFixed(2) ?? "-"}</td>
                        <td className="mono text-[13px] text-right">{c.calCountWeft?.toFixed(2) ?? "-"}</td>
                        <td className="mono text-[13px] text-right">{c.ratePerLbs?.toFixed(2) ?? "-"}</td>
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
