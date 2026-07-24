import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function CompanyUnitsPage() {
  const units = await db.select().from(schema.companyUnits);

  return (
    <Shell active="company-units">
      <div className="animate-in">
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="page-title">
            Company Units{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({units.length})
            </span>
          </h1>
        </div>

        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Sr No.</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.code}>
                <td className="mono text-[13px]">{u.code}</td>
                <td className="mono text-[13px]">{u.srno}</td>
                <td>{u.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
