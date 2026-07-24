import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function WeaversPage() {
  const weavers = await db.select().from(schema.weavers).orderBy(schema.weavers.code);

  return (
    <Shell active="weavers">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Weavers</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {weavers.length} weavers
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{weavers.length}</div>
            <div className="stat-label">Total Weavers</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Short Name</th>
              <th>Cell No.</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {weavers.map((w) => (
              <tr key={w.id}>
                <td className="mono text-[13px]">{w.code}</td>
                <td>{w.name}</td>
                <td>{w.nameShort || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                <td className="mono text-[13px]">{w.cell || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                <td>{w.address || <span className="text-[var(--muted)]">&mdash;</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
