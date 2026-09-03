import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { ConfirmButton } from "@/components/confirm-button";
import { db, schema } from "@/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/db-errors";
import { today } from "@/lib/time";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const BASE = "/finance/cheque-books";
const BANK_PREFIX = "1.01.15.02.";
const ADV_PREFIX = "1.01.15.03.";

const intVal = (v: FormDataEntryValue | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v as string, 10);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: FormDataEntryValue | null): string | null => {
  const s = (v as string)?.trim();
  return s ? s : null;
};
const fmt = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

async function saveBook(formData: FormData) {
  "use server";
  const idRaw = formData.get("id") as string | null;
  const id = idRaw ? parseInt(idRaw, 10) : NaN;
  const isEdit = Number.isFinite(id) && id > 0;

  const name = txt(formData.get("name"));
  const bankAcc = txt(formData.get("bank_acc"));
  const accountNo = txt(formData.get("account_no"));
  const prefix = txt(formData.get("prefix"));
  const startNo = intVal(formData.get("start_no"));
  const leaves = intVal(formData.get("leaves"));

  const ctx = isEdit ? `edit=${id}` : "adding=1";
  if (!name || !bankAcc || startNo === null || leaves === null || leaves <= 0) {
    redirect(`${BASE}?error=invalid&${ctx}`);
  }

  try {
    if (isEdit) {
      await db
        .update(schema.chequeBooks)
        .set({ name: name!, bankAcc: bankAcc!, accountNo, prefix, startNo: startNo!, leaves: leaves! })
        .where(eq(schema.chequeBooks.id, id));
    } else {
      await db.insert(schema.chequeBooks).values({
        name: name!, bankAcc: bankAcc!, accountNo, prefix, startNo: startNo!, leaves: leaves!,
        status: "ACTIVE", createdAt: new Date().toISOString(),
      });
    }
  } catch (e) {
    if (isUniqueViolation(e)) redirect(`${BASE}?error=exists&${ctx}`);
    throw e;
  }
  revalidatePath(BASE);
  redirect(BASE);
}

async function deleteBook(formData: FormData) {
  "use server";
  const id = intVal(formData.get("id"));
  if (id === null) return;
  const session = await getSession();
  if (session?.roleName !== "ADMIN") redirect(`${BASE}?error=forbidden`);
  await db.delete(schema.chequeBooks).where(eq(schema.chequeBooks.id, id));
  revalidatePath(BASE);
  redirect(BASE);
}

type ChqStatus = "Issued" | "Cleared" | "Returned" | "Received";
type Reg = { chqNo: string; chqDate: string; payee: string; amount: number; status: ChqStatus };

