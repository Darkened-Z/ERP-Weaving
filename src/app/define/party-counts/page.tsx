import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function PartyCountsPage() {
  const counts = await db.select().from(schema.partyCounts).orderBy(schema.partyCounts.partyCode);

  return (
    <Shell active="party-counts">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Party Count</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {counts.length} party counts
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{counts.length}</div>
            <div className="stat-label">Total Party Counts</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Party Code</th>
              <th>Count Code</th>
              <th className="text-right">Rate/Lbs</th>
              <th className="text-right">Cal Weft</th>
              <th className="text-right">Cal Warp</th>
              <th>Status</th>
              <th>Type</th>
              <th>Group</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.id}>
                <td className="mono text-[13px]">{c.partyCode}</td>
                <td className="mono text-[13px]">{c.countCode}</td>
                <td className="mono text-[13px] text-right">
                  {c.ratePerLbs != null ? c.ratePerLbs.toFixed(2) : <span className="text-[var(--muted)]">&mdash;</span>}
                </td>
                <td className="mono text-[13px] text-right">
                  {c.calCountWeft != null ? c.calCountWeft.toFixed(2) : <span className="text-[var(--muted)]">&mdash;</span>}
                </td>
                <td className="mono text-[13px] text-right">
                  {c.calCountWarp != null ? c.calCountWarp.toFixed(2) : <span className="text-[var(--muted)]">&mdash;</span>}
                </td>
                <td>
                  {c.status ? (
                    <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">{c.status}</span>
                  ) : (
                    <span className="text-[var(--muted)]">&mdash;</span>
                  )}
                </td>
                <td>{c.trnType || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                <td>{c.countGroup || <span className="text-[var(--muted)]">&mdash;</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
