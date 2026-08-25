import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { ConfirmButton } from "@/components/confirm-button";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK");

const num = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
};

async function savePart(formData: FormData) {
  "use server";
  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  const isNew = !Number.isFinite(id);

  const description = ((formData.get("description") as string) ?? "").trim();
  const category = ((formData.get("category") as string) ?? "").trim() || null;
  const unit = ((formData.get("unit") as string) ?? "").trim() || "NOS";
  const minStock = num(formData.get("min_stock")) ?? 0;
  const location = ((formData.get("location") as string) ?? "").trim() || null;

  const back = isNew ? "?adding=1" : `?id=${id}`;
  if (!description) redirect(`/store/parts${back}`);

  const dup = await db
    .select({ id: schema.chartParts.id })
    .from(schema.chartParts)
    .where(
      isNew
        ? sql`lower(${schema.chartParts.description}) = ${description.toLowerCase()}`
        : and(
            sql`lower(${schema.chartParts.description}) = ${description.toLowerCase()}`,
            ne(schema.chartParts.id, id)
          )
    )
    .limit(1);
  if (dup.length > 0) redirect(`/store/parts${back}&error=dup_desc`);

  let savedId = isNew ? 0 : id;
  let codeExists = false;
  try {
    if (isNew) {
      savedId = await db.transaction(async (tx) => {
        const [{ maxC }] = await tx
          .select({
            maxC: sql<number>`coalesce(max(CAST(${schema.chartParts.code} AS INTEGER)), 0)`,
          })
          .from(schema.chartParts);
        const [inserted] = await tx
          .insert(schema.chartParts)
          .values({
            code: String((maxC ?? 0) + 1),
            description,
            category,
            unit,
            minStock,
            location,
            currentStock: 0,
            avgCost: 0,
          })
          .returning({ id: schema.chartParts.id });
        return inserted.id;
      });
    } else {
      await db
        .update(schema.chartParts)
        .set({ description, category, unit, minStock, location })
        .where(eq(schema.chartParts.id, id));
    }
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? "");
    if (/UNIQUE|constraint/i.test(msg)) codeExists = true;
    else throw e;
  }

  if (codeExists) redirect(`/store/parts${back}&error=code_exists`);

  revalidatePath("/store/parts");
  redirect(`/store/parts?id=${savedId}`);
}

