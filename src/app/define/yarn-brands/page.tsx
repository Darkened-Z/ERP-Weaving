import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function YarnBrandsPage() {
  const brands = await db.select().from(schema.yarnBrands).orderBy(schema.yarnBrands.name);

  return (
    <Shell active="yarn-brands">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Yarn Brands</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {brands.length} yarn brands
          </p>
        </div>

        <div className="grid grid-cols-1 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{brands.length}</div>
            <div className="stat-label">Yarn Brands</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {brands.map((b) => (
            <div key={b.id} className="card">
              {b.name}
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
