import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function GatepassPage() {
  const rows = await db
    .select()
    .from(schema.storeGatepass)
    .orderBy(sql`gatepass_date DESC`);

  const total = rows.length;
  const inCount = rows.filter((r) => r.gatepassType === "IN").length;
  const outCount = rows.filter((r) => r.gatepassType === "OUT").length;

  return (
    <Shell active="gatepass">
      <div className="animate-in">
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="page-title">
            Gate Pass{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
        </div>

        <div className="grid grid-cols-3 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total Gate Passes</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{inCount}</div>
            <div className="stat-label">IN</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{outCount}</div>
            <div className="stat-label">OUT</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>GP No.</th>
              <th>Type</th>
              <th>Party</th>
              <th>Vehicle No.</th>
              <th>Purpose</th>
              <th className="text-right">Items</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-[var(--muted)]">
                  No gate passes found
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[13px]">{r.gatepassDate}</td>
                  <td className="mono text-[13px]">{r.gatepassNo}</td>
                  <td>
                    <span
                      className="inline-block border px-2 py-0.5 text-[11px] font-bold uppercase"
                      style={{
                        background:
                          r.gatepassType === "IN" ? "#000" : "transparent",
                        color: r.gatepassType === "IN" ? "#fff" : "#000",
                        borderColor: "#000",
                      }}
                    >
                      {r.gatepassType}
                    </span>
                  </td>
                  <td>{r.party}</td>
                  <td className="mono text-[13px]">{r.vehicleNo ?? ""}</td>
                  <td>{r.purpose ?? ""}</td>
                  <td className="mono text-[13px] text-right">
                    {r.itemCount ?? 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
