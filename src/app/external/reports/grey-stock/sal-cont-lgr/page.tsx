import { Fragment } from "react";
import { db, schema } from "@/db";
import { and, gte, lte, isNotNull } from "drizzle-orm";
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

const TITLE = "SAL CONT LEDGER";

type Row = {
  id: number;
  vNo: string;
  vDate: string;
  purchaseParty: string | null;
  salContNo: string | null;
  meter: number | null;
  netMeter: number | null;
  total: number | null;
};

export default async function SalContLgrPage({
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
    isNotNull(schema.extGodownStock.salContNo),
    ...buildTextFilters(f),
  ];

  const rows = (await db
    .select({
      id: schema.extGodownStock.id,
      vNo: schema.extGodownStock.vNo,
      vDate: schema.extGodownStock.vDate,
      purchaseParty: schema.extGodownStock.purchaseParty,
      salContNo: schema.extGodownStock.salContNo,
      meter: schema.extGodownStock.meter,
      netMeter: schema.extGodownStock.netMeter,
      total: schema.extGodownStock.total,
    })
    .from(schema.extGodownStock)
    .where(and(...conditions))
    .orderBy(schema.extGodownStock.salContNo, schema.extGodownStock.vDate)) as Row[];

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.salContNo ?? "(No Sal Cont)";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const totalMeter = rows.reduce((s, r) => s + (r.meter ?? 0), 0);
  const totalNet = rows.reduce((s, r) => s + (r.netMeter ?? 0), 0);
  const totalValue = rows.reduce((s, r) => s + (r.total ?? 0), 0);

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
            <div><span className="fs-label">Records:</span>{rows.length}</div>
          </div>

          <table className="rpt-table">
            <thead>
              <tr>
                <th style={{ width: "110px" }}>Sal Cont #</th>
                <th style={{ width: "90px" }}>V.Date</th>
                <th style={{ width: "90px" }}>V.No</th>
                <th>Purchase Party</th>
                <th className="num" style={{ width: "80px" }}>Meter</th>
                <th className="num" style={{ width: "80px" }}>Net Meter</th>
                <th className="num" style={{ width: "90px" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="empty">
                  <td colSpan={7}>No records found</td>
                </tr>
              ) : (
                Array.from(groups.entries()).map(([sc, gRows]) => {
                  const sMeter = gRows.reduce((s, r) => s + (r.meter ?? 0), 0);
                  const sNet = gRows.reduce((s, r) => s + (r.netMeter ?? 0), 0);
                  const sVal = gRows.reduce((s, r) => s + (r.total ?? 0), 0);
                  return (
                    <Fragment key={sc}>
                      <tr className="group-header">
                        <td colSpan={7}>Sal Cont #: {sc} ({gRows.length} records)</td>
                      </tr>
                      {gRows.map((r) => (
                        <tr key={r.id}>
                          <td className="mono">{r.salContNo ?? "-"}</td>
                          <td className="mono">{r.vDate}</td>
                          <td className="mono">{r.vNo}</td>
                          <td>{r.purchaseParty ?? "-"}</td>
                          <td className="num">{r.meter != null ? fmt(r.meter) : "-"}</td>
                          <td className="num">{r.netMeter != null ? fmt(r.netMeter) : "-"}</td>
                          <td className="num">{r.total != null ? fmt(r.total) : "-"}</td>
                        </tr>
                      ))}
                      <tr className="subtotal">
                        <td colSpan={4}>Subtotal — {sc}</td>
                        <td className="num">{fmt(sMeter)}</td>
                        <td className="num">{fmt(sNet)}</td>
                        <td className="num">{fmt(sVal)}</td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
              {rows.length > 0 && (
                <tr className="grand-total">
                  <td colSpan={4}>GRAND TOTAL</td>
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
