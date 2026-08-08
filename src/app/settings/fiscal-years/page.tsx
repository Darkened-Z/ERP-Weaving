import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function FiscalYearsPage() {
  const years = await db
    .select()
    .from(schema.fiscalYears)
    .orderBy(schema.fiscalYears.code);

  const currentFY = years.find((y) => y.status === "A");

  return (
    <Shell active="fiscal-years">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">Fiscal Years</h1>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr
                key={y.code}
                style={
                  currentFY && y.code === currentFY.code
                    ? { borderLeft: "2px solid #000" }
                    : undefined
                }
              >
                <td className="mono text-[13px]">{y.code}</td>
                <td>{y.description}</td>
                <td className="mono text-[13px]">{y.startDate}</td>
                <td className="mono text-[13px]">{y.endDate}</td>
                <td>
                  <span
                    className="inline-block border px-2 py-0.5 text-[11px] font-bold uppercase"
                    style={{
                      background: y.status === "A" ? "#000" : "#999",
                      color: "#fff",
                      borderColor: y.status === "A" ? "#000" : "#999",
                    }}
                  >
                    {y.status === "A" ? "ACTIVE" : "CLOSED"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
