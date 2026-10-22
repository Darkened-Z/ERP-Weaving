import { db, schema } from "@/db";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { totalsOf, type RegisterLine, type Totals } from "./voucher-register";

const fmt = (n: number, d = 0) =>
  n ? new Intl.NumberFormat("en-PK", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n) : "";

export const REPORT_STYLE = `
  @page { size: A4; margin: 12mm; }
  @media print {
    html, body { background: #fff !important; }
    .no-print { display: none !important; }
    .rp-wrap { padding: 0 !important; background: #fff !important; }
    .rp-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
    tr { break-inside: avoid; }
  }
  .rp-wrap { background: #f5f5f5; min-height: 100vh; padding: 24px 16px; }
  .rp-toolbar { max-width: 210mm; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
  .rp-page {
    background: #fff; color: #000; max-width: 210mm; margin: 0 auto;
    padding: 14mm 12mm; border: 1px solid #000;
    font-family: 'Helvetica', Arial, sans-serif; font-size: 10pt; line-height: 1.4;
  }
  .rp-scroll { overflow-x: auto; }
  @media screen and (max-width: 640px) {
    .rp-wrap { padding: 12px 8px; }
    .rp-page { padding: 16px 10px; }
    .rp-company .name { font-size: 14pt; }
    .rp-title { font-size: 11pt; letter-spacing: 0.1em; }
  }
  .rp-company { text-align: center; }
  .rp-company .name { font-size: 18pt; font-weight: 700; letter-spacing: 0.02em; }
  .rp-company .meta { font-size: 9pt; margin-top: 3px; }
  .rp-title {
    text-align: center; font-size: 14pt; font-weight: 700; letter-spacing: 0.2em;
    margin: 12px 0 8px; padding: 5px 0; border-top: 1px solid #000; border-bottom: 1px solid #000;
  }
  .rp-filter { font-size: 8.5pt; letter-spacing: 0.04em; text-transform: uppercase; text-align: center; margin-bottom: 10px; color: #333; }
  table.rp-table { width: 100%; border-collapse: collapse; }
  table.rp-table th, table.rp-table td { border: 1px solid #000; padding: 3px 5px; font-size: 8.5pt; text-align: left; vertical-align: top; }
  table.rp-table th { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; background: #e5e5e5; }
  table.rp-table td.num, table.rp-table th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.rp-table td.mono { font-family: 'IBM Plex Mono', monospace; white-space: nowrap; }
  table.rp-table tr.rp-grp td { font-weight: 700; font-size: 9.5pt; background: #f2f2f2; border-top: 2px solid #000; }
  table.rp-table tr.rp-sub td { font-weight: 700; background: #fafafa; }
  table.rp-table tfoot td { font-weight: 700; background: #e5e5e5; }
  .rp-signatures { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }
  .rp-sig { text-align: center; }
  .rp-sig-line { border-top: 1px solid #000; margin-bottom: 6px; height: 28px; }
  .rp-sig-label { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
  .rp-empty { text-align: center; padding: 24px 0; font-style: italic; color: #555; }
`;

export async function CompanyHeader() {
  const [company] = await db.select().from(schema.companyProfile).limit(1);
  return (
    <div className="rp-company">
      <div className="name">{company?.name ?? "Company Name"}</div>
      <div className="meta">
        {[company?.address, company?.city].filter(Boolean).join(", ")}
        {company?.phone ? ` — Phone: ${company.phone}` : ""}
      </div>
    </div>
  );
}

export function Signatures() {
  return (
    <div className="rp-signatures">
      <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Prepared By</div></div>
      <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Checked By</div></div>
      <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Approved By</div></div>
    </div>
  );
}

/** Purchase / sale subtotal rows, plus the balance when both are shown. */
function SubRows({ lines, label, foot }: { lines: RegisterLine[]; label: string; foot?: boolean }) {
  const pur = lines.filter((l) => l.type === "PUR");
  const sal = lines.filter((l) => l.type === "SAL");
  const rows: { name: string; t: Totals; bal?: boolean }[] = [];
  if (pur.length) rows.push({ name: "Purchase", t: totalsOf(pur) });
  if (sal.length) rows.push({ name: "Sale", t: totalsOf(sal) });
  if (pur.length && sal.length) {
    const p = totalsOf(pur);
    const s = totalsOf(sal);
    rows.push({ name: "Balance", t: { bags: p.bags - s.bags, lbs: p.lbs - s.lbs, amount: 0, avgRate: 0 }, bal: true });
  }
  return (
    <>
      {rows.map((r) => (
        <tr key={r.name} className={foot ? undefined : "rp-sub"}>
          <td colSpan={5} style={{ textAlign: "right" }}>
            {[label, r.name].filter(Boolean).join(" ")}
          </td>
          <td className="num">{fmt(r.t.bags, 2)}</td>
          <td className="num">{fmt(r.t.lbs)}</td>
          <td className="num">{r.bal ? "" : fmt(r.t.avgRate, 2)}</td>
          <td className="num">{r.bal ? "" : fmt(r.t.amount)}</td>
        </tr>
      ))}
    </>
  );
}

