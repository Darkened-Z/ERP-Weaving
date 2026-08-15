import { db, schema } from "@/db";
import { and, sql, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : new Intl.NumberFormat("en-PK", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function sixMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

export default async function DoNoPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; doNo?: string }>;
}) {
  await requireSession();

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;
  const doNo = params.doNo?.trim() ?? "";

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const conditions = [
    sql`${schema.extYarnPurContractDelivery.deliveryDate} IS NOT NULL`,
    sql`${schema.extYarnPurContractDelivery.deliveryDate} >= ${from}`,
    sql`${schema.extYarnPurContractDelivery.deliveryDate} <= ${to}`,
  ];
  if (doNo) {
    const pat = `%${escLike(doNo)}%`;
    conditions.push(sql`${schema.extYarnPurContractDelivery.doNo} LIKE ${pat} ESCAPE '\\'`);
  }

  const rows = await db
    .select({
      id: schema.extYarnPurContractDelivery.id,
      doNo: schema.extYarnPurContractDelivery.doNo,
      deliveryDate: schema.extYarnPurContractDelivery.deliveryDate,
      bags: schema.extYarnPurContractDelivery.bags,
      location: schema.extYarnPurContractDelivery.ycdDlvLoc,
      contNo: schema.extYarnPurContract.contNo,
      partyCode: schema.extYarnPurContract.partyCode,
      countCode: schema.extYarnPurContract.countCode,
    })
    .from(schema.extYarnPurContractDelivery)
    .innerJoin(
      schema.extYarnPurContract,
      eq(schema.extYarnPurContractDelivery.contractId, schema.extYarnPurContract.id),
    )
    .where(and(...conditions));

  const partyCodes = Array.from(new Set(rows.map((r) => r.partyCode).filter((p): p is string => !!p)));
  const acctMap = new Map<string, string>();
  if (partyCodes.length > 0) {
    const accounts = await db
      .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
      .from(schema.chartOfAccounts);
    for (const a of accounts) acctMap.set(a.code, a.description);
  }

  const sorted = rows.slice().sort((a, b) => {
    const cmp = (a.deliveryDate ?? "").localeCompare(b.deliveryDate ?? "");
    if (cmp !== 0) return cmp;
    return (a.doNo ?? "").localeCompare(b.doNo ?? "");
  });

  const totalBags = sorted.reduce((s, r) => s + (r.bags ?? 0), 0);

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
        table.rp-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        table.rp-table th, table.rp-table td {
          border: 1px solid #000; padding: 5px 8px; font-size: 10.5pt;
          font-family: 'Georgia', 'Times New Roman', serif; text-align: left; vertical-align: top;
        }
        table.rp-table th {
          background: #fff; font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt;
          font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
        }
        table.rp-table td.num, table.rp-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
        table.rp-table tfoot td { font-weight: 700; background: #f0f0f0; }
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

          <div className="rp-title">DO NUMBER LISTING</div>

          <div className="rp-filter">
            Delivery Period: {from} to {to}
            {doNo ? ` · DO No: ${doNo}` : ""}
          </div>

          <table className="rp-table">
            <thead>
              <tr>
                <th style={{ width: "36px" }}>#</th>
                <th>DO #</th>
                <th>Cont No</th>
                <th>Delivery Date</th>
                <th>Party</th>
                <th>Count</th>
                <th className="num">Bags</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="rp-empty">No delivery orders found for the selected period.</td>
                </tr>
              ) : (
                sorted.map((r, i) => {
                  const partyName = r.partyCode ? acctMap.get(r.partyCode) : null;
                  const partyDisplay = r.partyCode
                    ? partyName ? `${r.partyCode} — ${partyName}` : r.partyCode
                    : "—";
                  return (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td>{r.doNo ?? "—"}</td>
                      <td>{r.contNo}</td>
                      <td>{r.deliveryDate ?? "—"}</td>
                      <td>{partyDisplay}</td>
                      <td>{r.countCode ?? "—"}</td>
                      <td className="num">{fmt(r.bags)}</td>
                      <td>{r.location ?? "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: "right" }}>Total Bags</td>
                  <td className="num">{fmt(totalBags)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>

          <div className="rp-signatures">
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Prepared By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Checked By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Approved By</div></div>
          </div>

          <div className="rp-footer">Sourced from purchase contract delivery schedule.</div>
        </div>
      </div>
    </>
  );
}
