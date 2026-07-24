import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function YarnBlendsPage() {
  const blends = await db.select().from(schema.yarnBlends).orderBy(schema.yarnBlends.id);

  return (
    <Shell active="yarn-blends">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Yarn Blends</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {blends.length} yarn blends
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{blends.length}</div>
            <div className="stat-label">Yarn Blends</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Blend Description</th>
            </tr>
          </thead>
          <tbody>
            {blends.map((b, i) => (
              <tr key={b.id}>
                <td className="mono text-[13px]">{i + 1}</td>
                <td>{b.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
