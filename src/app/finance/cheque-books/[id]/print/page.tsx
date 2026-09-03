import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { today } from "@/lib/time";
import { loadChequeRegister, type ChequeDisplay } from "@/lib/cheque-register";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
const fmt = (n: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

export default async function ChequeBookPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bookId = parseInt(id, 10);
  if (!Number.isFinite(bookId)) redirect("/finance/cheque-books");

  const [book] = await db.select().from(schema.chequeBooks).where(eq(schema.chequeBooks.id, bookId));
  if (!book) redirect("/finance/cheque-books");

  const accounts = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts);
  const descMap = new Map(accounts.map((a) => [a.code, a.description ?? ""]));
  const reg = await loadChequeRegister(descMap);

  type Leaf = { no: number; chqNo: string; used: boolean; payee: string; amount: number; chqDate: string; status: ChequeDisplay | "Unused" };
  const leaves: Leaf[] = [];
  for (let i = 0; i < book.leaves; i++) {
    const no = book.startNo + i;
    const label = `${book.prefix ?? ""}${no}`;
    const hit = reg.get(label) ?? reg.get(String(no));
    leaves.push({
      no,
      chqNo: label,
      used: !!hit,
      payee: hit?.payee ?? "",
      amount: hit?.amount ?? 0,
      chqDate: hit?.chqDate ?? "",
      status: hit?.eff ?? "Unused",
    });
  }
  const usedCount = leaves.filter((l) => l.used).length;
  const usedTotal = leaves.reduce((s, l) => s + l.amount, 0);
  const bankName = descMap.get(book.bankAcc) ?? book.bankAcc;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <PrintButton label="Print" />
      </div>

      <div style={{ borderBottom: "2px solid black", paddingBottom: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>Cheque Book — {book.name}</h1>
        <div className="mono" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.7 }}>
          Bank: {book.bankAcc} — {bankName}<br />
          Account No: {book.accountNo || "—"} · Range: {book.prefix ?? ""}{book.startNo}–{book.prefix ?? ""}{book.startNo + book.leaves - 1} · Leaves: {book.leaves}<br />
          Used: {usedCount} · Unused: {book.leaves - usedCount} · Printed: {today()}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Leaf</th>
              <th>Cheque No</th>
              <th>Payee</th>
              <th className="text-right">Amount</th>
              <th>Chq Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l.no} style={l.used ? undefined : { color: "var(--muted)" }}>
                <td className="mono text-[12px]">{l.no}</td>
                <td className="mono text-[13px]">{l.chqNo}</td>
                <td className="text-[12px]">{l.payee || "—"}</td>
                <td className="mono text-right text-[13px]">{l.used ? fmt(l.amount) : "—"}</td>
                <td className="mono text-[12px]">{l.chqDate || "—"}</td>
                <td className="text-[11px] uppercase font-semibold">{l.status}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
              <td colSpan={3} className="text-right pr-2">Used {usedCount} cheques — Total</td>
              <td className="mono text-right">{fmt(usedTotal)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
