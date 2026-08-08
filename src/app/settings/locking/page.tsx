import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function LockingPage() {
  const locks = await db
    .select()
    .from(schema.systemLocking)
    .orderBy(schema.systemLocking.module);

  return (
    <Shell active="locking">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">System Locking</h1>
            <p className="text-[var(--muted)] text-sm mt-1">
              Per-module date locking prevents backdated entries
            </p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>Description</th>
              <th>Lock Date</th>
              <th>Locked By</th>
            </tr>
          </thead>
          <tbody>
            {locks.map((l) => (
              <tr key={l.id}>
                <td className="mono text-[13px]">
                  <span className="flex items-center gap-2">
                    {l.lockDate && (
                      <span
                        className="inline-block w-2 h-2"
                        style={{ background: "#000" }}
                      />
                    )}
                    {l.module}
                  </span>
                </td>
                <td>{l.description}</td>
                <td>
                  {l.lockDate ? (
                    <span className="mono text-[13px]">{l.lockDate}</span>
                  ) : (
                    <span className="text-[var(--muted)] text-[13px]">
                      NOT LOCKED
                    </span>
                  )}
                </td>
                <td>{l.lockedBy ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
