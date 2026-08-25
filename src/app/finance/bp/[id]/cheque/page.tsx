import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { numberToWords } from "@/lib/number-to-words";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

// Formats a Pakistan date string (YYYY-MM-DD) into a boxed DDMMYYYY layout
// suitable for a pre-printed cheque date grid.
function dateDigits(iso?: string | null): string[] {
  if (!iso) return Array(8).fill("");
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return Array(8).fill("");
  const dd = m[3];
  const mm = m[2];
  const yyyy = m[1];
  return [...dd, ...mm, ...yyyy];
}

export default async function BpChequePrint({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const { line: lineParam } = await searchParams;
  const vid = parseInt(id, 10);
  if (!Number.isFinite(vid) || vid <= 0) notFound();

  const [head] = await db
    .select()
    .from(schema.transMain)
    .where(and(eq(schema.transMain.id, vid), eq(schema.transMain.vtype, "BP")))
    .limit(1);
  if (!head) notFound();

  const details = await db
    .select()
    .from(schema.transDetail)
    .where(
      and(
        eq(schema.transDetail.fyCode, head.fyCode),
        eq(schema.transDetail.vtype, "BP"),
        eq(schema.transDetail.vno, head.vno),
      ),
    )
    .orderBy(schema.transDetail.srno);

  // Payee lines are the debit rows (dr = payee, cr = bank); pick the requested
  // srno via ?line=, otherwise print one cheque per payee.
  const payeeLines = details.filter((d) => (d.debit ?? 0) > 0 && d.srno < 100);
  const lineNo = lineParam ? parseInt(lineParam, 10) : NaN;
  const selected = Number.isFinite(lineNo)
    ? payeeLines.filter((l) => l.srno === lineNo)
    : payeeLines;

  const accountCodes = new Set<string>();
  for (const d of selected) accountCodes.add(d.accCode);
  if (head.accCode) accountCodes.add(head.accCode);
  const accounts = accountCodes.size
    ? await db.select().from(schema.chartOfAccounts)
    : [];
  const accByCode = new Map(accounts.map((a) => [a.code, a]));

  const chequePages = selected.map((line) => {
    const payeeAcc = accByCode.get(line.accCode);
    const payeeName = payeeAcc?.description ?? line.accCode;
    const amount = line.debit ?? 0;
    const words = numberToWords(amount);
    const digits = dateDigits(line.chqDate ?? head.vdate);
    return { line, payeeName, amount, words, digits };
  });

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .cheque-sheet { page-break-after: always; box-shadow: none !important; }
          .cheque-sheet:last-child { page-break-after: auto; }
        }
        .cheque-wrap {
          background: #f5f5f5;
          min-height: 100vh;
          padding: 24px 12px;
        }
        .cheque-toolbar {
          max-width: 210mm;
          margin: 0 auto 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .cheque-sheet {
          width: 210mm;
          height: 99mm;
          margin: 0 auto 16px;
          background: #fff;
          position: relative;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          font-family: 'Courier New', 'Consolas', monospace;
          color: #000;
        }
        .cheque-guide {
          position: absolute;
          inset: 0;
          border: 1px dashed rgba(0,0,0,0.15);
          pointer-events: none;
        }
        @media print { .cheque-guide { display: none; } }
        .cheque-field {
          position: absolute;
          font-size: 11pt;
          font-weight: 700;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }
        .cheque-date-cell {
          position: absolute;
          top: 12mm;
          width: 6mm;
          text-align: center;
          font-size: 12pt;
          font-weight: 700;
        }
        .cheque-payee {
          top: 32mm;
          left: 30mm;
          right: 12mm;
          max-width: 150mm;
        }
        .cheque-words-1 {
          top: 45mm;
          left: 30mm;
          right: 12mm;
        }
        .cheque-words-2 {
          top: 54mm;
          left: 12mm;
          right: 12mm;
        }
        .cheque-amount-num {
          top: 51mm;
          right: 14mm;
          font-size: 12pt;
          border: 1px solid transparent;
          padding: 2px 6px;
          font-weight: 800;
        }
        .cheque-stub {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 60mm;
          padding: 8mm 6mm;
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 8pt;
          border-right: 1px dashed rgba(0,0,0,0.2);
        }
        @media print { .cheque-stub { border-right: none; } }
        .cheque-stub .stub-label {
          font-size: 6.5pt;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #333;
          margin-top: 6px;
        }
        .cheque-stub .stub-value {
          font-size: 9pt;
          font-weight: 700;
          margin-top: 1px;
        }
      `}</style>

      <div className="cheque-wrap">
        <div className="cheque-toolbar no-print">
          <Link href={`/finance/bp?id=${vid}`} className="btn btn-outline btn-sm">
            Back
          </Link>
          <PrintButton label="Print Cheque" />
        </div>

        {chequePages.length === 0 ? (
          <div className="max-w-[210mm] mx-auto p-6 bg-white border border-black text-[13px]">
            No payee lines found on BP #{head.vno}.
          </div>
        ) : chequePages.map(({ line, payeeName, amount, words, digits }, idx) => {
          const bankName = head.accCode ? accByCode.get(head.accCode)?.description ?? head.accCode : "";
          return (
            <div key={`${line.srno}-${idx}`} className="cheque-sheet">
              <div className="cheque-guide" />

              {/* Stub / counterfoil area for internal record */}
              <div className="cheque-stub no-print">
                <div className="stub-label">Voucher</div>
                <div className="stub-value">BP-{head.vno} · Line {line.srno}</div>
                <div className="stub-label">Date</div>
                <div className="stub-value">{line.chqDate ?? head.vdate}</div>
                <div className="stub-label">Cheque No</div>
                <div className="stub-value">{line.chqNo ?? "—"}</div>
                <div className="stub-label">Bank</div>
                <div className="stub-value">{bankName}</div>
                <div className="stub-label">Payee</div>
                <div className="stub-value">{payeeName}</div>
                <div className="stub-label">Amount</div>
                <div className="stub-value">Rs. {fmt(amount)}</div>
              </div>

              {/* Date digits — DDMMYYYY grid across top-right */}
              {digits.map((d, i) => (
                <div
                  key={`date-${i}`}
                  className="cheque-date-cell"
                  style={{ right: `${14 + (7 - i) * 7}mm` }}
                >
                  {d}
                </div>
              ))}

              {/* Payee name — after "Pay" */}
              <div className="cheque-field cheque-payee">{payeeName}</div>

              {/* Amount in words — two lines */}
              <div className="cheque-field cheque-words-1">{words}</div>

              {/* Numeric amount box */}
              <div className="cheque-field cheque-amount-num">****{fmt(amount)}/-</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
