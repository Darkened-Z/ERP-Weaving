import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { getSession, requireSession } from "@/lib/auth";
import { invalidateGlCache } from "@/lib/gl-accounts";
import { today } from "@/lib/time";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const BASE = "/settings/posting-accounts";

const ERR_MSG: Record<string, string> = {
  admin_only: "Only ADMIN can edit posting accounts.",
  no_changes: "No account codes were changed.",
};

async function saveAccounts(formData: FormData) {
  "use server";
  const session = await requireSession();
  if (session.roleName !== "ADMIN") redirect(`${BASE}?error=admin_only`);

  const rows = await db.select().from(schema.postingAccounts);
  const stamp = today();
  let changed = 0;

  for (const r of rows) {
    const raw = formData.get(`accCode__${r.key}`);
    const next = typeof raw === "string" ? raw.trim() : "";
    if (!next || next === r.accCode) continue;
    await db
      .update(schema.postingAccounts)
      .set({ accCode: next, updatedAt: stamp })
      .where(eq(schema.postingAccounts.key, r.key));
    changed++;
  }

  if (changed > 0) {
    invalidateGlCache();
    revalidatePath(BASE);
  }
  redirect(changed > 0 ? BASE : `${BASE}?error=no_changes`);
}

export default async function PostingAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const isAdmin = session?.roleName === "ADMIN";

  const [postings, accounts] = await Promise.all([
    db.select().from(schema.postingAccounts).orderBy(schema.postingAccounts.label),
    db
      .select({
        code: schema.chartOfAccounts.code,
        description: schema.chartOfAccounts.description,
        level: schema.chartOfAccounts.level,
      })
      .from(schema.chartOfAccounts)
      .orderBy(schema.chartOfAccounts.code),
  ]);

  const descByCode = new Map(accounts.map((a) => [a.code, a.description]));

  const acctOptions = accounts.map((a) => {
    const depth = Math.max(0, (a.level ?? a.code.split(".").length) - 1);
    const indent = "  ".repeat(depth);
    return {
      value: a.code,
      label: `${indent}${a.code} — ${a.description}`,
      desc: a.description,
    };
  });

  return (
    <Shell active="posting-accounts">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">
              Posting Accounts{" "}
              <span className="text-[var(--muted)] text-lg font-normal">
                ({postings.length})
              </span>
            </h1>
            <p className="text-[var(--muted)] text-sm mt-1">
              Chart-of-account codes used by voucher save routines. Changing a
              row here re-routes every subsequent posting to the new code.
            </p>
          </div>
        </div>

        {!isAdmin && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            Only ADMIN can edit posting accounts
          </div>
        )}

        {params.error && ERR_MSG[params.error] && (
          <div
            className={`border-2 px-4 py-2 mb-4 text-[12px] font-semibold mono ${
              params.error === "no_changes"
                ? "border-black text-[var(--muted)]"
                : "border-[var(--danger)] text-[var(--danger)]"
            }`}
          >
            {ERR_MSG[params.error]}
          </div>
        )}

        {postings.length === 0 ? (
          <div className="border border-black p-6 text-center text-[13px] text-[var(--muted)]">
            No posting accounts seeded yet.
          </div>
        ) : (
          <form action={saveAccounts}>
            <fieldset disabled={!isAdmin}>
              <div className="border border-black">
                <table className="mono text-[12px]">
                  <thead>
                    <tr>
                      <th className="text-left">Key</th>
                      <th className="text-left">Label</th>
                      <th className="text-left">Voucher Type</th>
                      <th className="text-left">Account Code</th>
                      <th className="text-left">Current Description</th>
                      <th className="text-left">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postings.map((r) => {
                      const desc = descByCode.get(r.accCode);
                      const descId = `desc__${r.key}`;
                      return (
                        <tr key={r.key}>
                          <td className="align-top pt-3 whitespace-nowrap">
                            {r.key}
                          </td>
                          <td className="align-top pt-3">{r.label}</td>
                          <td className="align-top pt-3 whitespace-nowrap">
                            {r.vtype ?? ""}
                          </td>
                          <td className="align-top min-w-[22rem]">
                            <Combobox
                              name={`accCode__${r.key}`}
                              options={acctOptions}
                              defaultValue={r.accCode}
                              placeholder="Select account..."
                              descTargetId={descId}
                            />
                          </td>
                          <td className="align-top">
                            <input
                              id={descId}
                              className="input-box mono w-full"
                              defaultValue={desc ?? ""}
                              readOnly
                              tabIndex={-1}
                            />
                          </td>
                          <td className="align-top pt-3 whitespace-nowrap text-[11px] text-[var(--muted)]">
                            {r.updatedAt ?? ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {isAdmin && (
                <div className="flex justify-end mt-4">
                  <button type="submit" className="btn">
                    Save Posting Accounts
                  </button>
                </div>
              )}
            </fieldset>
          </form>
        )}

        <div className="border border-black p-4 mt-8">
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-2">
            Note
          </div>
          <p className="text-[12px] text-[var(--muted)] leading-relaxed">
            The GL cache reloads automatically on save so the next voucher
            posted picks up the new codes. A missing key falls back to the
            hard-coded Oracle default in{" "}
            <span className="mono">src/lib/gl-accounts.ts</span>.
          </p>
        </div>
      </div>
    </Shell>
  );
}
