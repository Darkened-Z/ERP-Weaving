import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK");

export default async function DemandPage() {
  const rows = await db
    .select()
    .from(schema.storeDemands)
    .orderBy(sql`demand_date DESC`);

  const total = rows.length;
  const pending = rows.filter((r) => r.status === "P").length;
  const approved = rows.filter((r) => r.status === "A").length;
  const totalAmount = rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0);

  return (
    <Shell active="demand">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Demand Notes{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total Demands</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{pending}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{approved}</div>
            <div className="stat-label">Approved</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{fmt.format(Math.round(totalAmount))}</div>
            <div className="stat-label">Total Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Demand No.</th>
              <th>Department</th>
              <th>Requested By</th>
              <th className="text-right">Items</th>
              <th className="text-right">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-[var(--muted)]">
                  No demand notes found
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[13px]">{r.demandDate}</td>
                  <td className="mono text-[13px]">{r.demandNo}</td>
                  <td>{r.department}</td>
                  <td>{r.requestedBy ?? ""}</td>
                  <td className="mono text-[13px] text-right">
                    {r.itemCount ?? 0}
                  </td>
                  <td className="mono text-[13px] text-right">
                    {fmt.format(Math.round(r.totalAmount ?? 0))}
                  </td>
                  <td>
                    <span
                      className="inline-block border px-2 py-0.5 text-[11px] font-bold uppercase"
                      style={{
                        background: r.status === "P" ? "#000" : "transparent",
                        color: r.status === "P" ? "#fff" : "#000",
                        borderColor: "#000",
                      }}
                    >
                      {r.status === "P" ? "PENDING" : "APPROVED"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </Shell>
  );
}
