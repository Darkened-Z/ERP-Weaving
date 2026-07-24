import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const allLocations = await db.select().from(schema.locations).orderBy(schema.locations.code);

  const grey = allLocations.filter((l) => l.type === "GREY");
  const yarn = allLocations.filter((l) => l.type === "YARN");

  return (
    <Shell active="locations">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Parties Location</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {allLocations.length} locations
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{allLocations.length}</div>
            <div className="stat-label">Total Locations</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{grey.length} / {yarn.length}</div>
            <div className="stat-label">Grey / Yarn</div>
          </div>
        </div>

        {grey.length > 0 && (
          <div className="mb-8">
            <div className="section-title">Grey Despatch Locations</div>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {grey.map((l) => (
                  <tr key={l.id}>
                    <td className="mono text-[13px]">{l.code}</td>
                    <td>{l.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {yarn.length > 0 && (
          <div className="mb-8">
            <div className="section-title">Yarn Parties Locations</div>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {yarn.map((l) => (
                  <tr key={l.id}>
                    <td className="mono text-[13px]">{l.code}</td>
                    <td>{l.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
