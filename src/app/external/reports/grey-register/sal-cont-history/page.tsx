import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { today as todayFn, toKarachiDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function fmtKarachi(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : toKarachiDate(d);
}

export default async function SalContHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ contNo?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const contNo = params.contNo?.trim() ?? "";
  const today = todayFn();

  const companyRows = await db.select().from(schema.companyProfile).limit(1);
  const company = companyRows[0];

  let contract: typeof schema.extGreySalContract.$inferSelect | null = null;
  let deliveries: (typeof schema.extGreySalContractDelivery.$inferSelect)[] = [];

  if (contNo) {
    const rows = await db
      .select()
      .from(schema.extGreySalContract)
      .where(eq(schema.extGreySalContract.contractNo, contNo))
      .limit(1);
    contract = rows[0] ?? null;
    if (contract) {
      deliveries = await db
        .select()
        .from(schema.extGreySalContractDelivery)
        .where(eq(schema.extGreySalContractDelivery.contractId, contract.id));
    }
  }

  const totalDelMtr = deliveries.reduce((s, d) => s + (d.meters ?? 0), 0);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .rpt-wrap { padding: 0 !important; background: #fff !important; }
          .rpt-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
        }
        .rpt-wrap { background: #f5f5f5; min-height: 100vh; padding: 32px 16px; }
        .rpt-toolbar {
          max-width: 210mm; margin: 0 auto 20px;
          display: flex; justify-content: space-between; align-items: center; gap: 12px;
          padding: 12px 16px; border: 1px solid #000; background: #fff;
        }
        .rpt-toolbar-title {
          font-family: 'Georgia','Times New Roman',serif;
          font-size: 18pt; font-weight: 700; letter-spacing: 0.08em;
        }
        .rpt-page {
          background: #fff; color: #000; max-width: 210mm; margin: 0 auto;
          padding: 22mm 18mm; border: 1px solid #000;
          font-family: 'Georgia','Times New Roman',serif; font-size: 11pt; line-height: 1.45;
        }
        .rpt-page .company-name { font-size: 24pt; font-weight: 700; text-align: center; margin: 0; letter-spacing: 0.02em; }
        .rpt-page .company-meta { text-align: center; font-size: 10pt; margin-top: 4px; }
        .rpt-page .doc-title {
          text-align: center; font-size: 15pt; font-weight: 700;
          letter-spacing: 0.24em; margin: 12px 0 12px;
          padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000;
        }
        .rpt-page .section-title {
          font-family: 'Helvetica',Arial,sans-serif;
          font-size: 9pt; font-weight: 700; letter-spacing: 0.14em;
          text-transform: uppercase; margin: 18px 0 6px; padding-bottom: 3px;
          border-bottom: 1px solid #000;
        }
        .rpt-page .info-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 4px 32px; font-size: 10.5pt;
        }
        .rpt-page .info-row { display: flex; gap: 8px; border-bottom: 1px dotted #000; padding: 3px 0; }
        .rpt-page .info-label {
          font-family: 'Helvetica',Arial,sans-serif; font-size: 8.5pt; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase; min-width: 130px;
        }
        .rpt-page .info-value { flex: 1; font-weight: 600; }
        .rpt-page table.items { width: 100%; border-collapse: collapse; margin-top: 6px; }
        .rpt-page table.items th, .rpt-page table.items td {
          border: 1px solid #000; padding: 6px 8px; font-size: 10pt;
          font-family: 'Georgia','Times New Roman',serif; text-align: left; vertical-align: top;
        }
        .rpt-page table.items th {
          background: #fff; font-family: 'Helvetica',Arial,sans-serif;
          font-size: 8.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
        }
        .rpt-page table.items td.num, .rpt-page table.items th.num {
          text-align: right; font-variant-numeric: tabular-nums;
        }
        .rpt-page table.items tfoot td {
          font-weight: 700; border-top: 2px solid #000; font-size: 10.5pt;
        }
        .rpt-page .remarks-box { border: 1px solid #000; padding: 8px 12px; min-height: 40px; margin-top: 6px; font-size: 10pt; }
        .rpt-page .signatures { margin-top: 42px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
        .rpt-page .sig { text-align: center; }
        .rpt-page .sig-line { border-top: 1px solid #000; margin-bottom: 6px; height: 32px; }
        .rpt-page .sig-label {
          font-family: 'Helvetica',Arial,sans-serif; font-size: 9pt; font-weight: 700;
          letter-spacing: 0.14em; text-transform: uppercase;
        }
        .rpt-page .footer { margin-top: 26px; font-size: 8.5pt; text-align: center; color: #333; letter-spacing: 0.05em; }
      `}</style>

      <div className="rpt-wrap">
        <div className="rpt-toolbar no-print">
          <div className="rpt-toolbar-title">SALES CONTRACT HISTORY</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <a href="/external/reports/grey-register" className="btn btn-outline btn-sm">Back</a>
            <PrintButton label="Print History" />
          </div>
        </div>

        <div className="rpt-page">
          <div className="company-name">{company?.name ?? "Company Name"}</div>
          <div className="company-meta">
            {[company?.address, company?.city].filter(Boolean).join(", ") || "Address"}
            {company?.phone ? ` — Phone: ${company.phone}` : ""}
          </div>

          <div className="doc-title">SALES CONTRACT HISTORY</div>

          {!contNo ? (
            <div style={{ padding: "24px", textAlign: "center" }}>
              No contract number provided.
            </div>
          ) : !contract ? (
            <div style={{ padding: "24px", textAlign: "center" }}>
              Contract <strong>{contNo}</strong> not found.
            </div>
          ) : (
            <>
              <div className="section-title">Contract Header</div>
              <div className="info-grid">
                <div className="info-row">
                  <span className="info-label">Contract No</span>
                  <span className="info-value">{contract.contractNo}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Contract Date</span>
                  <span className="info-value">{contract.contractDate}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">L. Cont. No</span>
                  <span className="info-value">{contract.lContNo ?? "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Exp Date</span>
                  <span className="info-value">{contract.expDate ?? "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Party Ref No</span>
                  <span className="info-value">{contract.partyRefNo ?? "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Status</span>
                  <span className="info-value">{contract.status}</span>
                </div>
                <div className="info-row" style={{ gridColumn: "1 / -1" }}>
                  <span className="info-label">Party</span>
                  <span className="info-value">{contract.party ?? "-"}</span>
                </div>
                <div className="info-row" style={{ gridColumn: "1 / -1" }}>
                  <span className="info-label">Broker</span>
                  <span className="info-value">
                    {contract.broker ?? "-"}
                    {contract.brokagPerBag != null ? ` (${fmt2(contract.brokagPerBag)}/bag)` : ""}
                  </span>
                </div>
                <div className="info-row">
                  <span className="info-label">Grey Code</span>
                  <span className="info-value">{contract.greyCode ?? "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Weave</span>
                  <span className="info-value">{contract.weave ?? "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Salvage</span>
                  <span className="info-value">{contract.salvage ?? "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Per Mtr</span>
                  <span className="info-value">{contract.perMtr != null ? fmt2(contract.perMtr) : "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Quantity Mtr</span>
                  <span className="info-value">{contract.quantityMtr != null ? fmt(contract.quantityMtr) : "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Rate / Mtr</span>
                  <span className="info-value">{contract.ratePerMtr != null ? fmt2(contract.ratePerMtr) : "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Amount</span>
                  <span className="info-value">Rs {contract.amount != null ? fmt(contract.amount) : "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Days</span>
                  <span className="info-value">{contract.days ?? "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">GST Rate</span>
                  <span className="info-value">{contract.gstRate != null ? `${fmt2(contract.gstRate)}%` : "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Ext Mtr</span>
                  <span className="info-value">{contract.extMtr != null ? fmt(contract.extMtr) : "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Ext Date</span>
                  <span className="info-value">{contract.extDate ?? "-"}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Posted Date</span>
                  <span className="info-value">{fmtKarachi(contract.postedDate)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Modified Date</span>
                  <span className="info-value">{fmtKarachi(contract.modifiedDate)}</span>
                </div>
                <div className="info-row" style={{ gridColumn: "1 / -1" }}>
                  <span className="info-label">Payment Term</span>
                  <span className="info-value">{contract.paymentTerm ?? "-"}</span>
                </div>
                <div className="info-row" style={{ gridColumn: "1 / -1" }}>
                  <span className="info-label">Delivery Term</span>
                  <span className="info-value">{contract.deliveryTerm ?? "-"}</span>
                </div>
                <div className="info-row" style={{ gridColumn: "1 / -1" }}>
                  <span className="info-label">Special Inst.</span>
                  <span className="info-value">{contract.specialInst ?? "-"}</span>
                </div>
              </div>

              <div className="section-title">Remarks</div>
              <div className="remarks-box">{contract.remarks ?? ""}</div>

              <div className="section-title">Delivery Schedule</div>
              <table className="items">
                <thead>
                  <tr>
                    <th style={{ width: "48px" }}>#</th>
                    <th style={{ width: "140px" }}>Delivery Date</th>
                    <th className="num" style={{ width: "140px" }}>Meters</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center" }}>No delivery schedule</td>
                    </tr>
                  ) : (
                    deliveries.map((d, i) => (
                      <tr key={d.id}>
                        <td>{i + 1}</td>
                        <td>{d.deliveryDate ?? "-"}</td>
                        <td className="num">{d.meters != null ? fmt(d.meters) : "-"}</td>
                        <td>{d.location ?? "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {deliveries.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2} style={{ textAlign: "right" }}>TOTAL</td>
                      <td className="num">{fmt(totalDelMtr)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </>
          )}

          <div className="signatures">
            <div className="sig">
              <div className="sig-line" />
              <div className="sig-label">Prepared By</div>
            </div>
            <div className="sig">
              <div className="sig-line" />
              <div className="sig-label">Checked By</div>
            </div>
            <div className="sig">
              <div className="sig-line" />
              <div className="sig-label">Received By</div>
            </div>
          </div>

          <div className="footer">
            This is a computer generated report. Printed: {today}.
          </div>
        </div>
      </div>
    </>
  );
}
