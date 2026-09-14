import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql, desc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PakiParchiPage() {
  const rows = await db
    .select()
    .from(schema.greyPakiParchi)
    .orderBy(sql`pp_date DESC`);

  // Load all Dami vouchers that are linked to a Pakki Parchi
  const damiLinks = await db
    .select({
      id: schema.intGreyDespatchDami.id,
      vNo: schema.intGreyDespatchDami.vNo,
      vDate: schema.intGreyDespatchDami.vDate,
      pakki_parchi_id: schema.intGreyDespatchDami.pakki_parchi_id,
      subParty: schema.intGreyDespatchDami.subParty,
      than: schema.intGreyDespatchDami.than,
      mtrs: schema.intGreyDespatchDami.mtrs,
      printingLocation: schema.intGreyDespatchDami.printingLocation,
    })
    .from(schema.intGreyDespatchDami)
    .where(sql`${schema.intGreyDespatchDami.pakki_parchi_id} IS NOT NULL`)
    .orderBy(desc(schema.intGreyDespatchDami.id));

  // Grey cloth despatches for the same conversion contract. A Pakki Parchi and a
  // despatch meet on the contract, so the parchi can show what has gone out
  // against it without the operator opening the despatch register separately.
  const despatches = await db
    .select({
      id: schema.intGreyDespatch.id,
      vNo: schema.intGreyDespatch.vNo,
      vDate: schema.intGreyDespatch.vDate,
      party: schema.intGreyDespatch.party,
      convContNo: schema.intGreyDespatch.convContNo,
      gpNo: schema.intGreyDespatch.gpNo,
      thanQty: schema.intGreyDespatch.thanQty,
    })
    .from(schema.intGreyDespatch)
    .orderBy(desc(schema.intGreyDespatch.id));
  const despByContract = new Map<string, typeof despatches>();
  for (const d of despatches) {
    const k = (d.convContNo ?? "").trim();
    if (!k) continue;
    if (!despByContract.has(k)) despByContract.set(k, []);
    despByContract.get(k)!.push(d);
  }

  // Build a map: pakki_parchi_id → list of dami vouchers
  const damiByPP = new Map<number, typeof damiLinks>();
  for (const d of damiLinks) {
    if (d.pakki_parchi_id == null) continue;
    if (!damiByPP.has(d.pakki_parchi_id)) damiByPP.set(d.pakki_parchi_id, []);
    damiByPP.get(d.pakki_parchi_id)!.push(d);
  }

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const totalThan = rows.reduce((s, r) => s + (r.qtyThan ?? 0), 0);
  const totalNet = rows.reduce((s, r) => s + (r.qtyMtrsNet ?? 0), 0);
  const totalAmt = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const linkedCount = rows.filter((r) => damiByPP.has(r.id)).length;

  return (
    <Shell active="paki-parchi">
      <div className="animate-in">
        <div className="mb-6">
          <h1 className="page-title">Grey Paki Parchi</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} delivery receipts &nbsp;·&nbsp;
            <span className="text-green-600 font-semibold">{linkedCount} linked to Dami Vouchers</span>
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-5"><div className="stat-value">{rows.length}</div><div className="stat-label">Receipts</div></div>
          <div className="bg-white p-5"><div className="stat-value">{formatNum(totalThan)}</div><div className="stat-label">Total Than</div></div>
          <div className="bg-white p-5"><div className="stat-value">{formatNum(totalNet)}</div><div className="stat-label">Net Meters</div></div>
          <div className="bg-white p-5"><div className="stat-value">{formatNum(totalAmt)}</div><div className="stat-label">Total Amount</div></div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>PP No.</th>
                <th>Party</th>
                <th>Contract</th>
                <th className="text-right">Than</th>
                <th className="text-right">Meters</th>
                <th className="text-right">Net Mtrs</th>
                <th className="text-right">Pick</th>
                <th className="text-right">Width</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
                <th>Grey Despatch</th>
                <th>Dami Voucher</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const damis = damiByPP.get(r.id) ?? [];
                return (
                  <tr key={r.id} className={damis.length > 0 ? "bg-green-50" : ""}>
                    <td className="mono text-[13px]">{r.ppDate}</td>
                    <td className="mono font-bold">{r.ppNo}</td>
                    <td className="text-[13px]">
                      <div>{r.party}</div>
                      {r.partyCode && <div className="text-[11px] text-[var(--muted)]">{r.partyCode}</div>}
                    </td>
                    <td className="mono text-[13px]">{r.contractNo ?? "—"}</td>
                    <td className="text-right mono">{r.qtyThan ?? "—"}</td>
                    <td className="text-right mono">{r.qtyMtrs != null ? formatNum(r.qtyMtrs) : "—"}</td>
                    <td className="text-right mono">{r.qtyMtrsNet != null ? formatNum(r.qtyMtrsNet) : "—"}</td>
                    <td className="text-right mono">{r.greyPick ?? "—"}</td>
                    <td className="text-right mono">{r.greyWidth ?? "—"}</td>
                    <td className="text-right mono">{r.rate ?? "—"}</td>
                    <td className="text-right mono font-bold">{r.amount != null ? formatNum(r.amount) : "—"}</td>
                    <td>
                      {(() => {
                        const ds = despByContract.get((r.contractNo ?? "").trim()) ?? [];
                        if (!ds.length) return <span className="text-[11px] text-[var(--muted)]">—</span>;
                        return (
                          <div className="flex flex-col gap-1">
                            {ds.map((d) => (
                              <div key={d.id} className="flex items-center gap-2">
                                <Link
                                  href={`/inventory/grey-despatch?id=${d.id}`}
                                  className="text-[var(--accent)] font-bold text-[12px] mono hover:underline"
                                >
                                  {d.vNo}
                                </Link>
                                <span className="text-[11px] text-[var(--muted)]">{d.vDate}</span>
                                {d.gpNo && (
                                  <span className="text-[10px] mono text-[var(--muted)]">OGP #{d.gpNo}</span>
                                )}
                              </div>
                            ))}
                            <Link
                              href={`/reports/weaving/delivery-order-partywise?party=${encodeURIComponent(r.party ?? "")}`}
                              className="text-[10px] px-2 py-0.5 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white w-fit"
                            >
                              Delivery Order
                            </Link>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      {damis.length === 0 ? (
                        <span className="text-[11px] text-[var(--muted)]">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {damis.map((d) => (
                            <div key={d.id} className="flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
                              <Link
                                href={`/inventory/grey-despatch-dami?id=${d.id}`}
                                className="text-[var(--accent)] font-bold text-[12px] mono hover:underline"
                              >
                                {d.vNo}
                              </Link>
                              <span className="text-[11px] text-[var(--muted)]">{d.vDate}</span>
                              <Link
                                href={`/inventory/grey-despatch-dami/${d.id}/voucher`}
                                target="_blank"
                                className="text-[10px] px-2 py-0.5 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
                              >
                                Voucher
                              </Link>
                            </div>
                          ))}
                        </div>
                      )}
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