export default async function ChequeBooksPage({
  searchParams,
}: {
  searchParams: Promise<{ adding?: string; edit?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const isAdding = params.adding === "1";
  const editId = params.edit ? parseInt(params.edit, 10) : NaN;
  const isEditing = Number.isFinite(editId) && editId > 0;

  const accounts = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.code);
  const descMap = new Map(accounts.map((a) => [a.code, a.description ?? ""]));
  const bankOpts = accounts
    .filter((a) => a.code.startsWith(BANK_PREFIX) || a.code.startsWith(ADV_PREFIX))
    .map((a) => ({ value: a.code, label: `${a.code} — ${a.description ?? ""}`, desc: a.description ?? "" }));

  const books = await db.select().from(schema.chequeBooks).orderBy(schema.chequeBooks.name);
  const editBook = isEditing ? books.find((b) => b.id === editId) ?? null : null;

  // Cheque register — every voucher line carrying a cheque number.
  const lines = await db
    .select({
      chqNo: schema.transDetail.chqNo,
      chqDate: schema.transDetail.chqDate,
      vtype: schema.transDetail.vtype,
      vdate: schema.transMain.vdate,
      trnType: schema.transMain.trnType,
      accCode: schema.transDetail.accCode,
      debit: schema.transDetail.debit,
      credit: schema.transDetail.credit,
    })
    .from(schema.transDetail)
    .innerJoin(
      schema.transMain,
      and(
        eq(schema.transDetail.fyCode, schema.transMain.fyCode),
        eq(schema.transDetail.vtype, schema.transMain.vtype),
        eq(schema.transDetail.vno, schema.transMain.vno),
      ),
    )
    .where(isNotNull(schema.transDetail.chqNo));

  // ADV lifecycle: which cheque numbers have cleared / bounced.
  const advClear = new Set<string>();
  const advBounce = new Set<string>();
  for (const l of lines) {
    const chq = (l.chqNo ?? "").trim();
    if (!chq || l.vtype !== "ADV") continue;
    if (l.trnType === "CLEAR") advClear.add(chq);
    if (l.trnType === "BOUNCE") advBounce.add(chq);
  }

  // One register entry per cheque number, from its "origin" line
  // (ADV ISSUE, or any BP/CP/BR/CR line — never the CLEAR/BOUNCE reversal).
  const reg = new Map<string, Reg>();
  for (const l of lines) {
    const chq = (l.chqNo ?? "").trim();
    if (!chq) continue;
    const isReversal = l.vtype === "ADV" && (l.trnType === "CLEAR" || l.trnType === "BOUNCE");
    if (isReversal) continue;
    const amount = (l.debit ?? 0) + (l.credit ?? 0);
    const existing = reg.get(chq);
    // Keep the largest-amount origin line as the representative.
    if (existing && existing.amount >= amount) continue;
    let status: ChqStatus;
    if (advBounce.has(chq)) status = "Returned";
    else if (advClear.has(chq)) status = "Cleared";
    else if (l.vtype === "BR" || l.vtype === "CR") status = "Received";
    else status = "Issued";
    reg.set(chq, {
      chqNo: chq,
      chqDate: (l.chqDate ?? l.vdate ?? "").trim(),
      payee: descMap.get(l.accCode) ?? l.accCode,
      amount,
      status,
    });
  }
  const regList = Array.from(reg.values());

  const counts = {
    issued: regList.filter((r) => r.status === "Issued").length,
    cleared: regList.filter((r) => r.status === "Cleared").length,
    returned: regList.filter((r) => r.status === "Returned").length,
    received: regList.filter((r) => r.status === "Received").length,
  };

  // Outstanding = issued & not yet cleared/returned → split by cheque date.
  const td = today();
  const outstanding = regList.filter((r) => r.status === "Issued");
  const upcoming = outstanding.filter((r) => r.chqDate && r.chqDate >= td).sort((a, b) => a.chqDate.localeCompare(b.chqDate));
  const pastDue = outstanding.filter((r) => r.chqDate && r.chqDate < td).sort((a, b) => b.chqDate.localeCompare(a.chqDate));
  const upcomingTot = upcoming.reduce((s, r) => s + r.amount, 0);
  const pastDueTot = pastDue.reduce((s, r) => s + r.amount, 0);

  // Per-book leaf usage.
  const bookUsage = books.map((b) => {
    let used = 0, cleared = 0, issued = 0, returned = 0;
    for (let i = 0; i < b.leaves; i++) {
      const leaf = b.startNo + i;
      const withPrefix = `${b.prefix ?? ""}${leaf}`;
      const hit = reg.get(withPrefix) ?? reg.get(String(leaf));
      if (hit) {
        used++;
        if (hit.status === "Cleared") cleared++;
        else if (hit.status === "Returned") returned++;
        else issued++;
      }
    }
    return { book: b, used, unused: b.leaves - used, cleared, issued, returned };
  });
  const totalUnused = bookUsage.reduce((s, u) => s + u.unused, 0);

  const ERR: Record<string, string> = {
    invalid: "Name, bank account, start number and a positive leaves count are required.",
    exists: "A cheque book with this name already exists.",
    forbidden: "Only ADMIN can delete.",
  };
  const errorMsg = params.error ? ERR[params.error] ?? "" : "";

  const showForm = isAdding || isEditing;

  const statusPill = (s: ChqStatus) => {
    const bg = s === "Cleared" ? "black" : s === "Returned" ? "var(--danger)" : s === "Received" ? "var(--muted)" : "transparent";
    const fg = s === "Issued" ? "black" : "white";
    return (
      <span className="inline-block text-[11px] px-2 py-0.5 uppercase font-semibold" style={{ letterSpacing: "0.05em", border: "1px solid black", background: bg, color: fg }}>
        {s}
      </span>
    );
  };

  const chequeTable = (rows: Reg[], emptyMsg: string) => (
    <div className="overflow-x-auto">
      <table style={{ minWidth: 520 }}>
        <thead>
          <tr>
            <th>Chq #</th>
            <th>Payee</th>
            <th className="text-right">Amount</th>
            <th>Chq Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.chqNo}>
              <td className="mono text-[13px]">{r.chqNo}</td>
              <td className="text-[12px]">{r.payee}</td>
              <td className="mono text-right text-[13px]">{fmt(r.amount)}</td>
              <td className="mono text-[12px]">{r.chqDate || "—"}</td>
              <td>{statusPill(r.status)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="text-center text-[12px] text-[var(--muted)] py-5">{emptyMsg}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <Shell active="fin-cheque-books">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-4">
          <div>
            <h1 className="page-title">Cheque Books</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {books.length} book{books.length === 1 ? "" : "s"} · statuses derived from vouchers (cheque no.)
            </p>
          </div>
          <div className="no-print flex gap-2">
            <a href={`${BASE}?adding=1`} className="btn btn-sm">New Cheque Book</a>
            <a href="/finance/advance-cheque" className="btn btn-outline btn-sm">Advance Cheque</a>
          </div>
        </div>

        {errorMsg && (
          <div className="border-2 border-[var(--danger)] px-4 py-2 mb-4 text-[12px] text-[var(--danger)] font-semibold mono">{errorMsg}</div>
        )}

        {/* Status counters */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-black border border-black mb-6">
          <div className="bg-white p-5"><div className="stat-value">{counts.issued}</div><div className="stat-label">Issued</div></div>
          <div className="bg-white p-5"><div className="stat-value">{counts.cleared}</div><div className="stat-label">Cleared</div></div>
          <div className="bg-white p-5"><div className="stat-value">{counts.returned}</div><div className="stat-label">Returned</div></div>
          <div className="bg-white p-5"><div className="stat-value">{totalUnused}</div><div className="stat-label">Unused Leaves</div></div>
          <div className="bg-white p-5"><div className="stat-value">{regList.length}</div><div className="stat-label">Total Cheques</div></div>
        </div>

        {/* Upcoming + Past Due */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <div className="border border-black">
            <div className="px-4 py-3 border-b-2 border-black flex justify-between items-baseline">
              <span className="text-[11px] uppercase tracking-[0.1em] font-semibold">Upcoming Cheques</span>
              <span className="mono text-[12px]">Total {fmt(upcomingTot)}</span>
            </div>
            {chequeTable(upcoming, "No upcoming cheques.")}
          </div>
          <div className="border border-black">
            <div className="px-4 py-3 border-b-2 border-black flex justify-between items-baseline">
              <span className="text-[11px] uppercase tracking-[0.1em] font-semibold">Past Due Cheques</span>
              <span className="mono text-[12px]">Total {fmt(pastDueTot)}</span>
            </div>
            {chequeTable(pastDue, "No past-due cheques.")}
          </div>
        </div>

        {/* Create / edit form */}
        {showForm && (
          <div className="border border-black p-4 mb-6">
            <div className="text-[11px] uppercase tracking-[0.1em] font-semibold mb-4">
              {isEditing ? `Edit Cheque Book — ${editBook?.name ?? ""}` : "New Cheque Book"}
            </div>
            <form action={saveBook}>
              {editBook && <input type="hidden" name="id" value={editBook.id} />}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3 gform">
                <div className="lg:col-span-4">
                  <label className="label block mb-1">Name</label>
                  <input name="name" className="input-box mono" defaultValue={editBook?.name ?? ""} placeholder="e.g. MEEZAN-521031-50" required />
                </div>
                <div className="lg:col-span-5">
                  <label className="label block mb-1">Bank Account</label>
                  <Combobox name="bank_acc" options={bankOpts} defaultValue={editBook?.bankAcc ?? ""} placeholder="Bank / advance account" />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Account No</label>
                  <input name="account_no" className="input-box mono" defaultValue={editBook?.accountNo ?? ""} placeholder="Optional" />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Cheque No Prefix</label>
                  <input name="prefix" className="input-box mono" defaultValue={editBook?.prefix ?? ""} placeholder="Optional" />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Start No</label>
                  <input name="start_no" type="number" step="1" min="0" className="input-box mono" defaultValue={editBook?.startNo ?? ""} required />
                </div>
                <div className="lg:col-span-3">
                  <label className="label block mb-1">Leaves</label>
                  <input name="leaves" type="number" step="1" min="1" className="input-box mono" defaultValue={editBook?.leaves ?? ""} placeholder="e.g. 50" required />
                </div>
                <div className="lg:col-span-3 flex items-end gap-2">
                  <button type="submit" className="btn btn-sm flex-1">{isEditing ? "Update" : "Create"}</button>
                  <a href={BASE} className="btn btn-outline btn-sm">Cancel</a>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Cheque books list */}
        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">Cheque Books</div>
          <div className="overflow-x-auto">
            <table style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Bank</th>
                  <th>Account No</th>
                  <th>Range</th>
                  <th style={{ width: 200 }}>Usage</th>
                  <th>Summary</th>
                  <th className="no-print text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookUsage.map((u) => {
                  const pct = u.book.leaves > 0 ? Math.round((u.used / u.book.leaves) * 100) : 0;
                  const last = u.book.startNo + u.book.leaves - 1;
                  return (
                    <tr key={u.book.id}>
                      <td className="mono text-[13px] font-bold">{u.book.name}</td>
                      <td className="text-[12px]">
                        <span className="mono">{u.book.bankAcc}</span>
                        <span className="text-[11px] text-[var(--muted)] ml-1">— {descMap.get(u.book.bankAcc) ?? ""}</span>
                      </td>
                      <td className="mono text-[12px]">{u.book.accountNo || "—"}</td>
                      <td className="mono text-[12px]">{u.book.prefix ?? ""}{u.book.startNo}–{u.book.prefix ?? ""}{last}</td>
                      <td>
                        <div className="text-[11px] mono mb-1">{u.used}/{u.book.leaves} used · {u.unused} left</div>
                        <div style={{ height: 6, background: "var(--border, #e5e5e5)", border: "1px solid black" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "black" }} />
                        </div>
                      </td>
                      <td className="text-[11px]">
                        <span className="mr-2">{u.issued} Issued</span>
                        <span className="mr-2">{u.cleared} Cleared</span>
                        {u.returned > 0 && <span className="mr-2 text-[var(--danger)]">{u.returned} Returned</span>}
                        <span className="text-[var(--muted)]">{u.unused} Unused</span>
                      </td>
                      <td className="no-print text-right whitespace-nowrap">
                        <a href={`${BASE}?edit=${u.book.id}`} className="btn btn-outline btn-sm mr-1">Edit</a>
                        {session?.roleName === "ADMIN" && (
                          <form action={deleteBook} className="inline">
                            <input type="hidden" name="id" value={u.book.id} />
                            <ConfirmButton message="Delete this cheque book?">Del</ConfirmButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {bookUsage.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-[13px] text-[var(--muted)] py-6">No cheque books. Click <b>New Cheque Book</b> above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
