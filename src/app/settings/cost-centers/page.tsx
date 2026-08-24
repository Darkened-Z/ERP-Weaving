import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type CostCenter = typeof schema.costCenters.$inferSelect;

const MAX_LEVEL = 5;
const LEVEL_LABELS = ["Unit", "Department", "Section", "Machine Group", "Cost Item"];

// Shape the cost-center table into indented Combobox options. Consumers:
//   import { buildCostCenterOptions } from "@/app/settings/cost-centers/page";
//   <Combobox name="cc_code" options={buildCostCenterOptions(centers)} />
export function buildCostCenterOptions(centers: CostCenter[]) {
  const byCode = new Map<number, CostCenter>();
  for (const c of centers) byCode.set(c.code, c);
  const chain = (c: CostCenter): string => {
    const parts: string[] = [c.description];
    let cur = c.parentCode != null ? byCode.get(c.parentCode) : undefined;
    while (cur) {
      parts.unshift(cur.description);
      cur = cur.parentCode != null ? byCode.get(cur.parentCode) : undefined;
    }
    return parts.join(" > ");
  };
  return [...centers]
    .sort((a, b) => a.code - b.code)
    .map((c) => {
      const level = c.level ?? 1;
      const indent = "    ".repeat(Math.max(0, level - 1));
      return {
        value: String(c.code),
        label: `${indent}${c.code} — ${c.description}`,
        desc: chain(c),
      };
    });
}

