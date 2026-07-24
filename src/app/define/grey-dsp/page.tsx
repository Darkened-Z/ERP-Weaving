import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function GreyDspPage() {
  const parties = await db.select().from(schema.greyDspChart).orderBy(schema.greyDspChart.code);

  return (
    <Shell active="grey-dsp">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Grey Despatch Chart</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {parties.length} despatch parties
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{parties.length}</div>
            <div className="stat-label">Despatch Parties</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Party Name</th>
              <th>Short Name</th>
              <th>Cell No.</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {parties.map((p) => (
              <tr key={p.id}>
                <td className="mono text-[13px]">{p.code}</td>
                <td>{p.name}</td>
                <td>{p.nameShort || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                <td className="mono text-[13px]">{p.cell || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                <td className="mono text-[13px]">{p.phone || <span className="text-[var(--muted)]">&mdash;</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
