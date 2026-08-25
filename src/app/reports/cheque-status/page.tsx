import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, gte, lte, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;

type Row = {
  chqNo: string;
  chqDate: string;
  vtype: string;
  vno: number;
  vdate: string;
  partyCode: string | null;
  partyName: string;
  amount: number;
  status: "RECEIVED" | "ISSUED" | "ENDORSED";
};

export default async function ChequeStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const dateFrom = params.from?.trim() || yearStart();
  const dateTo = params.to?.trim() || today();
  const statusFilter = params.status?.trim().toUpperCase() || "";

  const accounts = await db.select().from(schema.chartOfAccounts);
  const accMap = new Map(accounts.map((a) => [a.code, a.description ?? ""]));

  const rawRows = await db
    .select({
      chqNo: schema.transDetail.chqNo,
      chqDate: schema.transDetail.chqDate,
      vtype: schema.transDetail.vtype,
      vno: schema.transDetail.vno,
      vdate: schema.transMain.vdate,
      partyCode: schema.transDetail.partyCode,
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
    .where(
      and(
        isNotNull(schema.transDetail.chqNo),
        gte(schema.transMain.vdate, dateFrom),
        lte(schema.transMain.vdate, dateTo),
      ),
    )
    .orderBy(schema.transMain.vdate, schema.transDetail.vtype, schema.transDetail.vno);

  const occurrenceCount = new Map<string, number>();
  for (const r of rawRows) {
    const k = (r.chqNo ?? "").trim();
    if (!k) continue;
    occurrenceCount.set(k, (occurrenceCount.get(k) ?? 0) + 1);
  }

  const rows: Row[] = rawRows
    .map((r) => {
      const chq = (r.chqNo ?? "").trim();
      if (!chq) return null;
      const amount = (r.debit ?? 0) + (r.credit ?? 0);
      const isReceipt = r.vtype === "BR" || r.vtype === "CR";
      const isPayment = r.vtype === "BP" || r.vtype === "CP";
      const dup = (occurrenceCount.get(chq) ?? 0) > 1;
      let status: Row["status"];
      if (dup) status = "ENDORSED";
      else if (isReceipt) status = "RECEIVED";
      else if (isPayment) status = "ISSUED";
      else status = "ISSUED";
      const partyLookup = r.partyCode || r.accCode;
      return {
        chqNo: chq,
        chqDate: r.chqDate ?? r.vdate,
        vtype: r.vtype,
        vno: r.vno,
        vdate: r.vdate,
        partyCode: partyLookup,
        partyName: accMap.get(partyLookup ?? "") ?? partyLookup ?? "",
        amount,
        status,
      } as Row;
    })
    .filter(Boolean) as Row[];

  const filtered = statusFilter ? rows.filter((r) => r.status === statusFilter) : rows;

  const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));

  const counts = {
    RECEIVED: rows.filter((r) => r.status === "RECEIVED").length,
    ISSUED: rows.filter((r) => r.status === "ISSUED").length,
    ENDORSED: rows.filter((r) => r.status === "ENDORSED").length,
  };
  const totalAmount = filtered.reduce((s, r) => s + Math.abs(r.amount), 0);

  const excelRows = filtered.map((r) => ({
    chqNo: r.chqNo,
    chqDate: r.chqDate,
    vtype: r.vtype,
    vno: r.vno,
    vdate: r.vdate,
    party: r.partyName,
    amount: r.amount,
    status: r.status,
  }));

  return (
    <Shell active="fin-cheque">
      <div className="animate-in">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="page-title">Cheque Status</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {filtered.length} cheques{statusFilter ? ` · ${statusFilter}` : ""}
            </p>
          </div>
          <div className="no-print flex items-center gap-2">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "chqNo", label: "Cheque No" },
                { key: "chqDate", label: "Cheque Date" },
                { key: "vtype", label: "V.Type" },
                { key: "vno", label: "V.No" },
                { key: "vdate", label: "V.Date" },
                { key: "party", label: "Party" },
                { key: "amount", label: "Amount" },
                { key: "status", label: "Status" },
              ]}
              filename="cheque-status"
            />
            <PrintButton label="Print" />
          </div>
        </div>

        <div className="mb-8 no-print">
          <form method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-3">
              <label className="label block mb-1">Date From</label>
              <input type="date" name="from" className="input-box mono" defaultValue={dateFrom} />
            </div>
            <div className="sm:col-span-3">
              <label className="label block mb-1">Date To</label>
              <input type="date" name="to" className="input-box mono" defaultValue={dateTo} />
            </div>
            <div className="sm:col-span-4">
              <label className="label block mb-1">Status</label>
              <select name="status" className="input-box mono" defaultValue={statusFilter}>
                <option value="">All</option>
                <option value="RECEIVED">RECEIVED</option>
                <option value="ISSUED">ISSUED</option>
                <option value="ENDORSED">ENDORSED</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-sm w-full">View</button>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Total Cheques</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{counts.RECEIVED}</div>
            <div className="stat-label">Received</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{counts.ISSUED}</div>
            <div className="stat-label">Issued</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{counts.ENDORSED}</div>
            <div className="stat-label">Endorsed</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Cheque No</th>
                <th>Cheque Date</th>
                <th>V.Type</th>
                <th>V.No</th>
                <th>Party</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.chqNo}-${r.vtype}-${r.vno}-${i}`}>
                  <td className="mono">{r.chqNo}</td>
                  <td className="mono text-[13px]">{r.chqDate}</td>
                  <td>
                    <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                      {r.vtype}
                    </span>
                  </td>
                  <td className="mono">{r.vno}</td>
                  <td>
                    {r.partyName}
                    {r.partyCode && r.partyCode !== r.partyName ? (
                      <span className="text-[11px] text-[var(--muted)] mono ml-2">({r.partyCode})</span>
                    ) : null}
                  </td>
                  <td className="mono text-right">{fmt(r.amount)}</td>
                  <td>
                    <span
                      className="inline-block text-[11px] px-2 py-0.5 uppercase"
                      style={{
                        letterSpacing: "0.05em",
                        background:
                          r.status === "RECEIVED"
                            ? "black"
                            : r.status === "ENDORSED"
                            ? "var(--warning)"
                            : "transparent",
                        color: r.status === "RECEIVED" || r.status === "ENDORSED" ? "white" : "black",
                        border: "1px solid black",
                      }}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-[var(--muted)] py-6">
                    No cheques found in this date range.
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={5}>Total</td>
                  <td className="mono text-right">{fmt(totalAmount)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
