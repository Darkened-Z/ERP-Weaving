import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
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

const TITLE = "SALES REGISTER LEDGER";

export default async function SalRegLgrPage({
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
    ...buildTextFilters(f),
  ];

  const grouped = await db
    .select({
      purchaseParty: schema.extGodownStock.purchaseParty,
      records: sql<number>`COUNT(*)`.as("records"),
      totalMeter: sql<number>`COALESCE(SUM(${schema.extGodownStock.meter}), 0)`.as("totalMeter"),
      totalNet: sql<number>`COALESCE(SUM(${schema.extGodownStock.netMeter}), 0)`.as("totalNet"),
      totalValue: sql<number>`COALESCE(SUM(${schema.extGodownStock.total}), 0)`.as("totalValue"),
    })
    .from(schema.extGodownStock)
    .where(and(...conditions))
    .groupBy(schema.extGodownStock.purchaseParty)
    .orderBy(schema.extGodownStock.purchaseParty);

  const totalRecords = grouped.reduce((s, r) => s + Number(r.records ?? 0), 0);
  const totalMeter = grouped.reduce((s, r) => s + Number(r.totalMeter ?? 0), 0);
  const totalNet = grouped.reduce((s, r) => s + Number(r.totalNet ?? 0), 0);
  const totalValue = grouped.reduce((s, r) => s + Number(r.totalValue ?? 0), 0);

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
            <div><span className="fs-label">Parties:</span>{grouped.length}</div>
          </div>

          <table className="rpt-table">
            <thead>
              <tr>
                <th>Purchase Party</th>
                <th className="num" style={{ width: "100px" }}>Records</th>
                <th className="num" style={{ width: "120px" }}>Total Meter</th>
                <th className="num" style={{ width: "120px" }}>Total Net Meter</th>
                <th className="num" style={{ width: "140px" }}>Total Value</th>
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 ? (
                <tr className="empty">
                  <td colSpan={5}>No records found</td>
                </tr>
              ) : (
                grouped.map((r, idx) => (
                  <tr key={`${r.purchaseParty ?? "none"}-${idx}`}>
                    <td>{r.purchaseParty ?? "(No Party)"}</td>
                    <td className="num">{fmt(Number(r.records ?? 0))}</td>
                    <td className="num">{fmt(Number(r.totalMeter ?? 0))}</td>
                    <td className="num">{fmt(Number(r.totalNet ?? 0))}</td>
                    <td className="num">{fmt(Number(r.totalValue ?? 0))}</td>
                  </tr>
                ))
              )}
              {grouped.length > 0 && (
                <tr className="grand-total">
                  <td>GRAND TOTAL</td>
                  <td className="num">{fmt(totalRecords)}</td>
                  <td className="num">{fmt(totalMeter)}</td>
                  <td className="num">{fmt(totalNet)}</td>
                  <td className="num">{fmt(totalValue)}</td>
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
