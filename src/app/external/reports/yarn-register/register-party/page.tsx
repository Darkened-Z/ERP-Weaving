import { db, schema } from "@/db";
import { and, gte, lte } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : new Intl.NumberFormat("en-PK", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

function sixMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

type ContractRow = {
  type: "PUR" | "SAL";
  contNo: string;
  contDate: string;
  countCode: string | null;
  brand: string | null;
  qtyBags: number | null;
  ratePerLbs: number | null;
  amount: number | null;
  status: string;
};

type PartyGroup = {
  partyCode: string;
  partyName: string | null;
  contracts: ContractRow[];
  totalContracts: number;
  totalBags: number;
  totalAmount: number;
};

export default async function RegisterPartyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireSession();

  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;

  const [company] = await db.select().from(schema.companyProfile).limit(1);

  const purRows = await db
    .select()
    .from(schema.extYarnPurContract)
    .where(and(gte(schema.extYarnPurContract.contDate, from), lte(schema.extYarnPurContract.contDate, to)));
  const salRows = await db
    .select()
    .from(schema.extYarnSalContract)
    .where(and(gte(schema.extYarnSalContract.contDate, from), lte(schema.extYarnSalContract.contDate, to)));

  const allRows: (ContractRow & { partyCode: string })[] = [
    ...purRows.map((r) => ({
      type: "PUR" as const,
      partyCode: r.partyCode ?? "(unassigned)",
      contNo: r.contNo,
      contDate: r.contDate,
      countCode: r.countCode,
      brand: r.brand,
      qtyBags: r.qtyBags,
      ratePerLbs: r.ratePerLbs,
      amount: r.amount,
      status: r.status,
    })),
    ...salRows.map((r) => ({
      type: "SAL" as const,
      partyCode: r.partyCode ?? "(unassigned)",
      contNo: r.contNo,
      contDate: r.contDate,
      countCode: r.countCode,
      brand: r.brand,
      qtyBags: r.qtyBags,
      ratePerLbs: r.ratePerLbs,
      amount: r.amount,
      status: r.status,
    })),
  ];

  const partyCodes = Array.from(new Set(allRows.map((r) => r.partyCode)));
  const acctMap = new Map<string, string>();
  if (partyCodes.length > 0) {
    const accounts = await db
      .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
      .from(schema.chartOfAccounts);
    for (const a of accounts) acctMap.set(a.code, a.description);
  }

  const countLookup = await db
    .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description })
    .from(schema.yarnCounts);
  const countDescByCode = new Map(countLookup.map((r) => [r.countCode, r.description]));

  const grouped = new Map<string, PartyGroup>();
  for (const r of allRows) {
    const g = grouped.get(r.partyCode) ?? {
      partyCode: r.partyCode,
      partyName: acctMap.get(r.partyCode) ?? null,
      contracts: [],
      totalContracts: 0,
      totalBags: 0,
      totalAmount: 0,
    };
    g.contracts.push({
      type: r.type,
      contNo: r.contNo,
      contDate: r.contDate,
      countCode: r.countCode,
      brand: r.brand,
      qtyBags: r.qtyBags,
      ratePerLbs: r.ratePerLbs,
      amount: r.amount,
      status: r.status,
    });
    g.totalContracts += 1;
    g.totalBags += r.qtyBags ?? 0;
    g.totalAmount += r.amount ?? 0;
    grouped.set(r.partyCode, g);
  }

  const groups = Array.from(grouped.values())
    .map((g) => ({
      ...g,
      contracts: g.contracts.sort((a, b) => (a.contDate ?? "").localeCompare(b.contDate ?? "")),
    }))
    .sort((a, b) => (a.partyName ?? a.partyCode).localeCompare(b.partyName ?? b.partyCode));

  const grandContracts = groups.reduce((s, g) => s + g.totalContracts, 0);
  const grandBags = groups.reduce((s, g) => s + g.totalBags, 0);
  const grandAmount = groups.reduce((s, g) => s + g.totalAmount, 0);

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
        .rp-party-header {
          margin-top: 18px; padding: 6px 10px; background: #f0f0f0;
          border: 1px solid #000; font-weight: 700;
        }
        .rp-party-header .name { font-size: 12pt; }
        .rp-party-header .meta { font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt; letter-spacing: 0.08em; }
        table.rp-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        table.rp-table th, table.rp-table td {
          border: 1px solid #000; padding: 4px 6px; font-size: 9.5pt;
          font-family: 'Georgia', 'Times New Roman', serif; text-align: left; vertical-align: top;
        }
        table.rp-table th {
          background: #fff; font-family: 'Helvetica', Arial, sans-serif; font-size: 8.5pt;
          font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
        }
        table.rp-table td.num, table.rp-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
        table.rp-table tfoot td { font-weight: 700; background: #fafafa; }
        .rp-grand {
          margin-top: 20px; padding: 8px 12px; border-top: 2px solid #000; border-bottom: 2px solid #000;
          display: flex; justify-content: space-between; gap: 30px; font-weight: 700;
        }
        .rp-grand .item .lbl {
          font-family: 'Helvetica', Arial, sans-serif; font-size: 9pt;
          letter-spacing: 0.12em; text-transform: uppercase; display: block;
        }
        .rp-grand .item .val { font-size: 13pt; font-variant-numeric: tabular-nums; }
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

          <div className="rp-title">REGISTER BY PARTY</div>

          <div className="rp-filter">Period: {from} to {to}</div>

          {groups.length === 0 ? (
            <div className="rp-empty">No contracts found for the selected period.</div>
          ) : (
            groups.map((g) => (
              <div key={g.partyCode} style={{ pageBreakInside: "avoid" }}>
                <div className="rp-party-header">
                  <div className="name">{g.partyName ?? g.partyCode}</div>
                  <div className="meta">
                    Code: {g.partyCode} · {g.totalContracts} contract{g.totalContracts === 1 ? "" : "s"}
                    {" · "}Bags: {fmt(g.totalBags)} · Amount: Rs {fmt(g.totalAmount)}
                  </div>
                </div>
                <table className="rp-table">
                  <thead>
                    <tr>
                      <th style={{ width: "36px" }}>#</th>
                      <th>Type</th>
                      <th>Cont No</th>
                      <th>Date</th>
                      <th>Count</th>
                      <th>Brand</th>
                      <th className="num">Bags</th>
                      <th className="num">Rate</th>
                      <th className="num">Amount</th>
                      <th>St</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.contracts.map((c, i) => (
                      <tr key={`${c.type}-${c.contNo}`}>
                        <td>{i + 1}</td>
                        <td>{c.type}</td>
                        <td>{c.contNo}</td>
                        <td>{c.contDate}</td>
                        <td>{c.countCode ? (countDescByCode.get(c.countCode) ? `${c.countCode} — ${countDescByCode.get(c.countCode)}` : c.countCode) : "—"}</td>
                        <td>{c.brand ?? "—"}</td>
                        <td className="num">{fmt(c.qtyBags)}</td>
                        <td className="num">{fmt(c.ratePerLbs, 2)}</td>
                        <td className="num">{fmt(c.amount)}</td>
                        <td>{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ textAlign: "right" }}>Subtotal</td>
                      <td className="num">{fmt(g.totalBags)}</td>
                      <td></td>
                      <td className="num">{fmt(g.totalAmount)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ))
          )}

          {groups.length > 0 && (
            <div className="rp-grand">
              <div className="item">
                <span className="lbl">Total Parties</span>
                <span className="val">{fmt(groups.length)}</span>
              </div>
              <div className="item">
                <span className="lbl">Total Contracts</span>
                <span className="val">{fmt(grandContracts)}</span>
              </div>
              <div className="item">
                <span className="lbl">Total Bags</span>
                <span className="val">{fmt(grandBags)}</span>
              </div>
              <div className="item">
                <span className="lbl">Total Amount</span>
                <span className="val">Rs {fmt(grandAmount)}</span>
              </div>
            </div>
          )}

          <div className="rp-signatures">
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Prepared By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Checked By</div></div>
            <div className="rp-sig"><div className="rp-sig-line" /><div className="rp-sig-label">Approved By</div></div>
          </div>

          <div className="rp-footer">Grouped by Party (Chart of Accounts). Includes Purchase and Sales contracts.</div>
        </div>
      </div>
    </>
  );
}
