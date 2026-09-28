import { Fragment } from "react";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import { today as todayFn, monthsAgo } from "@/lib/time";
import { DateBox } from "@/components/date-box";
import { countLabelMap, fullConstruction } from "@/lib/grey-quality";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default async function GreyStockSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = todayFn();
  const from = params.from?.trim() || monthsAgo(12);
  const to = params.to?.trim() || today;

  const [stockRows, constructions, counts] = await Promise.all([
    db
      .select()
      .from(schema.extGodownStock)
      .where(and(gte(schema.extGodownStock.vDate, from), lte(schema.extGodownStock.vDate, to))),
    db.select().from(schema.greyConstruction),
    db
      .select({
        countCode: schema.yarnCounts.countCode,
        description: schema.yarnCounts.description,
        type: schema.yarnCounts.type,
      })
      .from(schema.yarnCounts),
  ]);

  const countLabels = countLabelMap(counts);
  const constrByCode = new Map(
    constructions.map((g) => [
      String(g.code),
      fullConstruction(g, countLabels) || g.description || String(g.code),
    ]),
  );

  type QualityGroup = {
    quality: string;
    qualityLabel: string;
    godowns: Map<string, { purchased: number; sold: number; balance: number; value: number; count: number }>;
    purchased: number;
    sold: number;
    balance: number;
    value: number;
    count: number;
  };

  const byQuality = new Map<string, QualityGroup>();

  for (const row of stockRows) {
    const q = (row.dspQuality ?? "").trim() || "—";
    const g = (row.gdnParty ?? "").trim() || "—";
    const meter = row.meter ?? 0;
    const bal = row.balance ?? 0;
    const sold = meter - bal;
    const rate = row.rate ?? row.rateSal ?? 0;
    const val = bal * rate;

    let qg = byQuality.get(q);
    if (!qg) {
      qg = {
        quality: q,
        qualityLabel: constrByCode.get(q) ?? q,
        godowns: new Map(),
        purchased: 0,
        sold: 0,
        balance: 0,
        value: 0,
        count: 0,
      };
      byQuality.set(q, qg);
    }

    let gd = qg.godowns.get(g);
    if (!gd) {
      gd = { purchased: 0, sold: 0, balance: 0, value: 0, count: 0 };
      qg.godowns.set(g, gd);
    }

    gd.purchased += meter;
    gd.sold += sold;
    gd.balance += bal;
    gd.value += val;
    gd.count += 1;

    qg.purchased += meter;
    qg.sold += sold;
    qg.balance += bal;
    qg.value += val;
    qg.count += 1;
  }

  const groups = Array.from(byQuality.values()).sort((a, b) => a.quality.localeCompare(b.quality));

  const grand = groups.reduce(
    (t, g) => ({
      purchased: t.purchased + g.purchased,
      sold: t.sold + g.sold,
      balance: t.balance + g.balance,
      value: t.value + g.value,
      count: t.count + g.count,
    }),
    { purchased: 0, sold: 0, balance: 0, value: 0, count: 0 },
  );

  const excelRows = groups.flatMap((g) =>
    Array.from(g.godowns.entries()).map(([gdn, d]) => ({
      quality: g.quality,
      qualityLabel: g.qualityLabel,
      godown: gdn,
      pieces: d.count,
      purchased: Math.round(d.purchased),
      sold: Math.round(d.sold),
      balance: Math.round(d.balance),
      value: Math.round(d.value),
    })),
  );

  return (
    <Shell active="ext-r-greystock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Grey Stock Summary</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {stockRows.length} pieces &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 no-print">
            <PrintButton label="Print" />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "quality", label: "Quality Code" },
                { key: "qualityLabel", label: "Quality" },
                { key: "godown", label: "Godown" },
                { key: "pieces", label: "Pieces" },
                { key: "purchased", label: "Purchased (Mtr)" },
                { key: "sold", label: "Sold (Mtr)" },
                { key: "balance", label: "Stock (Mtr)" },
                { key: "value", label: "Value" },
              ]}
              filename="grey-stock-summary"
              title={`Grey Stock Summary ${from} to ${to}`}
            />
          </div>
        </div>

        <form method="GET" className="card p-4 mb-5 grid grid-cols-1 sm:grid-cols-6 gap-3 items-end no-print">
          <div className="sm:col-span-2">
            <label className="label block mb-1">Date From</label>
            <DateBox name="from" className="input-box mono" defaultValue={from} />
          </div>
          <div className="sm:col-span-2">
            <label className="label block mb-1">Date To</label>
            <DateBox name="to" className="input-box mono" defaultValue={to} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-sm w-full">View</button>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(grand.count)}</div>
            <div className="stat-label">Pieces</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(grand.purchased)}</div>
            <div className="stat-label">Purchased (Mtr)</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(grand.sold)}</div>
            <div className="stat-label">Sold (Mtr)</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(grand.balance)}</div>
            <div className="stat-label">In Stock (Mtr)</div>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Quality</th>
                <th>Godown</th>
                <th className="text-right" style={{ width: 60 }}>Pcs</th>
                <th className="text-right" style={{ width: 100 }}>Purchased</th>
                <th className="text-right" style={{ width: 100 }}>Sold</th>
                <th className="text-right" style={{ width: 100 }}>Stock (Mtr)</th>
                <th className="text-right" style={{ width: 110 }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-[var(--muted)] py-8">
                    No grey stock records in this period.
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <Fragment key={g.quality}>
                    {Array.from(g.godowns.entries())
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([gdn, d], gi) => (
                        <tr key={`${g.quality}-${gdn}`}>
                          {gi === 0 ? (
                            <td rowSpan={g.godowns.size} className="text-[13px] font-bold align-top border-r">
                              <div>{g.quality}</div>
                              <div className="text-[11px] text-[var(--muted)] font-normal">{g.qualityLabel}</div>
                            </td>
                          ) : null}
                          <td className="text-[13px]">{gdn}</td>
                          <td className="mono text-right">{fmt(d.count)}</td>
                          <td className="mono text-right">{fmt(d.purchased)}</td>
                          <td className="mono text-right">{fmt(d.sold)}</td>
                          <td className="mono text-right font-bold">{fmt(d.balance)}</td>
                          <td className="mono text-right">{fmt(d.value)}</td>
                        </tr>
                      ))}
                    {g.godowns.size > 1 && (
                      <tr style={{ background: "#f1f5f9" }}>
                        <td className="font-bold text-[12px] uppercase tracking-wider" colSpan={2}>
                          Sub-total: {g.quality}
                        </td>
                        <td className="mono text-right font-bold">{fmt(g.count)}</td>
                        <td className="mono text-right font-bold">{fmt(g.purchased)}</td>
                        <td className="mono text-right font-bold">{fmt(g.sold)}</td>
                        <td className="mono text-right font-bold">{fmt(g.balance)}</td>
                        <td className="mono text-right font-bold">{fmt(g.value)}</td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
            {groups.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-black">
                  <td colSpan={2} className="font-bold text-[12px] uppercase tracking-wider">Grand Total</td>
                  <td className="mono text-right font-bold">{fmt(grand.count)}</td>
                  <td className="mono text-right font-bold">{fmt(grand.purchased)}</td>
                  <td className="mono text-right font-bold">{fmt(grand.sold)}</td>
                  <td className="mono text-right font-bold">{fmt(grand.balance)}</td>
                  <td className="mono text-right font-bold">{fmt(grand.value)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
