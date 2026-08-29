import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string; q?: string }>;
}) {
  const params = await searchParams;
  const allProducts = await db.select().from(schema.products).orderBy(schema.products.description);
  const q = (params.q ?? "").trim();
  const ql = q.toLowerCase();
  const products = !q
    ? allProducts
    : allProducts.filter(
        (p) =>
          p.description.toLowerCase().includes(ql) ||
          (p.mainDesc ?? "").toLowerCase().includes(ql) ||
          (p.subDesc ?? "").toLowerCase().includes(ql) ||
          String(p.code).includes(ql)
      );

  const selected = params.id ? allProducts.find((p) => p.id === parseInt(params.id!)) ?? null : null;
  const isAdding = params.adding === "1";
  const formItem = isAdding ? null : selected;

  const nextCode = allProducts.reduce((max, p) => (p.code > max ? p.code : max), 0) + 1;

  async function saveProduct(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const description = (formData.get("desc") as string)?.trim();
    if (!description) return;
    const mainDesc = (formData.get("main_desc") as string)?.trim() || null;
    const subDesc = (formData.get("sub_desc") as string)?.trim() || null;

    if (id) {
      // code is locked — never changed after creation
      await db.update(schema.products).set({ description, mainDesc, subDesc }).where(eq(schema.products.id, parseInt(id)));
      revalidatePath("/define/products");
      redirect(`/define/products?id=${id}`);
    } else {
      const existing = await db.select({ code: schema.products.code }).from(schema.products);
      const code = existing.reduce((m, r) => (r.code > m ? r.code : m), 0) + 1;
      const [inserted] = await db.insert(schema.products).values({ code, description, mainDesc, subDesc }).returning({ id: schema.products.id });
      revalidatePath("/define/products");
      redirect(`/define/products?id=${inserted.id}`);
    }
  }

  async function deleteProduct(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string);
    if (!id) return;

    const [prod] = await db
      .select({ description: schema.products.description, code: schema.products.code })
      .from(schema.products)
      .where(eq(schema.products.id, id))
      .limit(1);
    if (!prod) redirect("/define/products");

    const [extConvRef] = await db
      .select({ id: schema.extGreyConvContract.id })
      .from(schema.extGreyConvContract)
      .where(eq(schema.extGreyConvContract.productName, prod.description))
      .limit(1);
    const [intConvRef] = await db
      .select({ id: schema.intGreyConversionContract.id })
      .from(schema.intGreyConversionContract)
      .where(eq(schema.intGreyConversionContract.productName, prod.description))
      .limit(1);
    const [contractRef] = await db
      .select({ id: schema.contracts.id })
      .from(schema.contracts)
      .where(eq(schema.contracts.product, prod.description))
      .limit(1);
    // Daily production tables carry prod_code (product master code), not name.
    const [dpRef] = await db
      .select({ id: schema.dailyProduction.id })
      .from(schema.dailyProduction)
      .where(eq(schema.dailyProduction.prdCode, String(prod.code)))
      .limit(1);
    const [intDpRef] = await db
      .select({ id: schema.intDailyProduction.id })
      .from(schema.intDailyProduction)
      .where(
        or(
          eq(schema.intDailyProduction.prodCode, String(prod.code)),
          eq(schema.intDailyProduction.prodCode, prod.description),
        ),
      )
      .limit(1);

    if (extConvRef || intConvRef || contractRef || dpRef || intDpRef) {
      redirect(`/define/products?id=${id}&error=in_use`);
    }

    await db.delete(schema.products).where(eq(schema.products.id, id));
    revalidatePath("/define/products");
    redirect("/define/products");
  }

  return (
    <Shell active="products">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Products Coding (WVG){" "}
            <span className="text-[var(--muted)] text-lg font-normal">({products.length})</span>
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="border border-black p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding ? "New Product" : formItem ? "Edit Product" : "Product Details"}
                </div>
                <div className="flex gap-2">
                  <a href="/define/products?adding=1" className="btn btn-outline btn-sm">New</a>
                  {formItem ? (
                    <form action={deleteProduct} className="inline">
                      <input type="hidden" name="id" value={formItem.id} />
                      <ConfirmButton>Delete</ConfirmButton>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled
                      title="Save the record first to enable delete"
                      style={{ opacity: 0.5, cursor: "not-allowed" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {params.error === "in_use" && (
                <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
                  This product is referenced by contracts or daily production and cannot be deleted.
                </div>
              )}
              <form action={saveProduct}>
                {formItem && <input type="hidden" name="id" value={formItem.id} />}
                <div className="grid grid-cols-1 gap-y-3">
                  <div>
                    <label className="label block mb-1">Code</label>
                    <input className="input-box mono bg-gray-100" value={formItem ? String(formItem.code) : String(nextCode)} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="label block mb-1">Desc</label>
                    <input name="desc" className="input-box" defaultValue={formItem?.description ?? ""} required autoFocus placeholder="Product name (e.g. MARJAN)" />
                  </div>
                  <div>
                    <label className="label block mb-1">Main Desc</label>
                    <input name="main_desc" className="input-box mono" defaultValue={formItem?.mainDesc ?? ""} placeholder="e.g. MVS / PV / PA" />
                  </div>
                  <div>
                    <label className="label block mb-1">Sub Desc</label>
                    <input name="sub_desc" className="input-box mono" defaultValue={formItem?.subDesc ?? ""} placeholder="e.g. ABC" />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="submit" className="btn btn-sm">Save</button>
                  <a href="/define/products" className="btn btn-outline btn-sm">Exit</a>
                </div>
              </form>
            </div>
          </div>

          <div>
            <form method="GET" action="/define/products" className="flex items-center gap-2 mb-3">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">Find</div>
              <input name="q" defaultValue={q} className="input-box flex-1 text-[13px]" placeholder="Search by Desc or Code..." />
              <button type="submit" className="btn btn-outline btn-sm">Find</button>
              {q && <a href="/define/products" className="btn btn-outline btn-sm">Clear</a>}
            </form>
            <div className="overflow-x-auto" style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Desc</th>
                    <th>Main Desc</th>
                    <th>Sub Detail</th>
                    <th className="text-right">Code</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const isSel = p.id === selected?.id;
                    const href = `/define/products?id=${p.id}`;
                    const style = { color: isSel ? "white" : "inherit" };
                    return (
                      <tr key={p.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td className="p-0"><a href={href} className="no-underline block px-2 py-1" style={style}>{p.description}</a></td>
                        <td className="p-0 mono text-[13px]"><a href={href} className="no-underline block px-2 py-1" style={style}>{p.mainDesc ?? "-"}</a></td>
                        <td className="p-0 mono text-[13px]"><a href={href} className="no-underline block px-2 py-1" style={style}>{p.subDesc ?? "-"}</a></td>
                        <td className="p-0 mono text-[13px] text-right"><a href={href} className="no-underline block px-2 py-1" style={style}>{p.code}</a></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
