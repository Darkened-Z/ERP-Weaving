import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function CitiesPage() {
  const cities = await db.select().from(schema.cities);

  return (
    <Shell active="cities">
      <div className="animate-in">
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="page-title">
            Area-Cities{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({cities.length})
            </span>
          </h1>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>City Name</th>
            </tr>
          </thead>
          <tbody>
            {cities.map((c, i) => (
              <tr key={c.id}>
                <td className="mono text-[13px]">{i + 1}</td>
                <td>{c.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
