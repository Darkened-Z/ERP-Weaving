import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function GPVPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; n?: string; fy?: string }>;
}) {
  await requireSession();
  const params = await searchParams;

  const vtype = params.v?.trim().toUpperCase() || "";
  const vno = Number(params.n);
  const fyParam = params.fy?.trim() || "";

  if (!vtype || !Number.isFinite(vno)) {
    const voucherTypes = await db
      .select()
      .from(schema.voucherTypes)
      .orderBy(schema.voucherTypes.sortOrder);
    const recent = await db
      .select({
        vtype: schema.transMain.vtype,
        vno: schema.transMain.vno,
        vdate: schema.transMain.vdate,
        narration: schema.transMain.narration,
        fyCode: schema.transMain.fyCode,
      })
      .from(schema.transMain)
      .orderBy(sql`vdate DESC, vtype, vno DESC`)
      .limit(40);

    return (
      <Shell active="fin-gpv">
        <div className="animate-in">
          <div className="mb-8">
            <h1 className="page-title">Print Voucher (GPV)</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Select a voucher below or pass <span className="mono">?v=VTYPE&amp;n=VNO</span> in the URL.
            </p>
          </div>

          <form method="GET" className="mb-8 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4">
              <label className="label block mb-1">V.Type</label>
              <select name="v" className="input-box mono">
                <option value="">-- select --</option>
                {voucherTypes.map((vt) => (
                  <option key={vt.vtype} value={vt.vtype}>
                    {vt.vtype} — {vt.description}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <label className="label block mb-1">V.No</label>
              <input type="number" name="n" className="input-box mono" placeholder="123" />
            </div>
            <div className="sm:col-span-3">
              <label className="label block mb-1">FY (optional)</label>
              <input type="text" name="fy" className="input-box mono" placeholder="2024-25" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-sm w-full">Open</button>
            </div>
          </form>

          <div className="section-title">Recent Vouchers</div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>V.No</th>
                  <th>Narration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={`${r.fyCode}-${r.vtype}-${r.vno}`}>
                    <td className="mono text-[13px]">{r.vdate}</td>
                    <td>
                      <span className="inline-block border border-black px-2 py-0.5 text-[11px] font-bold uppercase">
                        {r.vtype}
                      </span>
                    </td>
                    <td className="mono">{r.vno}</td>
                    <td className="text-[13px]">{r.narration}</td>
                    <td>
                      <Link
                        href={`/reports/gpv?v=${r.vtype}&n=${r.vno}&fy=${encodeURIComponent(r.fyCode)}`}
                        className="btn btn-outline btn-sm"
                      >
                        Print
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Shell>
    );
  }

  const headConds = [eq(schema.transMain.vtype, vtype), eq(schema.transMain.vno, vno)];
  if (fyParam) headConds.push(eq(schema.transMain.fyCode, fyParam));
  const [head] = await db
    .select()
    .from(schema.transMain)
    .where(and(...headConds))
    .limit(1);

  if (!head) {
    return (
      <Shell active="fin-gpv">
        <div className="animate-in">
          <h1 className="page-title">Voucher not found</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2 mb-4">
            {vtype} #{vno}{fyParam ? ` in FY ${fyParam}` : ""}
          </p>
          <Link href="/reports/gpv" className="btn btn-outline btn-sm">Back to list</Link>
        </div>
      </Shell>
    );
  }

  const lines = await db
    .select()
    .from(schema.transDetail)
    .where(
      and(
        eq(schema.transDetail.fyCode, head.fyCode),
        eq(schema.transDetail.vtype, head.vtype),
        eq(schema.transDetail.vno, head.vno),
      ),
    )
    .orderBy(schema.transDetail.srno);

  const accounts = await db.select().from(schema.chartOfAccounts);
  const accMap = new Map(accounts.map((a) => [a.code, a.description ?? ""]));
  const [company] = await db.select().from(schema.companyProfile).limit(1);
  const [vt] = await db
    .select()
    .from(schema.voucherTypes)
    .where(eq(schema.voucherTypes.vtype, head.vtype))
    .limit(1);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

  const totalDr = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCr = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  const blankRows = Math.max(0, 4 - lines.length);

  const headParty = head.accCode ? accMap.get(head.accCode) ?? head.accCode : "—";
  const docTitle = `${vt?.description ?? head.vtype} VOUCHER`;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .gpv-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
          }
          .gpv-wrap { padding: 0 !important; background: #fff !important; }
        }
        .gpv-wrap {
          background: #f5f5f5;
          min-height: 100vh;
          padding: 32px 16px;
        }
        .gpv-toolbar {
          max-width: 210mm;
          margin: 0 auto 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .gpv-page {
          background: #fff;
          color: #000;
          max-width: 210mm;
          margin: 0 auto;
          padding: 22mm 18mm;
          border: 1px solid #000;
          font-family: 'Georgia', 'Times New Roman', serif;
          font-size: 12pt;
          line-height: 1.45;
        }
        .gpv-page .company-name {
          font-size: 26pt;
          font-weight: 700;
          letter-spacing: 0.02em;
          margin: 0;
          text-align: center;
        }
        .gpv-page .company-meta {
          text-align: center;
          font-size: 10pt;
          margin-top: 4px;
          line-height: 1.4;
        }
        .gpv-page .doc-title {
          text-align: center;
          font-size: 18pt;
          font-weight: 700;
          letter-spacing: 0.28em;
          margin: 12px 0 18px;
          padding: 6px 0;
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
        }
        .gpv-page .meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 32px;
          margin-bottom: 16px;
          font-size: 11pt;
        }
        .gpv-page .meta-row {
          display: flex;
          gap: 8px;
          border-bottom: 1px dotted #000;
          padding: 3px 0;
        }
        .gpv-page .meta-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 8.5pt;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          min-width: 92px;
        }
        .gpv-page .meta-value {
          flex: 1;
          font-weight: 600;
        }
        .gpv-page .party-block {
          border: 1px solid #000;
          padding: 10px 14px;
          margin: 14px 0 18px;
        }
        .gpv-page .party-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 8.5pt;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .gpv-page .party-name {
          font-size: 16pt;
          font-weight: 700;
          margin-top: 2px;
        }
        .gpv-page table.items {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
        }
        .gpv-page table.items th,
        .gpv-page table.items td {
          border: 1px solid #000;
          padding: 10px 10px;
          font-size: 11pt;
          text-align: left;
          vertical-align: top;
        }
        .gpv-page table.items th {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 9pt;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .gpv-page table.items th.num,
        .gpv-page table.items td.num {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .gpv-page table.items td.sr {
          text-align: center;
          width: 32px;
        }
        .gpv-page table.items tr.blank td {
          height: 26px;
          color: transparent;
        }
        .gpv-page .totals {
          display: flex;
          justify-content: flex-end;
          gap: 40px;
          margin-top: 12px;
          padding: 8px 10px;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          font-size: 11pt;
        }
        .gpv-page .total-item {
          display: flex;
          gap: 10px;
          align-items: baseline;
        }
        .gpv-page .total-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 9pt;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .gpv-page .total-value {
          font-weight: 700;
          font-size: 13pt;
          font-variant-numeric: tabular-nums;
        }
        .gpv-page .notes {
          margin-top: 22px;
          font-size: 9.5pt;
          border: 1px solid #000;
          padding: 8px 12px;
          min-height: 52px;
        }
        .gpv-page .notes-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 8.5pt;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .gpv-page .signatures {
          margin-top: 42px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 24px;
        }
        .gpv-page .sig-line {
          border-top: 1px solid #000;
          margin-bottom: 6px;
          height: 32px;
        }
        .gpv-page .sig-label {
          font-family: 'Helvetica', Arial, sans-serif;
          font-size: 9pt;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          text-align: center;
        }
        .gpv-page .footer {
          margin-top: 26px;
          font-size: 8.5pt;
          text-align: center;
          color: #333;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="gpv-wrap">
        <div className="gpv-toolbar no-print">
          <Link href="/reports/gpv" className="btn btn-outline btn-sm">Back</Link>
          <PrintButton label="Print Voucher" />
        </div>

        <div className="gpv-page">
          <div className="company-name">{company?.name ?? "Company Name"}</div>
          <div className="company-meta">
            {[company?.address, company?.city].filter(Boolean).join(", ")}
            {company?.phone ? ` — Phone: ${company.phone}` : ""}
          </div>

          <div className="doc-title">{docTitle}</div>

          <div className="meta-grid">
            <div className="meta-row">
              <span className="meta-label">Voucher No</span>
              <span className="meta-value">{head.vtype}-{head.vno}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Date</span>
              <span className="meta-value">{head.vdate}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">FY</span>
              <span className="meta-value">{head.fyCode}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Term</span>
              <span className="meta-value">{head.term ?? "—"}</span>
            </div>
            {head.dueDate ? (
              <div className="meta-row">
                <span className="meta-label">Due Date</span>
                <span className="meta-value">{head.dueDate}</span>
              </div>
            ) : null}
            {head.trnType ? (
              <div className="meta-row">
                <span className="meta-label">Trn Type</span>
                <span className="meta-value">{head.trnType}</span>
              </div>
            ) : null}
          </div>

          {headParty && headParty !== "—" ? (
            <div className="party-block">
              <div className="party-label">Party / Head A/c</div>
              <div className="party-name">{headParty}</div>
              {head.accCode ? (
                <div style={{ fontSize: "10pt", marginTop: 4 }}>Code: {head.accCode}</div>
              ) : null}
            </div>
          ) : null}

          <table className="items">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th style={{ width: 130 }}>Account</th>
                <th>Description</th>
                <th>Narration</th>
                <th className="num" style={{ width: 110 }}>Debit</th>
                <th className="num" style={{ width: 110 }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="sr">{l.srno}</td>
                  <td style={{ fontFamily: "monospace" }}>{l.accCode}</td>
                  <td>{accMap.get(l.accCode) ?? "—"}</td>
                  <td>{l.narration ?? ""}</td>
                  <td className="num">{(l.debit ?? 0) > 0 ? formatNum(l.debit ?? 0) : "—"}</td>
                  <td className="num">{(l.credit ?? 0) > 0 ? formatNum(l.credit ?? 0) : "—"}</td>
                </tr>
              ))}
              {Array.from({ length: blankRows }).map((_, i) => (
                <tr className="blank" key={`blank-${i}`}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j}>.</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals">
            <div className="total-item">
              <span className="total-label">Total Debit</span>
              <span className="total-value">{formatNum(totalDr)}</span>
            </div>
            <div className="total-item">
              <span className="total-label">Total Credit</span>
              <span className="total-value">{formatNum(totalCr)}</span>
            </div>
          </div>

          <div className="notes">
            <div className="notes-label">Narration</div>
            {head.narration ? <div style={{ marginTop: 4, fontSize: "10.5pt" }}>{head.narration}</div> : null}
          </div>

          <div className="signatures">
            <div>
              <div className="sig-line" />
              <div className="sig-label">Prepared By</div>
            </div>
            <div>
              <div className="sig-line" />
              <div className="sig-label">Checked By</div>
            </div>
            <div>
              <div className="sig-line" />
              <div className="sig-label">Authorized By</div>
            </div>
          </div>

          <div className="footer">This is a computer generated voucher.</div>
        </div>
      </div>
    </>
  );
}
