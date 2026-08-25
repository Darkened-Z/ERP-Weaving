import { db, schema } from "@/db";
import { and, gte, lte } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import {
  fmt,
  fmt2,
  buildTextFilters,
  filterSummary,
  readFilters,
  PRINT_CSS,
  type Filters,
} from "../_print-shared";

export const dynamic = "force-dynamic";

const TITLE = "GREY STOCK LEDGER";

export default async function StockLgrPage({
  searchParams,
}: {
  searchParams: Promise<Partial<Filters>>;
}) {
  await requireSession();

  const f = await readFilters(searchParams);

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const accountRows = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts);
  const partyCodeByDesc = new Map(accountRows.map((r) => [r.description, r.code]));
  const partyLabel = (name: string | null | undefined) => {
    if (!name) return "-";
    const code = partyCodeByDesc.get(name);
    return code ? `${name} (${code})` : name;
  };

  const conditions = [
    gte(schema.extGodownStock.vDate, f.from),
    lte(schema.extGodownStock.vDate, f.to),
    ...buildTextFilters(f),
  ];

  const rows = await db
    .select()
    .from(schema.extGodownStock)
    .where(and(...conditions))
    .orderBy(schema.extGodownStock.vDate, schema.extGodownStock.id);

  let running = 0;
  const enriched = rows.map((r) => {
    running += r.netMeter ?? 0;
    return { ...r, running };
  });

  const totalMeter = rows.reduce((s, r) => s + (r.meter ?? 0), 0);
  const totalNet = rows.reduce((s, r) => s + (r.netMeter ?? 0), 0);
  const totalKaat = rows.reduce((s, r) => s + (r.meter ?? 0) - (r.netMeter ?? 0), 0);
  const totalValue = rows.reduce((s, r) => s + (r.total ?? 0), 0);

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="rpt-wrap">
        <div className="rpt-toolbar no-print">
          <a href="/external/reports/grey-stock" className="btn btn-outline btn-sm">
            Back
          </a>
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
            <div>
              <span className="fs-label">Period:</span>
              {f.from} to {f.to}
            </div>
            <div>
              <span className="fs-label">Filters:</span>
              {filterSummary(f)}
            </div>
            <div>
              <span className="fs-label">Records:</span>
              {rows.length}
            </div>
          </div>

          <table className="rpt-table">
            <thead>
              <tr>
                <th style={{ width: "72px" }}>V.Date</th>
                <th style={{ width: "72px" }}>V.No</th>
                <th style={{ width: "60px" }}>KP No</th>
                <th>Purchase Party</th>
                <th>Gdn Party</th>
                <th className="num" style={{ width: "60px" }}>Meter</th>
                <th className="num" style={{ width: "60px" }}>Net Meter</th>
                <th className="num" style={{ width: "50px" }}>Kaat %</th>
                <th className="num" style={{ width: "72px" }}>Total</th>
                <th className="num" style={{ width: "72px" }}>Running Bal</th>
              </tr>
            </thead>
            <tbody>
              {enriched.length === 0 ? (
                <tr className="empty">
                  <td colSpan={10}>No records found</td>
                </tr>
              ) : (
                enriched.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.vDate}</td>
                    <td className="mono">{r.vNo}</td>
                    <td className="mono">{r.kpNo ?? "-"}</td>
                    <td>{partyLabel(r.purchaseParty)}</td>
                    <td>{partyLabel(r.gdnParty)}</td>
                    <td className="num">{r.meter != null ? fmt(r.meter) : "-"}</td>
                    <td className="num">{r.netMeter != null ? fmt(r.netMeter) : "-"}</td>
                    <td className="num">{r.kaatPercent != null ? fmt2(r.kaatPercent) : "-"}</td>
                    <td className="num">{r.total != null ? fmt(r.total) : "-"}</td>
                    <td className="num">{fmt(r.running)}</td>
                  </tr>
                ))
              )}
              {enriched.length > 0 && (
                <tr className="grand-total">
                  <td colSpan={5}>GRAND TOTAL</td>
                  <td className="num">{fmt(totalMeter)}</td>
                  <td className="num">{fmt(totalNet)}</td>
                  <td className="num">{fmt(totalKaat)}</td>
                  <td className="num">{fmt(totalValue)}</td>
                  <td className="num">{fmt(running)}</td>
                </tr>
              )}
            </tbody>
          </table>

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
              <div className="sig-label">Approved By</div>
            </div>
          </div>

          <div className="footer">Computer generated report — {new Date().toLocaleString("en-PK")}</div>
        </div>
      </div>
    </>
  );
}
