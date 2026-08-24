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
.meta-grid > div > span.k { display: inline-block; min-width: 90px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; font-size: 9pt; }
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

export default async function GrnNotePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireSession();
  const params = await searchParams;
  const idRaw = params.id?.trim() ?? "";
  const id = parseInt(idRaw, 10);

  let grn: typeof schema.storeGrn.$inferSelect | null = null;
  let lines: (typeof schema.storeGrnDetail.$inferSelect)[] = [];
  let recent: (typeof schema.storeGrn.$inferSelect)[] = [];

  if (Number.isFinite(id)) {
    const grnRow = await db.select().from(schema.storeGrn).where(eq(schema.storeGrn.id, id)).limit(1);
    grn = grnRow[0] ?? null;
    if (grn) {
      lines = await db
        .select()
        .from(schema.storeGrnDetail)
        .where(eq(schema.storeGrnDetail.grnId, id))
        .orderBy(schema.storeGrnDetail.srNo);
    }
  } else {
    recent = await db.select().from(schema.storeGrn).orderBy(desc(schema.storeGrn.grnDate)).limit(20);
  }

  const parts = lines.length
    ? await db.select().from(schema.chartParts)
    : [];
  const partMap = new Map(parts.map((p) => [p.code, p]));

  const [profile] = await db.select().from(schema.companyProfile).limit(1);
  const companyName = profile?.name ?? "SK Mills";
  const companyAddr = [profile?.address, profile?.city].filter(Boolean).join(", ");

  const totQty = lines.reduce((s, l) => s + l.qty, 0);
  const totAmt = lines.reduce((s, l) => s + l.amount, 0);

  if (!grn) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
        <div className="doc-toolbar no-print">
          <a href="/store/grn" className="btn btn-outline btn-sm">Back</a>
        </div>
        <div className="doc-page">
          <div className="doc-header">
            <h1 className="doc-company">{companyName}</h1>
            {companyAddr && <div style={{ fontSize: "9.5pt", marginTop: 2 }}>{companyAddr}</div>}
          </div>
          <div className="doc-title">Goods Received Note</div>
          <p style={{ marginTop: 16, fontSize: 11 }}>Select a GRN to print:</p>
          <ul style={{ marginTop: 8, fontSize: 11 }}>
            {recent.map((r) => (
              <li key={r.id} style={{ margin: "4px 0" }}>
                <a href={`?id=${r.id}`} style={{ textDecoration: "underline" }}>
                  GRN {r.grnNo} — {r.grnDate} — {r.supplier} — Rs {fmt(r.totalAmount ?? 0)}
                </a>
              </li>
            ))}
            {recent.length === 0 && <li>No GRNs found</li>}
          </ul>
        </div>
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="doc-toolbar no-print">
        <a href="/store/grn" className="btn btn-outline btn-sm">Back</a>
        <PrintButton label="Print GRN" />
      </div>
      <div className="doc-page">
        <div className="doc-header">
          <h1 className="doc-company">{companyName}</h1>
          {companyAddr && <div style={{ fontSize: "9.5pt", marginTop: 2 }}>{companyAddr}</div>}
        </div>
        <div className="doc-title">Goods Received Note</div>

        <div className="meta-grid">
          <div><span className="k">GRN No</span> {grn.grnNo}</div>
          <div><span className="k">Date</span> {grn.grnDate}</div>
          <div><span className="k">Supplier</span> {grn.supplier}</div>
          <div><span className="k">Invoice</span> {grn.invoiceNo ?? "-"}</div>
          <div><span className="k">FY</span> {grn.fyCode}</div>
          <div><span className="k">Status</span> {grn.status}</div>
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
              <th className="r" style={{ width: 60 }}>Disc %</th>
              <th className="r" style={{ width: 60 }}>Tax %</th>
              <th className="r" style={{ width: 90 }}>Amount</th>
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
                  <td className="mono r">{l.discPer != null ? fmt2(l.discPer) : "-"}</td>
                  <td className="mono r">{l.taxPer != null ? fmt2(l.taxPer) : "-"}</td>
                  <td className="mono r">{fmt(l.amount)}</td>
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 20 }}>No lines</td>
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

        <div className="sig-row">
          <div>Received By</div>
          <div>Store In-Charge</div>
          <div>Approved By</div>
        </div>
      </div>
    </>
  );
}
