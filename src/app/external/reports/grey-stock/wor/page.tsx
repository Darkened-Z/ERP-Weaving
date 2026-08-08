import { db, schema } from "@/db";
import { and, gte, lte, gt } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import {
  fmt,
  buildTextFilters,
  filterSummary,
  readFilters,
  PRINT_CSS,
  type Filters,
} from "../_print-shared";

export const dynamic = "force-dynamic";

const TITLE = "WORK ORDER REPORT (WOR)";

export default async function WorPage({
  searchParams,
}: {
  searchParams: Promise<Partial<Filters>>;
}) {
  await requireSession();

  const f = await readFilters(searchParams);
  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const conditions = [
    gte(schema.extGodownStock.vDate, f.from),
    lte(schema.extGodownStock.vDate, f.to),
    gt(schema.extGodownStock.balance, 0),
    ...buildTextFilters(f),
  ];

  const rows = await db
    .select()
    .from(schema.extGodownStock)
    .where(and(...conditions))
    .orderBy(schema.extGodownStock.vDate, schema.extGodownStock.id);

  const totalMeter = rows.reduce((s, r) => s + (r.meter ?? 0), 0);
  const totalNet = rows.reduce((s, r) => s + (r.netMeter ?? 0), 0);
  const totalBalance = rows.reduce((s, r) => s + (r.balance ?? 0), 0);

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="rpt-wrap">
        <div className="rpt-toolbar no-print">
          <a href="/external/reports/grey-stock" className="btn btn-outline btn-sm">Back</a>
          <div className="rpt-title-strip">
            <div className="rpt-title-strip-title">{TITLE}</div>
            <PrintButton label="Print Report" size="lg" />
          </div>
        </div>

        <div className="rpt-page">
          <div className="rpt-header">
            <div className="company-name">{company?.name ?? "SK WEAVING MILLS"}</div>
            {company?.address ? <div className="company-addr">{company.address}{company.city ? `, ${company.city}` : ""}</div> : null}
            {company?.phone ? <div className="company-contact">Phone: {company.phone}</div> : null}
          </div>

          <h2 className="report-title">{TITLE}</h2>

          <div className="filter-summary">
            <div><span className="fs-label">Period:</span>{f.from} to {f.to}</div>
            <div><span className="fs-label">Filters:</span>{filterSummary(f)}</div>
            <div><span className="fs-label">Pending:</span>{rows.length}</div>
          </div>

          <table className="rpt-table">
            <thead>
              <tr>
                <th style={{ width: "80px" }}>V.Date</th>
                <th style={{ width: "80px" }}>V.No</th>
                <th>Purchase Party</th>
                <th>Gdn Party</th>
                <th style={{ width: "110px" }}>Dsp Quality</th>
                <th className="num" style={{ width: "70px" }}>Meter</th>
                <th className="num" style={{ width: "70px" }}>Net Meter</th>
                <th className="num" style={{ width: "80px" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="empty">
                  <td colSpan={8}>No pending work orders</td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.vDate}</td>
                    <td className="mono">{r.vNo}</td>
                    <td>{r.purchaseParty ?? "-"}</td>
                    <td>{r.gdnParty ?? "-"}</td>
                    <td>{r.dspQuality ?? "-"}</td>
                    <td className="num">{r.meter != null ? fmt(r.meter) : "-"}</td>
                    <td className="num">{r.netMeter != null ? fmt(r.netMeter) : "-"}</td>
                    <td className="num">{r.balance != null ? fmt(r.balance) : "-"}</td>
                  </tr>
                ))
              )}
              {rows.length > 0 && (
                <tr className="grand-total">
                  <td colSpan={5}>GRAND TOTAL</td>
                  <td className="num">{fmt(totalMeter)}</td>
                  <td className="num">{fmt(totalNet)}</td>
                  <td className="num">{fmt(totalBalance)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="signatures">
            <div className="sig"><div className="sig-line" /><div className="sig-label">Prepared By</div></div>
            <div className="sig"><div className="sig-line" /><div className="sig-label">Checked By</div></div>
            <div className="sig"><div className="sig-line" /><div className="sig-label">Approved By</div></div>
          </div>

          <div className="footer">Computer generated report — {new Date().toLocaleString("en-PK")}</div>
        </div>
      </div>
    </>
  );
}
