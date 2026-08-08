import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function CostCentersPage() {
  const centers = await db
    .select()
    .from(schema.costCenters)
    .orderBy(schema.costCenters.code);

  return (
    <Shell active="cost-centers">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Cost Centers{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({centers.length})
            </span>
          </h1>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Level</th>
              <th>Parent</th>
            </tr>
          </thead>
          <tbody>
            {centers.map((c) => (
              <tr key={c.code}>
                <td className="mono text-[13px]">{c.code}</td>
                <td>{c.description}</td>
                <td className="mono text-[13px]">{c.level}</td>
                <td>
                  {c.parentCode !== null ? (
                    <span className="mono text-[13px]">{c.parentCode}</span>
                  ) : (
                    <span className="text-[var(--muted)]">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
