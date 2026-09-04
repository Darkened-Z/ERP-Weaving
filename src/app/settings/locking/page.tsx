import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { requireSession, getSession } from "@/lib/auth";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { txt } from "@/lib/form";

export const dynamic = "force-dynamic";

const BASE = "/settings/locking";
const MODULES = ["FINANCE", "INVENTORY", "STORE", "ALL"] as const;

const canManage = (role: string) => role === "ADMIN" || role === "EXECUTIVE";

async function savePeriodLock(formData: FormData) {
  "use server";
  const session = await requireSession();
  if (!canManage(session.roleName)) redirect(`${BASE}?error=forbidden`);

  const fyCode = txt(formData.get("fyCode"));
  const module = txt(formData.get("module"));
  const lockedThrough = txt(formData.get("lockedThrough"));
  const remarks = txt(formData.get("remarks"));

  if (!fyCode || !module || !lockedThrough) redirect(`${BASE}?error=missing`);
  if (!(MODULES as readonly string[]).includes(module!)) redirect(`${BASE}?error=bad_module`);

  const now = new Date().toISOString();
  const existing = await db
    .select({ id: schema.periodLocks.id, lockedThrough: schema.periodLocks.lockedThrough })
    .from(schema.periodLocks)
    .where(and(eq(schema.periodLocks.fyCode, fyCode!), eq(schema.periodLocks.module, module!)))
    .limit(1);

  if (existing[0]) {
    if (lockedThrough! > existing[0].lockedThrough) {
      await db
        .update(schema.periodLocks)
        .set({
          lockedThrough: lockedThrough!,
          lockedBy: session.userId,
          lockedAt: now,
          remarks,
        })
        .where(eq(schema.periodLocks.id, existing[0].id));
    }
  } else {
    await db.insert(schema.periodLocks).values({
      fyCode: fyCode!,
      module: module!,
      lockedThrough: lockedThrough!,
      lockedBy: session.userId,
      lockedAt: now,
      remarks,
    });
  }
  revalidatePath(BASE);
  redirect(BASE);
}

async function deletePeriodLock(formData: FormData) {
  "use server";
  const session = await requireSession();
  if (session.roleName !== "ADMIN") redirect(`${BASE}?error=admin_only`);
  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  if (!Number.isFinite(id) || id <= 0) redirect(BASE);
  await db.delete(schema.periodLocks).where(eq(schema.periodLocks.id, id));
  revalidatePath(BASE);
  redirect(BASE);
}

const ERR_MSG: Record<string, string> = {
  forbidden: "Only ADMIN or EXECUTIVE can manage period locks.",
  admin_only: "Only ADMIN can delete period locks.",
  missing: "Fiscal year, module and locked-through date are required.",
  bad_module: "Module must be FINANCE, INVENTORY, STORE or ALL.",
};