export default async function CostCentersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const centers = await db
    .select()
    .from(schema.costCenters)
    .orderBy(schema.costCenters.code);

  const byParent = new Map<number | null, CostCenter[]>();
  for (const c of centers) {
    const key = c.parentCode ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(c);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.code - b.code);

  async function addRoot(formData: FormData) {
    "use server";
    const description = (formData.get("description") as string)?.trim();
    if (!description) return;
    const rows = await db.select({ code: schema.costCenters.code }).from(schema.costCenters);
    const used = new Set(rows.map((r) => r.code));
    let n = 1;
    while (used.has(n)) n++;
    await db.insert(schema.costCenters).values({
      code: n,
      description,
      level: 1,
      parentCode: null,
    });
    revalidatePath("/settings/cost-centers");
  }

  async function addChild(formData: FormData) {
    "use server";
    const parent = parseInt((formData.get("parent") as string) ?? "", 10);
    const description = (formData.get("description") as string)?.trim();
    if (!Number.isFinite(parent) || !description) return;
    const parentRows = await db
      .select()
      .from(schema.costCenters)
      .where(eq(schema.costCenters.code, parent))
      .limit(1);
    if (!parentRows.length) return;
    const parentRow = parentRows[0];
    const parentLevel = parentRow.level ?? 1;
    if (parentLevel >= MAX_LEVEL) return;
    const all = await db.select({ code: schema.costCenters.code }).from(schema.costCenters);
    const used = new Set(all.map((r) => r.code));
    // codes are INTEGER (not dotted) — child = parent*100 + next free slot in 1..99
    let n = 1;
    while (used.has(parent * 100 + n) && n < 100) n++;
    if (n >= 100) return;
    const newCode = parent * 100 + n;
    await db.insert(schema.costCenters).values({
      code: newCode,
      description,
      level: parentLevel + 1,
      parentCode: parent,
    });
    revalidatePath("/settings/cost-centers");
  }

  async function deleteCenter(formData: FormData) {
    "use server";
    const code = parseInt((formData.get("code") as string) ?? "", 10);
    if (!Number.isFinite(code)) return;
    const kids = await db
      .select({ code: schema.costCenters.code })
      .from(schema.costCenters)
      .where(eq(schema.costCenters.parentCode, code))
      .limit(1);
    if (kids.length > 0) {
      redirect(`/settings/cost-centers?error=has_children`);
    }
    const usedInTrans = await db
      .select({ id: schema.transDetail.id })
      .from(schema.transDetail)
      .where(eq(schema.transDetail.ccCode, code))
      .limit(1);
    if (usedInTrans.length > 0) {
      redirect(`/settings/cost-centers?error=in_use`);
    }
    const usedInDemand = await db
      .select({ id: schema.storeDemandDetail.id })
      .from(schema.storeDemandDetail)
      .where(eq(schema.storeDemandDetail.ccCode, String(code)))
      .limit(1);
    if (usedInDemand.length > 0) {
      redirect(`/settings/cost-centers?error=in_use`);
    }
    await db.delete(schema.costCenters).where(eq(schema.costCenters.code, code));
    revalidatePath("/settings/cost-centers");
    redirect("/settings/cost-centers");
  }

  function renderNode(c: CostCenter) {
    const kids = byParent.get(c.code) ?? [];
    const level = c.level ?? 1;
    const canAddChild = level < MAX_LEVEL;
    const nextLabel = LEVEL_LABELS[level] ?? "child";
    return (
      <li key={c.code} className="border-b border-[var(--border)] last:border-b-0">
        <div
          className="flex flex-wrap items-center gap-2 py-2 pr-3"
          style={{ paddingLeft: `${12 + (level - 1) * 24}px` }}
        >
          <span className="mono text-[12px] font-semibold w-20">{c.code}</span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] w-32">
            L{level} · {LEVEL_LABELS[level - 1] ?? ""}
          </span>
          <span className="text-[13px] flex-1 min-w-[10rem]">{c.description}</span>
          {canAddChild && (
            <form action={addChild} className="flex items-center gap-1">
              <input type="hidden" name="parent" value={c.code} />
              <input
                name="description"
                className="input-box text-[12px] w-44"
                placeholder={`+ ${nextLabel}...`}
                required
              />
              <button type="submit" className="btn btn-outline btn-sm">Add</button>
            </form>
          )}
          <form action={deleteCenter} className="inline">
            <input type="hidden" name="code" value={c.code} />
            <ConfirmButton message={`Delete cost center ${c.code} — ${c.description}?`}>
              Del
            </ConfirmButton>
          </form>
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => renderNode(k))}</ul>}
      </li>
    );
  }

  const roots = byParent.get(null) ?? [];
  const pickerOptions = buildCostCenterOptions(centers);

  return (
    <Shell active="cost-centers">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">
              Cost Centers{" "}
              <span className="text-[var(--muted)] text-lg font-normal">
                ({centers.length})
              </span>
            </h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Unit → Department → Section → Machine Group → Cost Item
            </p>
          </div>
        </div>

        {params.error === "has_children" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Cannot delete: this cost center has child nodes. Delete children first.
          </div>
        )}
        {params.error === "in_use" && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Cannot delete: this cost center is referenced by vouchers or store demands.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 border border-black">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black px-4 py-2 bg-gray-50">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
                Hierarchy
              </div>
              <form action={addRoot} className="flex items-center gap-1">
                <input
                  name="description"
                  className="input-box text-[12px] w-56"
                  placeholder="New Unit description..."
                  required
                />
                <button type="submit" className="btn btn-sm">Add Unit</button>
              </form>
            </div>
            {roots.length === 0 ? (
              <div className="p-6 text-center text-[13px] text-[var(--muted)]">
                No cost centers yet. Add a root Unit to begin.
              </div>
            ) : (
              <ul>{roots.map(renderNode)}</ul>
            )}
          </div>

          <div className="border border-black p-4 h-fit">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3">
              Picker Preview
            </div>
            <p className="text-[12px] text-[var(--muted)] mb-3">
              Reusable pattern for any page that needs to pick a cost center.
              5-level indented labels; hidden field submits the numeric code.
            </p>
            <form>
              <Combobox
                name="cc_preview"
                options={pickerOptions}
                placeholder="Select cost center..."
              />
            </form>
            <pre className="mt-4 text-[10px] mono text-[var(--muted)] leading-relaxed whitespace-pre-wrap break-words">
{`import { Combobox } from "@/components/combobox";
import { buildCostCenterOptions }
  from "@/app/settings/cost-centers/page";

const opts = buildCostCenterOptions(centers);
<Combobox name="cc_code" options={opts} />`}
            </pre>
          </div>
        </div>
      </div>
    </Shell>
  );
}
