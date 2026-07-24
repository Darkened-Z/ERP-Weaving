import { Shell } from "@/components/shell";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const mainCats = await db.select().from(schema.productsMain).orderBy(schema.productsMain.code);
  const subCats = await db.select().from(schema.productsSub).orderBy(schema.productsSub.code);
  const productsList = await db.select().from(schema.products).orderBy(schema.products.code);

  return (
    <Shell active="products">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Products Coding</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {productsList.length} products
          </p>
        </div>

        <div className="grid grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{productsList.length}</div>
            <div className="stat-label">Total Products</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{mainCats.length}</div>
            <div className="stat-label">Main Categories</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{subCats.length}</div>
            <div className="stat-label">Sub Categories</div>
          </div>
        </div>

        <div className="mb-8">
          <div className="section-title">Main Categories</div>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {mainCats.map((m) => (
                <tr key={m.code}>
                  <td className="mono text-[13px]">{m.code}</td>
                  <td>{m.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-8">
          <div className="section-title">Sub Categories</div>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {subCats.map((s) => (
                <tr key={s.code}>
                  <td className="mono text-[13px]">{s.code}</td>
                  <td>{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-8">
          <div className="section-title">Product Codes</div>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Description</th>
                <th>Main Category</th>
                <th>Sub Category</th>
              </tr>
            </thead>
            <tbody>
              {productsList.map((p) => (
                <tr key={p.id}>
                  <td className="mono text-[13px]">{p.code}</td>
                  <td>{p.description}</td>
                  <td>{p.mainDesc || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                  <td>{p.subDesc || <span className="text-[var(--muted)]">&mdash;</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
