import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function YarnFibersPage() {
  const fibers = await db.select().from(schema.yarnFibers).orderBy(schema.yarnFibers.code);

  return (
    <Shell active="yarn-fibers">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Yarn Fiber</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {fibers.length} fiber types
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{fibers.length}</div>
            <div className="stat-label">Fiber Types</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Description</th>
              <th>Denier</th>
              <th>Length</th>
            </tr>
          </thead>
          <tbody>
            {fibers.map((f) => (
              <tr key={f.id}>
                <td className="mono font-bold">{f.code}</td>
                <td>{f.type ?? "-"}</td>
                <td>{f.description}</td>
                <td className="mono">{f.denier ?? "-"}</td>
                <td className="mono">{f.length ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