/**
 * The Oracle Yarn Sale Register layout: one block per count (or per party),
 * every voucher line in it by date, then the block's bags / lbs / average rate /
 * amount. Purchases and sales are totalled apart — adding them would mean nothing.
 */
export async function RegisterReport({
  title,
  lines,
  groupBy,
  filter,
  filename,
}: {
  title: string;
  lines: RegisterLine[];
  groupBy: "count" | "party";
  filter: string;
  filename: string;
}) {
  const keyOf = (l: RegisterLine) => (groupBy === "count" ? l.countLabel : l.party || "—");
  const groups = new Map<string, RegisterLine[]>();
  for (const l of lines) {
    const k = keyOf(l);
    (groups.get(k) ?? (groups.set(k, []), groups.get(k)!)).push(l);
  }
  const ordered = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  const descHead = groupBy === "count" ? "Party" : "Count";

  const excelRows = ordered.flatMap(([k, ls]) =>
    ls.map((l) => ({
      group: k,
      vNo: l.vNo,
      vDate: l.vDate,
      desc: groupBy === "count" ? l.party : l.countLabel,
      brand: l.brand,
      contNo: l.contNo,
      bags: l.bags,
      lbs: l.lbs,
      rate: l.rate,
      amount: l.amount,
    })),
  );

  return (
    <>
      <style>{REPORT_STYLE}</style>
      <div className="rp-wrap">
        <div className="rp-toolbar no-print">
          <a href="/external/reports/yarn-register" className="btn btn-outline btn-sm">Back</a>
          <div className="flex gap-2 flex-wrap">
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "group", label: groupBy === "count" ? "Count" : "Party" },
                { key: "vNo", label: "V.#" },
                { key: "vDate", label: "V. Date" },
                { key: "desc", label: descHead },
                { key: "brand", label: "Brand" },
                { key: "contNo", label: "Cont #" },
                { key: "bags", label: "Bags" },
                { key: "lbs", label: "Lbs" },
                { key: "rate", label: "Rate" },
                { key: "amount", label: "Amount" },
              ]}
              filename={filename}
              sheetName={filename}
              title={title}
            />
            <PrintButton label="Print" />
          </div>
        </div>

        <div className="rp-page">
          <CompanyHeader />
          <div className="rp-title">{title}</div>
          <div className="rp-filter">{filter}</div>

          <div className="rp-scroll">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>V.#</th>
                  <th>V. Date</th>
                  <th>{descHead}</th>
                  <th>Brand</th>
                  <th>Cont #</th>
                  <th className="num">Bags</th>
                  <th className="num">Lbs</th>
                  <th className="num">Rate</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ordered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="rp-empty">No yarn vouchers for the selected filters.</td>
                  </tr>
                )}
                {ordered.map(([k, ls]) => (
                  <GroupBlock key={k} label={k} lines={ls} groupBy={groupBy} />
                ))}
              </tbody>
              {lines.length > 0 && (
                <tfoot>
                  <SubRows lines={lines} label="Grand Total" foot />
                </tfoot>
              )}
            </table>
          </div>

          <Signatures />
        </div>
      </div>
    </>
  );
}

function GroupBlock({ label, lines, groupBy }: { label: string; lines: RegisterLine[]; groupBy: "count" | "party" }) {
  return (
    <>
      <tr className="rp-grp">
        <td colSpan={9}>{label}</td>
      </tr>
      {lines.map((l, i) => (
        <tr key={`${l.vNo}-${i}`}>
          <td className="mono">{l.vNo}</td>
          <td className="mono">{l.vDate}</td>
          <td>{groupBy === "count" ? l.party : l.countLabel}</td>
          <td>{l.brand}</td>
          <td className="mono">{l.contNo}</td>
          <td className="num">{fmt(l.bags, 2)}</td>
          <td className="num">{fmt(l.lbs)}</td>
          <td className="num">{fmt(l.rate, 2)}</td>
          <td className="num">{fmt(l.amount)}</td>
        </tr>
      ))}
      <SubRows lines={lines} label="" />
    </>
  );
}