export default async function LockingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  const role = session?.roleName ?? "";
  const params = await searchParams;

  const locks = await db
    .select()
    .from(schema.systemLocking)
    .orderBy(schema.systemLocking.module);

  const [fys, periodRows, users] = await Promise.all([
    db
      .select({ code: schema.fiscalYears.code, description: schema.fiscalYears.description })
      .from(schema.fiscalYears)
      .orderBy(desc(schema.fiscalYears.code)),
    db
      .select()
      .from(schema.periodLocks)
      .orderBy(schema.periodLocks.fyCode, schema.periodLocks.module),
    db
      .select({ id: schema.users.id, fullName: schema.users.fullName, login: schema.users.login })
      .from(schema.users),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u.fullName || u.login]));
  const [company] = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const defaultFy = company?.currentFy ?? fys[0]?.code ?? "";

  const manage = canManage(role);

  return (
    <Shell active="locking">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-8 gap-4">
          <div>
            <h1 className="page-title">System Locking</h1>
            <p className="text-[var(--muted)] text-sm mt-1">
              Per-module date locking prevents backdated entries
            </p>
          </div>
        </div>

        {params.error && ERR_MSG[params.error] && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">
            {ERR_MSG[params.error]}
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>Description</th>
              <th>Lock Date</th>
              <th>Locked By</th>
            </tr>
          </thead>
          <tbody>
            {locks.map((l) => (
              <tr key={l.id}>
                <td className="mono text-[13px]">
                  <span className="flex items-center gap-2">
                    {l.lockDate && (
                      <span
                        className="inline-block w-2 h-2"
                        style={{ background: "#000" }}
                      />
                    )}
                    {l.module}
                  </span>
                </td>
                <td>{l.description}</td>
                <td>
                  {l.lockDate ? (
                    <span className="mono text-[13px]">{l.lockDate}</span>
                  ) : (
                    <span className="text-[var(--muted)] text-[13px]">
                      NOT LOCKED
                    </span>
                  )}
                </td>
                <td>{l.lockedBy ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-12">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-4 gap-4">
            <div>
              <h2 className="text-lg font-semibold uppercase tracking-[0.05em]">Period Locks</h2>
              <p className="text-[var(--muted)] text-[13px] mt-1">
                Fiscal-year period locks — vouchers dated on or before <b>Locked Through</b> are blocked for the selected module.
                <br />Module <span className="mono">ALL</span> locks every module.
              </p>
            </div>
          </div>

          <div className="border border-black">
            <table className="mono text-[12px]">
              <thead>
                <tr>
                  <th>FY</th>
                  <th>Module</th>
                  <th>Locked Through</th>
                  <th>Locked By</th>
                  <th>Locked At</th>
                  <th>Remarks</th>
                  {role === "ADMIN" && <th></th>}
                </tr>
              </thead>
              <tbody>
                {periodRows.length === 0 && (
                  <tr>
                    <td colSpan={role === "ADMIN" ? 7 : 6} className="text-center text-[var(--muted)] py-6">
                      No period locks set.
                    </td>
                  </tr>
                )}
                {periodRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.fyCode}</td>
                    <td>{r.module}</td>
                    <td>{r.lockedThrough}</td>
                    <td>{r.lockedBy != null ? userMap.get(r.lockedBy) ?? r.lockedBy : ""}</td>
                    <td className="text-[11px]">{r.lockedAt.slice(0, 19).replace("T", " ")}</td>
                    <td className="text-[11px]">{r.remarks ?? ""}</td>
                    {role === "ADMIN" && (
                      <td className="text-center">
                        <form action={deletePeriodLock} className="inline">
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmButton message="Delete this period lock?">
                            Del
                          </ConfirmButton>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {manage ? (
            <form action={savePeriodLock} className="border border-black mt-6 p-4">
              <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-3">
                Add / Update Period Lock
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-2">
                  <label className="label block mb-1">Fiscal Year</label>
                  {fys.length > 0 ? (
                    <select name="fyCode" className="input-box mono" defaultValue={defaultFy} required>
                      {fys.map((f) => (
                        <option key={f.code} value={f.code}>
                          {f.code}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input name="fyCode" className="input-box mono" defaultValue={defaultFy} required />
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="label block mb-1">Module</label>
                  <select name="module" className="input-box mono" defaultValue="FINANCE" required>
                    {MODULES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="label block mb-1">Locked Through</label>
                  <input
                    name="lockedThrough"
                    type="date"
                    className="input-box mono"
                    required
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="label block mb-1">Remarks</label>
                  <input name="remarks" className="input-box mono" />
                </div>
                <div className="md:col-span-2 flex items-end">
                  <button type="submit" className="btn btn-sm w-full">
                    Save Lock
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-[var(--muted)] mt-2">
                Upsert by (FY, Module). A later Locked Through overrides an earlier one; earlier values are ignored.
              </p>
            </form>
          ) : (
            <p className="text-[11px] text-[var(--muted)] mt-4">
              You need role ADMIN or EXECUTIVE to add or modify period locks.
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}
