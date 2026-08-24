import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const PRINT_CSS = `
@page { size: A4; margin: 14mm; }
html, body { background: #fff; color: #000; }
body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11px; }
.doc-toolbar { max-width: 900px; margin: 12px auto; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 0 16px; }
.doc-page { max-width: 900px; margin: 0 auto 24px; padding: 12mm 8mm; background: #fff; border: 1px solid #000; }
.doc-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
.doc-company { font-size: 20pt; font-weight: 700; letter-spacing: 0.02em; margin: 0; }
.doc-title { text-align: center; font-size: 14pt; font-weight: 700; letter-spacing: 0.22em; margin: 8px 0; padding: 4px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }
.meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin: 8px 0; font-size: 10.5pt; }
.meta-grid > div > span.k { display: inline-block; min-width: 100px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 9pt; }
table.doc { width: 100%; border-collapse: collapse; margin-top: 8px; }
table.doc th, table.doc td { border: 1px solid #000; padding: 4px 6px; font-size: 10px; vertical-align: top; text-align: left; }
table.doc th { background: #e8e8e8; font-family: 'Helvetica', Arial, sans-serif; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
table.doc td.mono { font-family: 'Courier New', monospace; }
table.doc td.r { text-align: right; }
.totals { margin-top: 10px; display: flex; justify-content: flex-end; }
.totals table { border-collapse: collapse; }
.totals td { padding: 4px 12px; border: 1px solid #000; font-size: 10.5pt; }
.totals td.k { background: #e8e8e8; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.sig-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 40px; font-size: 10pt; }
.sig-row div { border-top: 1px solid #000; padding-top: 4px; text-align: center; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; font-size: 9pt; }
@media print { .no-print { display: none !important; } .doc-page { border: none; margin: 0; padding: 0; max-width: none; } .doc-toolbar { display: none; } }
`;

export default async function DemandPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const idRaw = params.id?.trim() ?? "";
  const id = parseInt(idRaw, 10);

  let dmd: typeof schema.storeDemands.$inferSelect | null = null;
  let lines: (typeof schema.storeDemandDetail.$inferSelect)[] = [];
  let recent: (typeof schema.storeDemands.$inferSelect)[] = [];

  if (Number.isFinite(id)) {
    const dmdRow = await db
      .select()
      .from(schema.storeDemands)
      .where(eq(schema.storeDemands.id, id))
      .limit(1);
    dmd = dmdRow[0] ?? null;
    if (dmd) {
      lines = await db
        .select()
        .from(schema.storeDemandDetail)
        .where(eq(schema.storeDemandDetail.demandId, id))
        .orderBy(schema.storeDemandDetail.srNo);
    }
  } else {
    recent = await db
      .select()
      .from(schema.storeDemands)
      .orderBy(desc(schema.storeDemands.demandDate))
      .limit(20);
  }

  const parts = lines.length ? await db.select().from(schema.chartParts) : [];
  const partMap = new Map(parts.map((p) => [p.code, p]));

  const ccList = await db.select().from(schema.costCenters);
  const ccMap = new Map(ccList.map((c) => [String(c.code), c.description]));

  const [profile] = await db.select().from(schema.companyProfile).limit(1);
  const companyName = profile?.name ?? "SK Mills";
  const companyAddr = [profile?.address, profile?.city].filter(Boolean).join(", ");

  const totQty = lines.reduce((s, l) => s + l.qty, 0);
  const totAmt = lines.reduce((s, l) => s + l.amount, 0);

  if (!dmd) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
        <div className="doc-toolbar no-print">
          <a href="/store/demand" className="btn btn-outline btn-sm">Back</a>
        </div>
        <div className="doc-page">
          <div className="doc-header">
            <h1 className="doc-company">{companyName}</h1>
            {companyAddr && <div style={{ fontSize: "9.5pt", marginTop: 2 }}>{companyAddr}</div>}
          </div>
          <div className="doc-title">Demand Note</div>
          <p style={{ marginTop: 16, fontSize: 11 }}>Select a demand to print:</p>
          <ul style={{ marginTop: 8, fontSize: 11 }}>
            {recent.map((r) => (
              <li key={r.id} style={{ margin: "4px 0" }}>
                <a href={`?id=${r.id}`} style={{ textDecoration: "underline" }}>
                  Dmd {r.demandNo} — {r.demandDate} — {r.department} — Rs {fmt(r.totalAmount ?? 0)}
                </a>
              </li>
            ))}
            {recent.length === 0 && <li>No demands found</li>}
          </ul>
        </div>
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="doc-toolbar no-print">
        <a href="/store/demand" className="btn btn-outline btn-sm">Back</a>
        <PrintButton label="Print Demand" />
      </div>
      <div className="doc-page">
        <div className="doc-header">
          <h1 className="doc-company">{companyName}</h1>
          {companyAddr && <div style={{ fontSize: "9.5pt", marginTop: 2 }}>{companyAddr}</div>}
        </div>
        <div className="doc-title">Demand Note</div>

        <div className="meta-grid">
          <div><span className="k">Demand No</span> {dmd.demandNo}</div>
          <div><span className="k">Date</span> {dmd.demandDate}</div>
          <div><span className="k">Department</span> {dmd.department}</div>
          <div><span className="k">Requested By</span> {dmd.requestedBy ?? "-"}</div>
          <div><span className="k">FY</span> {dmd.fyCode}</div>
          <div><span className="k">Status</span> {dmd.status}</div>
        </div>

        <table className="doc">
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th>Part Code</th>
              <th>Description</th>
              <th style={{ width: 50 }}>Unit</th>
              <th className="r" style={{ width: 60 }}>Qty</th>
              <th className="r" style={{ width: 70 }}>Rate</th>
              <th className="r" style={{ width: 90 }}>Amount</th>
              <th>Cost Ctr</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const p = partMap.get(l.partCode);
              return (
                <tr key={l.id}>
                  <td className="mono">{l.srNo}</td>
                  <td className="mono">{l.partCode}</td>
                  <td>{p?.description ?? "-"}</td>
                  <td className="mono">{p?.unit ?? "-"}</td>
                  <td className="mono r">{fmt(l.qty)}</td>
                  <td className="mono r">{fmt2(l.rate)}</td>
                  <td className="mono r">{fmt(l.amount)}</td>
                  <td>{ccMap.get(l.ccCode ?? "") ?? l.ccCode ?? "-"}</td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: 20 }}>No lines</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="totals">
          <table>
            <tbody>
              <tr>
                <td className="k">Total Qty</td>
                <td className="mono">{fmt(totQty)}</td>
              </tr>
              <tr>
                <td className="k">Total Amount</td>
                <td className="mono">Rs {fmt(totAmt)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {dmd.remarks && (
          <div style={{ marginTop: 12, fontSize: 10 }}>
            <strong style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Remarks:</strong>{" "}
            {dmd.remarks}
          </div>
        )}

        <div className="sig-row">
          <div>Requested By</div>
          <div>Store In-Charge</div>
          <div>Approved By</div>
        </div>
      </div>
    </>
  );
}
