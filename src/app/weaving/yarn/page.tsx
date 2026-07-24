import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function YarnPage() {
  const rows = await db
    .select()
    .from(schema.yarnCounts)
    .orderBy(schema.yarnCounts.type, schema.yarnCounts.countCode);

  const grouped = rows.reduce<Record<string, typeof rows>>((acc, r) => {
    const key = r.type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const typeOrder = ["COTTON", "PC BLEND", "CVC BLEND", "POLYESTER"];
  const sortedTypes = Object.keys(grouped).sort(
    (a, b) => (typeOrder.indexOf(a) === -1 ? 99 : typeOrder.indexOf(a)) - (typeOrder.indexOf(b) === -1 ? 99 : typeOrder.indexOf(b))
  );

  return (
    <Shell active="yarn">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Yarn Counts</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} yarn counts
          </p>
        </div>

        {sortedTypes.map((type) => (
          <div key={type} className="mb-10">
            <div className="section-title">{type}</div>
            <table>
              <thead>
                <tr>
                  <th>Count Code</th>
                  <th>Description</th>
                  <th className="text-right">Ply</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {grouped[type].map((r) => (
                  <tr key={r.id}>
                    <td className="mono font-bold">{r.countCode}</td>
                    <td>{r.description}</td>
                    <td className="text-right mono">{r.ply}</td>
                    <td>
                      {r.status === "A" ? (
                        <span className="inline-block bg-black text-white px-2 py-0.5 text-[11px] font-bold uppercase">
                          Active
                        </span>
                      ) : (
                        <span className="inline-block bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold uppercase text-[var(--muted)]">
                          Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Shell>
  );
}
