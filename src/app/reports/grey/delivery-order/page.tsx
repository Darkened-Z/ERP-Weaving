import Link from "next/link";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const fmtNum = (n: number) =>
  new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(n);

export default async function GreyDeliveryOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  await requireSession();

  const { v } = await searchParams;
  const vNo = v?.trim() ?? "";

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const recent = vNo
    ? []
    : await db
        .select({
          id: schema.intGreyDespatch.id,
          vNo: schema.intGreyDespatch.vNo,
          vDate: schema.intGreyDespatch.vDate,
          party: schema.intGreyDespatch.party,
          doParty: schema.intGreyDespatch.doParty,
          thanQty: schema.intGreyDespatch.thanQty,
          gpNo: schema.intGreyDespatch.gpNo,
        })
        .from(schema.intGreyDespatch)
        .orderBy(desc(schema.intGreyDespatch.vDate))
        .limit(30);

  if (!vNo) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="page-title mb-4">Grey Delivery Order</h1>
        <p className="text-[13px] text-[var(--muted)] mb-6">
          Pick a despatch to render a printable Delivery Order.
        </p>
        <form method="GET" action="" className="mb-6 flex gap-2">
          <input name="v" placeholder="Enter despatch V.No (e.g. IGD-0001)" className="input-box mono flex-1" />
          <button type="submit" className="btn btn-sm">Open</button>
        </form>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>V.No</th>
                <th>Date</th>
                <th>Party</th>
                <th>DO Party</th>
                <th className="text-right">Than</th>
                <th>GP</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="mono font-bold">{r.vNo}</td>
                  <td className="mono">{r.vDate}</td>
                  <td>{r.party ?? "-"}</td>
                  <td>{r.doParty ?? "-"}</td>
                  <td className="mono text-right">{r.thanQty ?? "-"}</td>
                  <td className="mono">{r.gpNo ?? "-"}</td>
                  <td>
                    <Link href={`/reports/grey/delivery-order?v=${encodeURIComponent(r.vNo)}`} className="btn btn-outline btn-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const [despatch] = await db
    .select()
    .from(schema.intGreyDespatch)
    .where(eq(schema.intGreyDespatch.vNo, vNo))
    .limit(1);

  if (!despatch) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <h1 className="page-title mb-4">Not Found</h1>
        <p>No despatch with V.No <span className="mono">{vNo}</span></p>
        <Link href="/reports/grey/delivery-order" className="btn btn-outline btn-sm mt-4">Back</Link>
      </div>
    );
  }

  const lines = await db
    .select()
    .from(schema.intGreyDespatchLine)
    .where(eq(schema.intGreyDespatchLine.despatchId, despatch.id))
    .orderBy(schema.intGreyDespatchLine.srNo);

  const totalMeters = lines.reduce((s, l) => s + (l.lengthMtrs ?? 0), 0);
  const lineThan = (l: (typeof lines)[number]) =>
    (l.a ?? 0) + (l.b ?? 0) + (l.c ?? 0) + (l.cp ?? l.cpRej ?? 0) + (l.rej ?? 0);
  const totalThan =
    despatch.thanQty ?? (lines.length ? lines.reduce((s, l) => s + lineThan(l), 0) : 0);

  const partyName = despatch.party ?? despatch.doParty ?? despatch.despatchTo ?? "—";

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .do-wrap { padding: 0 !important; background: #fff !important; }
          .do-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
        }
        .do-wrap { background: #f5f5f5; min-height: 100vh; padding: 32px 16px; }
        .do-toolbar { max-width: 210mm; margin: 0 auto 20px; display: flex; justify-content: space-between; gap: 12px; }
        .do-page {
          background: #fff; color: #000; max-width: 210mm; margin: 0 auto;
          padding: 22mm 18mm; border: 1px solid #000;
          font-family: 'Georgia', 'Times New Roman', serif; font-size: 12pt; line-height: 1.45;
        }
        .do-page .company-name { text-align: center; font-size: 26pt; font-weight: 700; letter-spacing: 0.02em; }
        .do-page .company-meta { text-align: center; font-size: 10pt; margin-top: 4px; }
        .do-page .doc-title {
          text-align: center; font-size: 18pt; font-weight: 700; letter-spacing: 0.28em;
          margin: 12px 0 18px; padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000;
        }
        .do-page .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 32px; margin-bottom: 16px; font-size: 11pt; }
        .do-page .meta-row { display: flex; gap: 8px; border-bottom: 1px dotted #000; padding: 3px 0; }
        .do-page .meta-label {
          font-family: 'Helvetica', Arial, sans-serif; font-size: 8.5pt; font-weight: 700;
          letter-spacing: 0.12em; text-transform: uppercase; min-width: 92px;
        }
        .do-page .meta-value { flex: 1; font-weight: 600; }
        .do-page .party-block { border: 1px solid #000; padding: 10px 14px; margin: 14px 0 18px; }
        .do-page .party-label { font-family: 'Helvetica', Arial, sans-serif; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
        .do-page .party-name { font-size: 16pt; font-weight: 700; margin-top: 2px; }
        .do-page .party-sub { font-size: 10.5pt; margin-top: 4px; }
        .do-page table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .do-page table.items th, .do-page table.items td {
          border: 1px solid #000; padding: 8px 10px; font-size: 11pt;
          font-family: 'Georgia', 'Times New Roman', serif; text-align: left; vertical-align: top;
        }
        .do-page table.items th {
          font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt; font-weight: 700;
          letter-spacing: 0.1em; text-transform: uppercase;
        }
        .do-page table.items th.num, .do-page table.items td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .do-page table.items td.sr { text-align: center; width: 32px; }
        .do-page .totals {
          display: flex; justify-content: flex-end; gap: 40px; margin-top: 12px;
          padding: 8px 10px; border-top: 2px solid #000; border-bottom: 2px solid #000; font-size: 11pt;
        }
        .do-page .total-label { font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
        .do-page .total-value { font-weight: 700; font-size: 13pt; font-variant-numeric: tabular-nums; }
        .do-page .signatures { margin-top: 42px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
        .do-page .sig-line { border-top: 1px solid #000; margin-bottom: 6px; height: 32px; }
        .do-page .sig-label { font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; text-align: center; }
        .do-page .footer { margin-top: 26px; font-size: 8.5pt; text-align: center; color: #333; letter-spacing: 0.05em; }
      `}</style>

      <div className="do-wrap">
        <div className="do-toolbar no-print">
          <Link href="/reports/grey/delivery-order" className="btn btn-outline btn-sm">Back</Link>
          <PrintButton label="Print Delivery Order" size="lg" />
        </div>

        <div className="do-page">
          <div className="company-name">{company?.name ?? "Company Name"}</div>
          <div className="company-meta">
            {[company?.address, company?.city].filter(Boolean).join(", ") || "Address"}
            {company?.phone ? ` — Phone: ${company.phone}` : ""}
          </div>

          <div className="doc-title">DELIVERY ORDER</div>

          <div className="meta-grid">
            <div className="meta-row"><span className="meta-label">DO No</span><span className="meta-value">{despatch.vNo}</span></div>
            <div className="meta-row"><span className="meta-label">Date</span><span className="meta-value">{despatch.vDate}</span></div>
            <div className="meta-row"><span className="meta-label">Vehicle No</span><span className="meta-value">{despatch.vehicleNo ?? "—"}</span></div>
            <div className="meta-row"><span className="meta-label">Driver</span><span className="meta-value">{despatch.driver ?? "—"}</span></div>
            <div className="meta-row"><span className="meta-label">Gate Pass</span><span className="meta-value">{despatch.gpNo ?? "—"}</span></div>
            <div className="meta-row"><span className="meta-label">Quality</span><span className="meta-value">{despatch.greyCode ?? despatch.productBrand ?? "—"}</span></div>
          </div>

          <div className="party-block">
            <div className="party-label">M/s.</div>
            <div className="party-name">{partyName}</div>
            {despatch.doParty && despatch.doParty !== partyName ? (
              <div className="party-sub">DO Party: {despatch.doParty}</div>
            ) : null}
            {despatch.despatchLocation ? (
              <div className="party-sub">Location: {despatch.despatchLocation}</div>
            ) : null}
          </div>

          <table className="items">
            <thead>
              <tr>
                <th style={{ width: "36px" }}>#</th>
                <th className="num" style={{ width: "80px" }}>T.Sr#</th>
                <th className="num">A</th>
                <th className="num">B</th>
                <th className="num">C</th>
                <th className="num">CP</th>
                <th className="num">Rej</th>
                <th className="num" style={{ width: "120px" }}>Meters</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", fontStyle: "italic" }}>
                    No line detail — despatch summary: {despatch.thanQty ?? 0} than
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className="sr">{i + 1}</td>
                    <td className="num">{l.tSrNo ?? "—"}</td>
                    <td className="num">{l.a != null ? fmtNum(l.a) : "—"}</td>
                    <td className="num">{l.b != null ? fmtNum(l.b) : "—"}</td>
                    <td className="num">{l.c != null ? fmtNum(l.c) : "—"}</td>
                    <td className="num">{l.cp != null ? fmtNum(l.cp) : l.cpRej != null ? fmtNum(l.cpRej) : "—"}</td>
                    <td className="num">{l.rej != null ? fmtNum(l.rej) : "—"}</td>
                    <td className="num">{l.lengthMtrs != null ? fmtNum(l.lengthMtrs) : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="totals">
            <div><span className="total-label">Total Than: </span><span className="total-value">{totalThan != null ? fmtNum(totalThan) : "—"}</span></div>
            <div><span className="total-label">Total Meters: </span><span className="total-value">{fmtNum(totalMeters)}</span></div>
          </div>

          <div className="signatures">
            <div><div className="sig-line" /><div className="sig-label">Prepared By</div></div>
            <div><div className="sig-line" /><div className="sig-label">Checked By</div></div>
            <div><div className="sig-line" /><div className="sig-label">Received By</div></div>
          </div>

          <div className="footer">Computer generated delivery order — {despatch.vNo}</div>
        </div>
      </div>
    </>
  );
}
