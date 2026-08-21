import { Shell } from "@/components/shell";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; id?: string; adding?: string }>;
}) {
  const params = await searchParams;
  const mainCats = await db.select().from(schema.productsMain).orderBy(schema.productsMain.code);
  const subCats = await db.select().from(schema.productsSub).orderBy(schema.productsSub.code);
  const productsList = await db.select().from(schema.products).orderBy(schema.products.code);

  const section = params.section || "main";
  const isAdding = params.adding === "1";

  async function saveMainProduct(formData: FormData) {
    "use server";
    const code = parseInt(formData.get("code") as string, 10);
    const description = (formData.get("desc") as string)?.trim();
    if (!Number.isFinite(code) || !description) return;
    const editId = formData.get("edit_code") as string;

    if (editId) {
      const editCode = parseInt(editId, 10);
      if (!Number.isFinite(editCode)) return;
      await db.update(schema.productsMain).set({ description }).where(eq(schema.productsMain.code, editCode));
      revalidatePath("/define/products");
      redirect(`/define/products?section=main&id=${editCode}`);
    } else {
      const inserted = await db.insert(schema.productsMain).values({ code, description }).returning({ code: schema.productsMain.code });
      const newCode = inserted[0]?.code ?? code;
      revalidatePath("/define/products");
      redirect(`/define/products?section=main&id=${newCode}`);
    }
  }

  async function deleteMainProduct(formData: FormData) {
    "use server";
    const code = parseInt(formData.get("code") as string, 10);
    if (!Number.isFinite(code)) return;
    await db.delete(schema.productsMain).where(eq(schema.productsMain.code, code));
    revalidatePath("/define/products");
    redirect("/define/products?section=main");
  }

  async function saveSubProduct(formData: FormData) {
    "use server";
    const code = parseInt(formData.get("code") as string, 10);
    const description = (formData.get("desc") as string)?.trim();
    if (!Number.isFinite(code) || !description) return;
    const editId = formData.get("edit_code") as string;

    if (editId) {
      const editCode = parseInt(editId, 10);
      if (!Number.isFinite(editCode)) return;
      await db.update(schema.productsSub).set({ description }).where(eq(schema.productsSub.code, editCode));
      revalidatePath("/define/products");
      redirect(`/define/products?section=sub&id=${editCode}`);
    } else {
      const inserted = await db.insert(schema.productsSub).values({ code, description }).returning({ code: schema.productsSub.code });
      const newCode = inserted[0]?.code ?? code;
      revalidatePath("/define/products");
      redirect(`/define/products?section=sub&id=${newCode}`);
    }
  }

  async function deleteSubProduct(formData: FormData) {
    "use server";
    const code = parseInt(formData.get("code") as string, 10);
    if (!Number.isFinite(code)) return;
    await db.delete(schema.productsSub).where(eq(schema.productsSub.code, code));
    revalidatePath("/define/products");
    redirect("/define/products?section=sub");
  }

  async function saveProduct(formData: FormData) {
    "use server";
    const idRaw = formData.get("id") as string;
    const code = parseInt(formData.get("code") as string, 10);
    const description = (formData.get("desc") as string)?.trim();
    if (!Number.isFinite(code) || !description) return;

    const mainCodeParsed = parseInt(formData.get("main_code") as string, 10);
    const subCodeParsed = parseInt(formData.get("sub_code") as string, 10);
    const mainCode = Number.isFinite(mainCodeParsed) ? mainCodeParsed : null;
    const subCode = Number.isFinite(subCodeParsed) ? subCodeParsed : null;

    const mainRow = mainCode ? await db.select().from(schema.productsMain).where(eq(schema.productsMain.code, mainCode)).limit(1) : [];
    const subRow = subCode ? await db.select().from(schema.productsSub).where(eq(schema.productsSub.code, subCode)).limit(1) : [];
    const mainDesc = mainRow[0]?.description ?? null;
    const subDesc = subRow[0]?.description ?? null;

    if (idRaw) {
      const id = parseInt(idRaw, 10);
      if (!Number.isFinite(id)) return;
      await db.update(schema.products).set({ code, description, mainCode, subCode, mainDesc, subDesc }).where(eq(schema.products.id, id));
      revalidatePath("/define/products");
      redirect(`/define/products?section=products&id=${id}`);
    } else {
      const inserted = await db.insert(schema.products).values({ code, description, mainCode, subCode, mainDesc, subDesc }).returning({ id: schema.products.id });
      const newId = inserted[0]?.id;
      revalidatePath("/define/products");
      redirect(`/define/products?section=products&id=${newId}`);
    }
  }

  async function deleteProduct(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    if (!Number.isFinite(id)) return;
    await db.delete(schema.products).where(eq(schema.products.id, id));
    revalidatePath("/define/products");
    redirect("/define/products?section=products");
  }

  const selMain = params.id && section === "main" ? mainCats.find((m) => m.code === parseInt(params.id!, 10)) : null;
  const selSub = params.id && section === "sub" ? subCats.find((s) => s.code === parseInt(params.id!, 10)) : null;
  const selProd = params.id && section === "products" ? productsList.find((p) => p.id === parseInt(params.id!, 10)) : null;

  return (
    <Shell active="products">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">Products Coding</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{mainCats.length}</div>
            <div className="stat-label">Main Products</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{subCats.length}</div>
            <div className="stat-label">Sub Products</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{productsList.length}</div>
            <div className="stat-label">Products</div>
          </div>
        </div>

        {/* Main Products Coding (WVG) */}
        <div className="mb-10">
          <div className="section-title">Main Products Coding (WVG)</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-black p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding && section === "main" ? "New" : selMain ? "Edit" : "Details"}
                </div>
                <div className="flex gap-2">
                  <a href="/define/products?section=main&adding=1" className="btn btn-outline btn-sm">New</a>
                  {selMain && (
                    <form action={deleteMainProduct} className="inline">
                      <input type="hidden" name="code" value={selMain.code} />
                      <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                    </form>
                  )}
                </div>
              </div>
              <form action={saveMainProduct}>
                {selMain && !isAdding && <input type="hidden" name="edit_code" value={selMain.code} />}
                <div className="grid grid-cols-1 gap-y-3">
                  <div>
                    <label className="label block mb-1">Desc</label>
                    <input name="desc" className="input-box" defaultValue={!isAdding ? selMain?.description ?? "" : ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Code</label>
                    <input
                      name="code"
                      type="number"
                      className="input-box mono"
                      defaultValue={!isAdding ? selMain?.code ?? "" : ""}
                      readOnly={!!(selMain && !isAdding)}
                      tabIndex={selMain && !isAdding ? -1 : undefined}
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3 items-center">
                  <div className="flex items-center gap-1 mr-2">
                    <label className="label">Pasward</label>
                    <input type="password" name="pswd" className="input-box mono w-28" tabIndex={-1} />
                  </div>
                  <button type="submit" className="btn btn-sm">Save</button>
                </div>
              </form>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: "40vh", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Desc</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {mainCats.map((m) => {
                    const isSel = m.code === selMain?.code;
                    return (
                      <tr key={m.code} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td>
                          <a href={`/define/products?section=main&id=${m.code}`} className="no-underline" style={{ color: isSel ? "white" : "inherit" }}>{m.description}</a>
                        </td>
                        <td className="mono text-[13px]">{m.code}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sub Products Coding (WVG) */}
        <div className="mb-10">
          <div className="section-title">Sub Products Coding (WVG)</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-black p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding && section === "sub" ? "New" : selSub ? "Edit" : "Details"}
                </div>
                <div className="flex gap-2">
                  <a href="/define/products?section=sub&adding=1" className="btn btn-outline btn-sm">New</a>
                  {selSub && (
                    <form action={deleteSubProduct} className="inline">
                      <input type="hidden" name="code" value={selSub.code} />
                      <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                    </form>
                  )}
                </div>
              </div>
              <form action={saveSubProduct}>
                {selSub && !isAdding && <input type="hidden" name="edit_code" value={selSub.code} />}
                <div className="grid grid-cols-1 gap-y-3">
                  <div>
                    <label className="label block mb-1">Desc</label>
                    <input name="desc" className="input-box" defaultValue={!isAdding ? selSub?.description ?? "" : ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Code</label>
                    <input
                      name="code"
                      type="number"
                      className="input-box mono"
                      defaultValue={!isAdding ? selSub?.code ?? "" : ""}
                      readOnly={!!(selSub && !isAdding)}
                      tabIndex={selSub && !isAdding ? -1 : undefined}
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button type="submit" className="btn btn-sm">Save</button>
                </div>
              </form>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: "40vh", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Desc</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {subCats.map((s) => {
                    const isSel = s.code === selSub?.code;
                    return (
                      <tr key={s.code} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td>
                          <a href={`/define/products?section=sub&id=${s.code}`} className="no-underline" style={{ color: isSel ? "white" : "inherit" }}>{s.description}</a>
                        </td>
                        <td className="mono text-[13px]">{s.code}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Products Coding (WVG) */}
        <div className="mb-10">
          <div className="flex items-baseline justify-between mb-2 gap-4">
            <div className="section-title mb-0">Products Coding (WVG)</div>
            <ExcelExportButton
              rows={productsList}
              columns={[
                { key: "code", label: "Code" },
                { key: "description", label: "Description" },
                { key: "mainDesc", label: "Main Description" },
                { key: "subDesc", label: "Sub Description" },
              ]}
              filename="products"
              sheetName="Products"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-black p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                  {isAdding && section === "products" ? "New" : selProd ? "Edit" : "Details"}
                </div>
                <div className="flex gap-2">
                  <a href="/define/products?section=products&adding=1" className="btn btn-outline btn-sm">New</a>
                  {selProd && (
                    <form action={deleteProduct} className="inline">
                      <input type="hidden" name="id" value={selProd.id} />
                      <button type="submit" className="btn btn-outline btn-sm">Delete</button>
                    </form>
                  )}
                </div>
              </div>
              <form action={saveProduct}>
                {selProd && !isAdding && <input type="hidden" name="id" value={selProd.id} />}
                <div className="grid grid-cols-1 gap-y-3">
                  <div>
                    <label className="label block mb-1">Desc</label>
                    <input name="desc" className="input-box" defaultValue={!isAdding ? selProd?.description ?? "" : ""} required />
                  </div>
                  <div>
                    <label className="label block mb-1">Main Desc</label>
                    <select name="main_code" className="input-box" defaultValue={!isAdding ? selProd?.mainCode ?? "" : ""}>
                      <option value="">--</option>
                      {mainCats.map((m) => (
                        <option key={m.code} value={m.code}>{m.description}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">SUB Desc</label>
                    <select name="sub_code" className="input-box" defaultValue={!isAdding ? selProd?.subCode ?? "" : ""}>
                      <option value="">--</option>
                      {subCats.map((s) => (
                        <option key={s.code} value={s.code}>{s.description}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label block mb-1">Code</label>
                    <input name="code" type="number" className="input-box mono" defaultValue={!isAdding ? selProd?.code ?? "" : ""} required />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button type="submit" className="btn btn-sm">Save</button>
                </div>
              </form>
            </div>
            <div className="overflow-x-auto" style={{ maxHeight: "40vh", overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Desc</th>
                    <th>Main Desc</th>
                    <th>Sub Detail</th>
                    <th>Code</th>
                  </tr>
                </thead>
                <tbody>
                  {productsList.map((p) => {
                    const isSel = p.id === selProd?.id;
                    return (
                      <tr key={p.id} className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}>
                        <td>
                          <a href={`/define/products?section=products&id=${p.id}`} className="no-underline" style={{ color: isSel ? "white" : "inherit" }}>{p.description}</a>
                        </td>
                        <td className="text-[13px]">{p.mainDesc ?? "-"}</td>
                        <td className="text-[13px]">{p.subDesc ?? "-"}</td>
                        <td className="mono text-[13px]">{p.code}</td>
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
