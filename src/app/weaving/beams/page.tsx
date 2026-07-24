import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function BeamsPage() {
  const rows = await db.select().from(schema.beams).orderBy(schema.beams.beamNo);

  const total = rows.length;
  const running = rows.filter((r) => r.status === "RUNNING").length;
  const empty = rows.filter((r) => r.status === "EMPTY").length;
  const other = total - running - empty;

  const formatNum = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

  return (
    <Shell active="beams">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Beam Tracking</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {total} beams
          </p>
        </div>

        <div className="grid grid-cols-4 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total Beams</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{running}</div>
            <div className="stat-label">Running</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{empty}</div>
            <div className="stat-label">Empty</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{other}</div>
            <div className="stat-label">Other</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Beam No</th>
              <th>Type</th>
              <th>Contract</th>
              <th>Product</th>
              <th>Yarn Count</th>
              <th className="text-right">Ends</th>
              <th className="text-right">Length (m)</th>
              <th className="text-right">Weight (kg)</th>
              <th>Status</th>
              <th className="text-right">Loom No</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono font-bold">{r.beamNo}</td>
                <td className="text-[13px]">{r.type}</td>
                <td className="mono text-[13px]">{r.contractNo ?? "-"}</td>
                <td className="mono text-[13px]">{r.product ?? "-"}</td>
                <td className="mono text-[13px]">{r.yarnCount ?? "-"}</td>
                <td className="text-right mono">{r.ends != null ? formatNum(r.ends) : "-"}</td>
                <td className="text-right mono">{r.length != null ? formatNum(r.length) : "-"}</td>
                <td className="text-right mono">{r.weight != null ? formatNum(r.weight) : "-"}</td>
                <td>
                  {r.status === "RUNNING" && (
                    <span className="inline-block bg-black text-white px-2 py-0.5 text-[11px] font-bold uppercase">
                      Running
                    </span>
                  )}
                  {r.status === "EMPTY" && (
                    <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                      Empty
                    </span>
                  )}
                  {!["RUNNING", "EMPTY"].includes(r.status) && (
                    <span className="inline-block bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold uppercase text-[var(--muted)]">
                      {r.status}
                    </span>
                  )}
                </td>
                <td className="text-right mono">{r.loomNo ?? "-"}</td>
                <td className="mono text-[13px]">{r.receivedDate ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
