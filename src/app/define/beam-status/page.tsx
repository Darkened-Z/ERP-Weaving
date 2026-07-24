import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function BeamStatusPage() {
  const statuses = await db.select().from(schema.beamStatuses);

  return (
    <Shell active="beam-status">
      <div className="animate-in">
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="page-title">
            Beam Status{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({statuses.length})
            </span>
          </h1>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((s, i) => (
              <tr key={s.id}>
                <td className="mono text-[13px]">{i + 1}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
