import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function waLink(c: { party: string; greyQuality: string | null; quantity: number | null; rate: number | null; notes: string | null }) {
  const lines = [
    "*Contract*",
    `Party: ${c.party}`,
    c.greyQuality ? `Grey Quality: ${c.greyQuality}` : null,
    c.quantity != null ? `Quantity: ${c.quantity}` : null,
    c.rate != null ? `Rate: ${c.rate}` : null,
    c.notes ? `Notes: ${c.notes}` : null,
  ].filter(Boolean);
  return "https://wa.me/?text=" + encodeURIComponent(lines.join("\n"));
}

export default async function QuickContractPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  async function saveQuickContract(formData: FormData) {
    "use server";
    const s = await requireSession();
    const party = (formData.get("party") as string)?.trim();
    if (!party) redirect("/quick-contract");
    const num = (v: FormDataEntryValue | null) => {
      const n = parseFloat((v as string) ?? "");
      return Number.isFinite(n) ? n : null;
    };
    await db.insert(schema.quickContracts).values({
      party,
      greyQuality: (formData.get("grey_quality") as string)?.trim() || null,
      quantity: num(formData.get("quantity")),
      rate: num(formData.get("rate")),
      notes: (formData.get("notes") as string)?.trim() || null,
      status: "PENDING",
      createdBy: s.fullName,
      createdAt: new Date().toISOString(),
    });
    revalidatePath("/quick-contract");
    redirect("/quick-contract?saved=1");
  }

  async function markProcessed(formData: FormData) {
    "use server";
    await requireSession();
    const id = parseInt(formData.get("id") as string);
    if (id) {
      await db.update(schema.quickContracts).set({ status: "PROCESSED" }).where(eq(schema.quickContracts.id, id));
      revalidatePath("/quick-contract");
    }
    redirect("/quick-contract");
  }

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);
  const greyList = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction)
    .orderBy(schema.greyConstruction.code);
  const recent = await db
    .select()
    .from(schema.quickContracts)
    .orderBy(desc(schema.quickContracts.createdAt))
    .limit(20);

  return (
    <Shell active="quick-contract">
      <div className="animate-in max-w-md mx-auto">
        <div className="mb-6">
          <h1 className="page-title">Quick Contract</h1>
          <p className="text-[12px] text-[var(--muted)] mt-1">
            Capture a contract on the spot — accounts formalises it later.
          </p>
        </div>

        {params.saved && (
          <div className="mb-4 border border-[var(--border-light)] bg-[var(--surface)] px-4 py-3 text-[13px] font-semibold">
            ✓ Contract saved — pending for accounts.
          </div>
        )}

        <form action={saveQuickContract} className="space-y-4">
          <div>
            <label className="label block mb-1">Party</label>
            <input name="party" list="qc-parties" required autoFocus className="input-box mono py-3 text-[15px]" placeholder="Party name" />
          </div>
          <div>
            <label className="label block mb-1">Grey Quality</label>
            <input name="grey_quality" list="qc-grey" className="input-box mono py-3 text-[15px]" placeholder="e.g. 30x30 / 124x64" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1">Quantity</label>
              <input name="quantity" type="number" step="any" inputMode="decimal" className="input-box mono py-3 text-[15px]" placeholder="0" />
            </div>
            <div>
              <label className="label block mb-1">Rate</label>
              <input name="rate" type="number" step="any" inputMode="decimal" className="input-box mono py-3 text-[15px]" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="label block mb-1">Notes</label>
            <textarea name="notes" rows={3} className="input-box mono py-3 text-[15px]" placeholder="Any details…" />
          </div>
          <button type="submit" className="btn w-full py-3 text-[15px]">Save Contract</button>
        </form>

        <datalist id="qc-parties">
          {parties.map((p) => (
            <option key={p.code} value={p.description}>{p.code}</option>
          ))}
        </datalist>
        <datalist id="qc-grey">
          {greyList.map((g) => (
            <option key={g.code} value={g.description}>{g.code}</option>
          ))}
        </datalist>

        <div className="mt-8">
          <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--muted)] mb-2">
            Recent ({recent.length})
          </div>
          <div className="space-y-2">
            {recent.length === 0 && (
              <div className="text-[13px] text-[var(--muted)] py-4 text-center">No contracts yet.</div>
            )}
            {recent.map((c) => (
              <div key={c.id} className="border border-[var(--border-light)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-[14px] truncate">{c.party}</div>
                  <span
                    className="text-[9px] uppercase tracking-[0.1em] font-semibold shrink-0 border border-transparent px-1.5 py-0.5 text-white"
                    style={{ background: c.status === "PROCESSED" ? "var(--success)" : "var(--warning)" }}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="mono text-[12px] text-[var(--muted)] mt-0.5">
                  {[c.greyQuality, c.quantity != null ? `Qty ${c.quantity}` : null, c.rate != null ? `Rate ${c.rate}` : null].filter(Boolean).join(" · ")}
                </div>
                {c.notes && <div className="text-[12px] mt-1">{c.notes}</div>}
                <div className="flex items-center gap-3 mt-2 text-[11px]">
                  <a href={waLink(c)} target="_blank" rel="noopener noreferrer" className="text-[var(--muted)] hover:text-[var(--fg)] font-semibold uppercase tracking-[0.08em]">
                    WhatsApp
                  </a>
                  {c.status !== "PROCESSED" && (
                    <form action={markProcessed}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="text-[var(--muted)] hover:text-[var(--fg)] font-semibold uppercase tracking-[0.08em] cursor-pointer">
                        Mark done
                      </button>
                    </form>
                  )}
                  <span className="text-[var(--muted)] ml-auto">{c.createdBy}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
