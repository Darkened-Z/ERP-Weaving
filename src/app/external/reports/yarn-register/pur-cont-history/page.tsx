import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : new Intl.NumberFormat("en-PK", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

export default async function PurContHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ contNo?: string }>;
}) {
  await requireSession();

  const params = await searchParams;
  const contNo = params.contNo?.trim() ?? "";

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const contract = contNo
    ? (await db
        .select()
        .from(schema.extYarnPurContract)
        .where(eq(schema.extYarnPurContract.contNo, contNo))
        .limit(1))[0]
    : null;

  const deliveries = contract
    ? await db
        .select()
        .from(schema.extYarnPurContractDelivery)
        .where(eq(schema.extYarnPurContractDelivery.contractId, contract.id))
    : [];

  let partyName: string | null = null;
  if (contract?.partyCode) {
    const [acc] = await db
      .select({ description: schema.chartOfAccounts.description })
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.code, contract.partyCode))
      .limit(1);
    partyName = acc?.description ?? null;
  }

  let brokerName: string | null = null;
  if (contract?.broker) {
    const [acc] = await db
      .select({ description: schema.chartOfAccounts.description })
      .from(schema.chartOfAccounts)
      .where(eq(schema.chartOfAccounts.code, contract.broker))
      .limit(1);
    brokerName = acc?.description ?? null;
  }

  const totalDelBags = deliveries.reduce((s, d) => s + (d.bags ?? 0), 0);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .rp-wrap { padding: 0 !important; background: #fff !important; }
          .rp-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
        }
        .rp-wrap { background: #f5f5f5; min-height: 100vh; padding: 24px 16px; }
        .rp-toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; justify-content: space-between; gap: 12px; }
        .rp-page {
          background: #fff; color: #000; max-width: 210mm; margin: 0 auto;
          padding: 20mm 18mm; border: 1px solid #000;
          font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; line-height: 1.45;
        }
        .rp-company { text-align: center; }
        .rp-company .name { font-size: 22pt; font-weight: 700; letter-spacing: 0.02em; }
        .rp-company .meta { font-size: 10pt; margin-top: 3px; }
        .rp-title {
          text-align: center; font-size: 16pt; font-weight: 700; letter-spacing: 0.24em;
          margin: 14px 0 12px; padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000;
        }
        .rp-filter {
          font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt; letter-spacing: 0.06em;
          text-transform: uppercase; text-align: center; margin-bottom: 14px; color: #333;
        }
        .rp-section-title {
          font-family: 'Helvetica', Arial, sans-serif; font-size: 9.5pt;
          font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
          border-bottom: 1px solid #000; padding-bottom: 4px; margin: 16px 0 8px;
        }
        .rp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
        .rp-row { display: flex; gap: 8px; border-bottom: 1px dotted #000; padding: 3px 0; font-size: 10.5pt; }
        .rp-key { font-family: 'Helvetica', Arial, sans-serif; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; min-width: 120px; }
        .rp-val { flex: 1; font-weight: 600; }
        table.rp-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        table.rp-table th, table.rp-table td {
          border: 1px solid #000; padding: 6px 8px; font-size: 10.5pt;
          font-family: 'Georgia', 'Times New Roman', serif; text-align: left; vertical-align: top;
        }
        table.rp-table th {
          background: #fff; font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt;
          font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
        }
        table.rp-table td.num, table.rp-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
        table.rp-table tfoot td { font-weight: 700; }
        .rp-signatures { margin-top: 42px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
        .rp-sig { text-align: center; }
        .rp-sig-line { border-top: 1px solid #000; margin-bottom: 6px; height: 32px; }
        .rp-sig-label { font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
        .rp-footer { margin-top: 22px; font-size: 8.5pt; text-align: center; color: #333; letter-spacing: 0.05em; }
        .rp-empty { text-align: center; padding: 24px 0; font-style: italic; color: #555; }
      `}</style>

      <div className="rp-wrap">
        <div className="rp-toolbar no-print">
          <a href="/external/reports/yarn-register" className="btn btn-outline btn-sm">Back</a>
          <PrintButton label="Print" />
        </div>

        <div className="rp-page">
          <div className="rp-company">
            <div className="name">{company?.name ?? "Company Name"}</div>
            <div className="meta">
              {[company?.address, company?.city].filter(Boolean).join(", ") || "Address"}
              {company?.phone ? ` — Phone: ${company.phone}` : ""}
            </div>
          </div>

          <div className="rp-title">PURCHASE CONTRACT HISTORY</div>

          <div className="rp-filter">
            Contract # {contNo || "(not specified)"}
          </div>

          {!contract ? (
            <div className="rp-empty">No contract found for Cont # {contNo || "—"}.</div>
          ) : (
            <>
              <div className="rp-section-title">Contract Header</div>
              <div className="rp-grid">
                <div className="rp-row"><span className="rp-key">Cont No</span><span className="rp-val">{contract.contNo}</span></div>
                <div className="rp-row"><span className="rp-key">Cont Date</span><span className="rp-val">{contract.contDate}</span></div>
                <div className="rp-row"><span className="rp-key">Party</span><span className="rp-val">{partyName ? `${contract.partyCode} — ${partyName}` : contract.partyCode ?? "—"}</span></div>
                <div className="rp-row"><span className="rp-key">Broker</span><span className="rp-val">{brokerName ? `${contract.broker} — ${brokerName}` : contract.broker ?? "—"}</span></div>
                <div className="rp-row"><span className="rp-key">Count Code</span><span className="rp-val">{contract.countCode ?? "—"}</span></div>
                <div className="rp-row"><span className="rp-key">Brand</span><span className="rp-val">{contract.brand ?? "—"}</span></div>
                <div className="rp-row"><span className="rp-key">Ratio</span><span className="rp-val">{contract.ratio ?? "—"}</span></div>
                <div className="rp-row"><span className="rp-key">Qty Bags</span><span className="rp-val">{fmt(contract.qtyBags)}</span></div>
                <div className="rp-row"><span className="rp-key">Rate/Lbs</span><span className="rp-val">{fmt(contract.ratePerLbs, 2)}</span></div>
                <div className="rp-row"><span className="rp-key">Amount</span><span className="rp-val">{fmt(contract.amount)}</span></div>
                <div className="rp-row"><span className="rp-key">Days</span><span className="rp-val">{fmt(contract.days)}</span></div>
                <div className="rp-row"><span className="rp-key">%age</span><span className="rp-val">{contract.agePercent != null ? `${fmt(contract.agePercent, 2)}%` : "—"}</span></div>
                <div className="rp-row"><span className="rp-key">Brokage/Bag</span><span className="rp-val">{fmt(contract.brokagePerBag, 2)}</span></div>
                <div className="rp-row"><span className="rp-key">Status</span><span className="rp-val">{contract.status}</span></div>
                <div className="rp-row"><span className="rp-key">Ref No</span><span className="rp-val">{contract.refno ?? "—"}</span></div>
                <div className="rp-row"><span className="rp-key">Exp Date</span><span className="rp-val">{contract.expdDate ?? "—"}</span></div>
                <div className="rp-row" style={{ gridColumn: "1 / -1" }}>
                  <span className="rp-key">Remarks</span>
                  <span className="rp-val">{contract.remarks ?? "—"}</span>
                </div>
              </div>

              <div className="rp-section-title">Delivery Schedule</div>
              <table className="rp-table">
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}>#</th>
                    <th>Delivery Date</th>
                    <th>DO #</th>
                    <th className="num">Bags</th>
                    <th>Ycd Dlv Loc</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.length === 0 ? (
                    <tr><td colSpan={5} className="rp-empty">No deliveries scheduled.</td></tr>
                  ) : (
                    deliveries.map((d, i) => (
                      <tr key={d.id}>
                        <td>{i + 1}</td>
                        <td>{d.deliveryDate ?? "—"}</td>
                        <td>{d.doNo ?? "—"}</td>
                        <td className="num">{fmt(d.bags)}</td>
                        <td>{d.ycdDlvLoc ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {deliveries.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ textAlign: "right" }}>Total Bags</td>
                      <td className="num">{fmt(totalDelBags)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </>
          )}

          <div className="rp-signatures">
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Prepared By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Checked By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Approved By</div></div>
          </div>

          <div className="rp-footer">Computer generated purchase contract history.</div>
        </div>
      </div>
    </>
  );
}
