import { Shell } from "@/components/shell";
import { ImageAttach } from "@/components/image-attach";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { requireSession, getSession } from "@/lib/auth";
import { and, desc, eq, gte, lte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const BASE = "/finance/eod-images";
const CATEGORIES = ["CASH_CLOSE", "SALES", "DEPOSIT", "EXPENSE", "OTHER"] as const;

const trim = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};
const today = () => new Date().toISOString().slice(0, 10);

async function saveImage(formData: FormData) {
  "use server";
  const session = await getSession();
  const img = trim(formData.get("img"));
  if (!img) redirect(`${BASE}?error=no_image`);
  const imgDate = trim(formData.get("img_date")) ?? today();
  const category = trim(formData.get("category"));
  const remarks = trim(formData.get("remarks"));
  await db.insert(schema.endOfDayImages).values({
    imgDate,
    category,
    img: img!,
    remarks,
    uploadedBy: session?.userId ?? null,
    createdAt: new Date().toISOString(),
  });
  revalidatePath(BASE);
  redirect(BASE);
}

async function deleteImage(formData: FormData) {
  "use server";
  await requireSession();
  const idRaw = formData.get("id");
  const id = idRaw ? parseInt(String(idRaw), 10) : NaN;
  if (!Number.isFinite(id)) return;
  await db.delete(schema.endOfDayImages).where(eq(schema.endOfDayImages.id, id));
  revalidatePath(BASE);
  redirect(BASE);
}

const ERR_MSG: Record<string, string> = {
  no_image: "Attach a photo before saving.",
};

export default async function EodImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string; error?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = (p.from ?? "").trim();
  const to = (p.to ?? "").trim();
  const category = (p.category ?? "").trim().toUpperCase();

  const rows = await db
    .select()
    .from(schema.endOfDayImages)
    .where(
      and(
        from ? gte(schema.endOfDayImages.imgDate, from) : undefined,
        to ? lte(schema.endOfDayImages.imgDate, to) : undefined,
        category ? eq(schema.endOfDayImages.category, category) : undefined
      )
    )
    .orderBy(desc(schema.endOfDayImages.imgDate), desc(schema.endOfDayImages.id))
    .limit(400);

  const uploaderIds = Array.from(new Set(rows.map((r) => r.uploadedBy).filter((v): v is number => v != null)));
  const users =
    uploaderIds.length > 0
      ? await db
          .select({ id: schema.users.id, fullName: schema.users.fullName })
          .from(schema.users)
          .where(inArray(schema.users.id, uploaderIds))
      : [];
  const userMap = new Map(users.map((u) => [u.id, u.fullName]));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!groups.has(r.imgDate)) groups.set(r.imgDate, []);
    groups.get(r.imgDate)!.push(r);
  }

  return (
    <Shell active="eod-images">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">END&nbsp;OF&nbsp;DAY&nbsp;&nbsp;IMAGES</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} image{rows.length === 1 ? "" : "s"}
              {from || to ? ` between ${from || "…"} and ${to || "…"}` : ""}
              {category ? ` · ${category}` : ""}
            </p>
          </div>
        </div>

        {p.error && ERR_MSG[p.error] && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {ERR_MSG[p.error]}
          </div>
        )}

        <div className="border border-black p-6 mb-6">
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">Upload image</div>
          <form action={saveImage}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
              <div className="lg:col-span-2">
                <label className="label block mb-1">Date</label>
                <input name="img_date" type="date" className="input-box mono" defaultValue={today()} required />
              </div>
              <div className="lg:col-span-2">
                <label className="label block mb-1">Category</label>
                <select name="category" className="input-box mono" defaultValue="CASH_CLOSE">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Photo</label>
                <ImageAttach name="img" />
              </div>
              <div className="lg:col-span-4">
                <label className="label block mb-1">Remarks</label>
                <input name="remarks" className="input-box mono" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="submit" className="btn btn-sm">Save</button>
            </div>
          </form>
        </div>

        <form method="GET" action={BASE} className="border border-black p-6 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
            <div className="lg:col-span-3">
              <label className="label block mb-1">From</label>
              <input name="from" type="date" className="input-box mono" defaultValue={from} />
            </div>
            <div className="lg:col-span-3">
              <label className="label block mb-1">To</label>
              <input name="to" type="date" className="input-box mono" defaultValue={to} />
            </div>
            <div className="lg:col-span-3">
              <label className="label block mb-1">Category</label>
              <select name="category" className="input-box mono" defaultValue={category}>
                <option value="">ALL</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-3 flex items-end gap-2">
              <button type="submit" className="btn btn-sm">Filter</button>
              <a href={BASE} className="btn btn-outline btn-sm">Clear</a>
            </div>
          </div>
        </form>

        <div className="space-y-6">
          {Array.from(groups.entries()).map(([date, items]) => (
            <div key={date} className="border border-black">
              <div className="px-4 py-2 border-b border-black flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-[0.1em] font-semibold mono">{date}</span>
                <span className="text-[11px] mono text-[var(--muted)]">{items.length} image{items.length === 1 ? "" : "s"}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-3">
                {items.map((it) => (
                  <div key={it.id} className="border border-[var(--border)] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.img} alt={it.category ?? "eod"} className="w-full h-40 object-cover border border-[var(--border)]" />
                    <div className="mt-2 text-[11px] mono flex items-center justify-between">
                      <span className="font-semibold">{it.category ?? "-"}</span>
                      <span className="text-[var(--muted)]">#{it.id}</span>
                    </div>
                    {it.remarks && <div className="mt-1 text-[12px]">{it.remarks}</div>}
                    <div className="mt-1 text-[10px] text-[var(--muted)] mono">
                      By {it.uploadedBy != null ? userMap.get(it.uploadedBy) ?? `u${it.uploadedBy}` : "-"} · {it.createdAt.slice(0, 16).replace("T", " ")}
                    </div>
                    <div className="mt-2 flex justify-end">
                      <form action={deleteImage} className="inline">
                        <input type="hidden" name="id" value={it.id} />
                        <ConfirmButton message="Delete this image? This cannot be undone.">Del</ConfirmButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {groups.size === 0 && (
            <div className="border border-black px-4 py-8 text-center text-[13px] text-[var(--muted)]">
              No images to show. Upload one above.
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
