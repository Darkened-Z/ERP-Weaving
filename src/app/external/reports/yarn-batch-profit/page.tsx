import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number, d = 0) =>
  new Intl.NumberFormat("en-PK", { maximumFractionDigits: d }).format(n);
// The mill counts 100 lbs to a bag — the same conversion the counts-accounts
// summary and the client's own COUNT LIST use.
const bags = (lbs: number) => lbs / 100;

/**
 * What became of each batch of yarn bought.
 *
 * The question this answers is the client's own: 100 bags came in, 50 + 20 + 30
 * went out on three different sales — what is left, and what was made on it.
 *
 * Every figure is derived from the purchase and sale lines as they stand right
 * now; nothing is snapshotted. So correcting a purchase rate after the yarn has
 * been sold — 300 typed where 305 was meant — reflows the cost, the profit and
 * the balance here at once, on this batch and on every sale that drew from it.
 * There is no stale copy of the rate anywhere for the profit to be taken from.
 */
export default async function YarnBatchProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stock?: string; count?: string }>;
}) {
  // Find one batch (owner 2026-10-22: "where does the detail of this stock
  // come from") — batch no, count, brand, godown or party; In stock only drops
  // batches that are fully sold.
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const inStockOnly = sp.stock === "1";
  // Exact count code, from Yarn Stock (Count-wise): every batch of that count.
  const countQ = (sp.count ?? "").trim();
  const purLines = await db
    .select({
      batchNo: schema.extYarnPurVoucherLine.batchNo,
      count: schema.extYarnPurVoucherLine.count,
      brand: schema.extYarnPurVoucherLine.brand,
      loc: schema.extYarnPurVoucherLine.despatchParty,
      lbs: schema.extYarnPurVoucherLine.lbs,
      rate: schema.extYarnPurVoucherLine.rate,
      vNo: schema.extYarnPurVoucher.vNo,
      vDate: schema.extYarnPurVoucher.vDate,
      party: schema.extYarnPurVoucher.party,
    })
    .from(schema.extYarnPurVoucherLine)
    .innerJoin(
      schema.extYarnPurVoucher,
      eq(schema.extYarnPurVoucherLine.voucherId, schema.extYarnPurVoucher.id)
    );

  const salLines = await db
    .select({
      batchNo: schema.extYarnSalVoucherLine.batchNo,
      lbs: schema.extYarnSalVoucherLine.lbs,
      rate: schema.extYarnSalVoucherLine.rate,
      vNo: schema.extYarnSalVoucher.vNo,
      vDate: schema.extYarnSalVoucher.vDate,
      party: schema.extYarnSalVoucher.party,
    })
    .from(schema.extYarnSalVoucherLine)
    .innerJoin(
      schema.extYarnSalVoucher,
      eq(schema.extYarnSalVoucherLine.voucherId, schema.extYarnSalVoucher.id)
    );

  const counts = await db
    .select({
      code: schema.yarnCounts.countCode,
      description: schema.yarnCounts.description,
      type: schema.yarnCounts.type,
    })
    .from(schema.yarnCounts);
  const countLabel = new Map(
    counts.map((c) => [String(c.code), `${c.description ?? ""}${c.type ? ` ${c.type}` : ""}`.trim()])
  );

  const salesByBatch = new Map<string, typeof salLines>();
  for (const s of salLines) {
    if (!s.batchNo) continue;
    const a = salesByBatch.get(s.batchNo) ?? [];
    a.push(s);
    salesByBatch.set(s.batchNo, a);
  }

  const batches = purLines
    .filter((p) => p.batchNo && (p.lbs ?? 0) > 0)
    .map((p) => {
      const purLbs = p.lbs ?? 0;
      const cost = p.rate ?? 0;
      const sales = salesByBatch.get(p.batchNo!) ?? [];
      const soldLbs = sales.reduce((s, x) => s + (x.lbs ?? 0), 0);
      const saleValue = sales.reduce((s, x) => s + (x.lbs ?? 0) * (x.rate ?? 0), 0);
      return {
        ...p,
        purLbs,
        cost,
        sales,
        soldLbs,
        balLbs: purLbs - soldLbs,
        saleValue,
        profit: saleValue - soldLbs * cost,
      };
    })
    .filter((b) => !inStockOnly || b.balLbs > 0.005)
    .filter((b) => !countQ || String(b.count) === countQ)
    .filter((b) =>
      !q ||
      [b.batchNo, b.count, countLabel.get(String(b.count)), b.brand, b.loc, b.party, b.vNo, ...b.sales.flatMap((x) => [x.party, x.vNo])]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    )
    .sort((a, b) => (a.batchNo ?? "").localeCompare(b.batchNo ?? ""));

  const t = {
    purLbs: batches.reduce((s, b) => s + b.purLbs, 0),
    purCost: batches.reduce((s, b) => s + b.purLbs * b.cost, 0),
    soldLbs: batches.reduce((s, b) => s + b.soldLbs, 0),
    saleValue: batches.reduce((s, b) => s + b.saleValue, 0),
    profit: batches.reduce((s, b) => s + b.profit, 0),
    balLbs: batches.reduce((s, b) => s + b.balLbs, 0),
    balCost: batches.reduce((s, b) => s + b.balLbs * b.cost, 0),
  };

  return (
    <Shell active="ext-r-yarnbatch">
      <div className="mb-4 flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[18px] font-bold uppercase tracking-[0.06em]">Yarn Batch Profit</h1>
          <div className="text-[11px] text-[var(--muted)] mono">
            What came in on each batch, what went out on it, what is left and what was made — read
            live from the vouchers, so a corrected purchase rate reflows here at once.
          </div>
        </div>
        <PrintButton label="Print" />
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-2 mb-4 no-print">
        <div>
          <label className="label block mb-1">Find</label>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Batch (YPV-0027/A), count, brand, party…" className="input-box mono" style={{ minWidth: 280 }} />
        </div>
        <label className="flex items-center gap-2 text-[13px] pb-1.5">
          <input type="checkbox" name="stock" value="1" defaultChecked={inStockOnly} className="w-4 h-4 accent-black" />
          In stock only
        </label>
        <button type="submit" className="btn btn-sm">Find</button>
        {countQ && <input type="hidden" name="count" value={countQ} />}
        {countQ && <span className="text-[12px] mono pb-1.5">Count: {countLabel.get(countQ) || countQ}</span>}
        {(q || inStockOnly || countQ) && <a href="/external/reports/yarn-batch-profit" className="btn btn-outline btn-sm">Clear</a>}
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border border-black mb-5">
        {(
          [
            ["Purchased", `${fmt(bags(t.purLbs), 2)} bag / ${fmt(t.purLbs)} lbs`],
            ["Sold", `${fmt(bags(t.soldLbs), 2)} bag / ${fmt(t.soldLbs)} lbs`],
            ["In Stock", `${fmt(bags(t.balLbs), 2)} bag / ${fmt(t.balLbs)} lbs`],
            ["Profit", fmt(t.profit)],
          ] as [string, string][]
        ).map(([k, v], i) => (
          <div key={k} className={`px-3 py-2 ${i > 0 ? "border-l border-black" : ""}`}>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">{k}</div>
            <div className="mono text-[14px] font-bold">{v}</div>
          </div>
        ))}
      </div>

      {batches.length === 0 ? (
        <div className="border border-black px-4 py-8 text-center text-[13px] text-[var(--muted)] italic">
          No yarn purchase batches yet.
        </div>
      ) : (
        batches.map((b) => (
          <div key={b.batchNo} className="border border-black mb-5">
            <div className="bg-black text-white px-3 py-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px] mono">
              <span className="font-bold tracking-[0.08em]">{b.batchNo}</span>
              <span>{countLabel.get(String(b.count)) || b.count}</span>
              {b.brand && <span>{b.brand}</span>}
              <span>{b.loc}</span>
              <span className="opacity-70">
                {b.vNo} · {b.vDate} · {b.party ?? ""}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full mono text-[12px]" style={{ minWidth: 820 }}>
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="text-left px-2 py-1">Movement</th>
                    <th className="text-left px-2 py-1">V.No</th>
                    <th className="text-left px-2 py-1">Date</th>
                    <th className="text-left px-2 py-1">Party</th>
                    <th className="text-right px-2 py-1">Bag</th>
                    <th className="text-right px-2 py-1">Lbs</th>
                    <th className="text-right px-2 py-1">Rate</th>
                    <th className="text-right px-2 py-1">Amount</th>
                    <th className="text-right px-2 py-1">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--border-light)]">
                    <td className="px-2 py-1 font-bold">PURCHASE</td>
                    <td className="px-2 py-1">{b.vNo}</td>
                    <td className="px-2 py-1">{b.vDate}</td>
                    <td className="px-2 py-1">{b.party ?? ""}</td>
                    <td className="px-2 py-1 text-right">{fmt(bags(b.purLbs), 2)}</td>
                    <td className="px-2 py-1 text-right">{fmt(b.purLbs)}</td>
                    <td className="px-2 py-1 text-right">{fmt(b.cost, 2)}</td>
                    <td className="px-2 py-1 text-right">{fmt(b.purLbs * b.cost)}</td>
                    <td className="px-2 py-1 text-right text-[var(--muted)]">—</td>
                  </tr>

                  {b.sales.length === 0 ? (
                    <tr className="border-b border-[var(--border-light)]">
                      <td colSpan={9} className="px-2 py-2 text-[var(--muted)] italic">
                        Nothing sold off this batch yet.
                      </td>
                    </tr>
                  ) : (
                    b.sales.map((s, i) => {
                      const lbs = s.lbs ?? 0;
                      const p = lbs * ((s.rate ?? 0) - b.cost);
                      return (
                        <tr key={i} className="border-b border-[var(--border-light)]">
                          <td className="px-2 py-1">SALE</td>
                          <td className="px-2 py-1">{s.vNo}</td>
                          <td className="px-2 py-1">{s.vDate}</td>
                          <td className="px-2 py-1">{s.party ?? ""}</td>
                          <td className="px-2 py-1 text-right">{fmt(bags(lbs), 2)}</td>
                          <td className="px-2 py-1 text-right">{fmt(lbs)}</td>
                          <td className="px-2 py-1 text-right">{fmt(s.rate ?? 0, 2)}</td>
                          <td className="px-2 py-1 text-right">{fmt(lbs * (s.rate ?? 0))}</td>
                          <td
                            className={`px-2 py-1 text-right font-bold ${p < 0 ? "italic" : ""}`}
                            style={p < 0 ? { color: "var(--danger)" } : undefined}
                          >
                            {fmt(p)}
                          </td>
                        </tr>
                      );
                    })
                  )}

                  <tr className="border-t-2 border-black">
                    <td className="px-2 py-1 font-bold" colSpan={4}>
                      BALANCE IN STOCK (at purchase cost)
                    </td>
                    <td className="px-2 py-1 text-right font-bold">{fmt(bags(b.balLbs), 2)}</td>
                    <td className="px-2 py-1 text-right font-bold">{fmt(b.balLbs)}</td>
                    <td className="px-2 py-1 text-right">{fmt(b.cost, 2)}</td>
                    <td className="px-2 py-1 text-right font-bold">{fmt(b.balLbs * b.cost)}</td>
                    <td
                      className="px-2 py-1 text-right font-bold"
                      style={b.profit < 0 ? { color: "var(--danger)" } : undefined}
                    >
                      {fmt(b.profit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <div className="border-2 border-black px-3 py-2 flex flex-wrap gap-x-6 gap-y-1 mono text-[12px]">
        <span className="font-bold uppercase tracking-[0.08em]">Grand Total</span>
        <span>Purchase Cost {fmt(t.purCost)}</span>
        <span>Sale Value {fmt(t.saleValue)}</span>
        <span>Stock at Cost {fmt(t.balCost)}</span>
        <span className="font-bold" style={t.profit < 0 ? { color: "var(--danger)" } : undefined}>
          Profit {fmt(t.profit)}
        </span>
      </div>
    </Shell>
  );
}