async function deletePart(formData: FormData) {
  "use server";
  const s = await getSession();
  if (s?.roleName !== "ADMIN") redirect("/store/parts?error=admin_only");
  const id = parseInt(formData.get("id") as string, 10);
  if (!Number.isFinite(id)) return;

  const [part] = await db
    .select({ code: schema.chartParts.code })
    .from(schema.chartParts)
    .where(eq(schema.chartParts.id, id))
    .limit(1);
  if (!part) redirect("/store/parts");

  const [grnRef] = await db
    .select({ id: schema.storeGrnDetail.id })
    .from(schema.storeGrnDetail)
    .where(eq(schema.storeGrnDetail.partCode, part.code))
    .limit(1);
  const [demRef] = await db
    .select({ id: schema.storeDemandDetail.id })
    .from(schema.storeDemandDetail)
    .where(eq(schema.storeDemandDetail.partCode, part.code))
    .limit(1);
  const [retRef] = await db
    .select({ id: schema.storeReturnDetail.id })
    .from(schema.storeReturnDetail)
    .where(eq(schema.storeReturnDetail.partCode, part.code))
    .limit(1);

  if (grnRef || demRef || retRef) redirect(`/store/parts?id=${id}&error=in_use`);

  await db.delete(schema.chartParts).where(eq(schema.chartParts.id, id));
  revalidatePath("/store/parts");
  redirect("/store/parts");
}

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; adding?: string; error?: string }>;
}) {
  const params = await searchParams;
  const isAdding = params.adding === "1";

  const parts = await db
    .select()
    .from(schema.chartParts)
    .orderBy(schema.chartParts.category, schema.chartParts.code);

  const selectedId = params.id ? parseInt(params.id, 10) : NaN;
  const selected = Number.isFinite(selectedId)
    ? parts.find((p) => p.id === selectedId) ?? null
    : null;
  const formItem = isAdding ? null : selected;

  const nextCode =
    parts.reduce((max, p) => {
      const n = parseInt(p.code, 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1;

  const categoryOpts = [...new Set(parts.map((p) => p.category).filter(Boolean))]
    .sort()
    .map((c) => ({ value: c as string, label: c as string }));

  const total = parts.length;
  const categories = new Set(parts.map((p) => p.category)).size;
  const belowMin = parts.filter((p) => p.currentStock < p.minStock).length;

  const grouped = parts.reduce<Record<string, (typeof parts)[number][]>>(
    (acc, p) => {
      const cat = p.category ?? "UNCATEGORIZED";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    },
    {}
  );

  return (
    <Shell active="parts">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <h1 className="page-title">
            Parts Catalog{" "}
            <span className="text-[var(--muted)] text-lg font-normal">
              ({total})
            </span>
          </h1>
        </div>

        {params.error === "dup_desc" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            A part with this description already exists.
          </div>
        )}
        {params.error === "code_exists" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Part code already exists. Try saving again.
          </div>
        )}
        {params.error === "in_use" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            This part is referenced by GRN, demand or return vouchers and cannot be deleted.
          </div>
        )}
        {params.error === "admin_only" && (
          <div className="border border-red-600 bg-red-50 text-red-700 px-3 py-2 mb-4 text-[13px]">
            Only ADMIN users can delete parts.
          </div>
        )}

        <div className="border border-black p-4 mb-8">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-black">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
              {isAdding
                ? "New Part"
                : formItem
                ? `Edit Part — ${formItem.code}`
                : "New Part"}
            </div>
            <div className="flex gap-2">
              <a href="/store/parts?adding=1" className="btn btn-outline btn-sm">
                New
              </a>
              {formItem && (
                <form action={deletePart} className="inline">
                  <input type="hidden" name="id" value={formItem.id} />
                  <ConfirmButton message="Delete this part? This cannot be undone.">
                    Del
                  </ConfirmButton>
                </form>
              )}
            </div>
          </div>

          <form action={savePart}>
            {formItem && <input type="hidden" name="id" value={formItem.id} />}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="label block mb-1">Code</label>
                <input
                  className="input-box mono bg-gray-100"
                  defaultValue={formItem?.code ?? nextCode}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div className="col-span-2">
                <label className="label block mb-1">Description</label>
                <input
                  name="description"
                  className="input-box"
                  defaultValue={formItem?.description ?? ""}
                  required
                />
              </div>
              <div>
                <label className="label block mb-1">Category</label>
                <Combobox
                  name="category"
                  options={categoryOpts}
                  defaultValue={formItem?.category ?? ""}
                  placeholder="Category"
                  className="input-box"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <div>
                <label className="label block mb-1">Unit</label>
                <input
                  name="unit"
                  className="input-box mono"
                  defaultValue={formItem?.unit ?? "NOS"}
                />
              </div>
              <div>
                <label className="label block mb-1">Min Stock</label>
                <input
                  name="min_stock"
                  type="number"
                  step="any"
                  className="input-box mono"
                  defaultValue={formItem?.minStock ?? 0}
                />
              </div>
              <div>
                <label className="label block mb-1">Location</label>
                <input
                  name="location"
                  className="input-box"
                  defaultValue={formItem?.location ?? ""}
                />
              </div>
              <div>
                <label className="label block mb-1">Current Stock</label>
                <input
                  className="input-box mono bg-gray-100"
                  defaultValue={formItem?.currentStock ?? 0}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div>
                <label className="label block mb-1">Avg Cost</label>
                <input
                  className="input-box mono bg-gray-100"
                  defaultValue={formItem ? Math.round(formItem.avgCost * 100) / 100 : 0}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn btn-sm">
                Save
              </button>
              <a href="/store/parts" className="btn btn-outline btn-sm">
                Exit
              </a>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-4">
            <div className="stat-value">{total}</div>
            <div className="stat-label">Total Parts</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{categories}</div>
            <div className="stat-label">Categories</div>
          </div>
          <div className="bg-white p-4">
            <div className="stat-value">{belowMin}</div>
            <div className="stat-label">Below Minimum</div>
          </div>
        </div>

        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-8">
            <div className="section-title">{category}</div>
            <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th>Location</th>
                  <th className="text-right">Min Stock</th>
                  <th className="text-right">Current Stock</th>
                  <th className="text-right">Avg Cost</th>
                  <th>Last Purchase</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => {
                  const isSel = p.id === selected?.id;
                  const href = `/store/parts?id=${p.id}`;
                  const linkStyle = { color: isSel ? "white" : "inherit" };
                  return (
                    <tr
                      key={p.id}
                      className={isSel ? "bg-black text-white" : "cursor-pointer hover:bg-gray-50"}
                      style={
                        !isSel && p.currentStock < p.minStock
                          ? { borderLeft: "2px solid var(--danger)" }
                          : undefined
                      }
                    >
                      <td className="mono text-[13px]">
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {p.code}
                        </a>
                      </td>
                      <td>
                        <a href={href} className="no-underline block" style={linkStyle}>
                          {p.description}
                        </a>
                      </td>
                      <td className="mono text-[13px]">{p.unit}</td>
                      <td className="text-[13px]">{p.location ?? ""}</td>
                      <td className="mono text-[13px] text-right">
                        {fmt.format(p.minStock)}
                      </td>
                      <td className="mono text-[13px] text-right">
                        {fmt.format(p.currentStock)}
                      </td>
                      <td className="mono text-[13px] text-right">
                        {fmt.format(Math.round(p.avgCost))}
                      </td>
                      <td className="mono text-[13px]">
                        {p.lastPurchaseDate ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
