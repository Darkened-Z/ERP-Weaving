import Link from "next/link";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, sql } from "drizzle-orm";
import { today as todayFn, monthsAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function sixMonthsAgo(): string {
  return monthsAgo(6);
}

function qs(params: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function GreyStockPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; dspQuality?: string; party?: string; contNo?: string; salContNo?: string }>;
}) {
  const params = await searchParams;

  const today = todayFn();
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;
  const dspQuality = params.dspQuality?.trim() ?? "";
  const party = params.party?.trim() ?? "";
  const contNo = params.contNo?.trim() ?? "";
  const salContNo = params.salContNo?.trim() ?? "";

  const filterQs = qs({ from, to, dspQuality, party, contNo, salContNo });

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);
  const greyRows = await db
    .select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description })
    .from(schema.greyConstruction);
  const partyCodeByName = new Map(parties.map((r) => [r.description, r.code]));
  const greyDescMap = new Map(greyRows.map((r) => [r.code, r.description]));

  const conditions = [
    gte(schema.extGodownStock.vDate, from),
    lte(schema.extGodownStock.vDate, to),
  ];
  if (dspQuality) {
    const pat = `%${escLike(dspQuality)}%`;
    conditions.push(sql`${schema.extGodownStock.dspQuality} LIKE ${pat} ESCAPE '\\'`);
  }
  if (party) {
    const pat = `%${escLike(party)}%`;
    conditions.push(sql`${schema.extGodownStock.purchaseParty} LIKE ${pat} ESCAPE '\\'`);
  }
  if (contNo) {
    const pat = `%${escLike(contNo)}%`;
    conditions.push(sql`${schema.extGodownStock.contNo} LIKE ${pat} ESCAPE '\\'`);
  }
  if (salContNo) {
    const pat = `%${escLike(salContNo)}%`;
    conditions.push(sql`${schema.extGodownStock.salContNo} LIKE ${pat} ESCAPE '\\'`);
  }

  const rows = await db
    .select()
    .from(schema.extGodownStock)
    .where(and(...conditions))
    .orderBy(sql`v_date DESC, id DESC`);

  const totalRecords = rows.length;
  const totalMeter = rows.reduce((s, r) => s + (r.meter ?? 0), 0);
  const totalNetMeter = rows.reduce((s, r) => s + (r.netMeter ?? 0), 0);
  const totalBalance = rows.reduce((s, r) => s + (r.balance ?? 0), 0);

  const actionButtons: { label: string; href: string }[] = [
    { label: "Stock + Lgr", href: `/external/reports/grey-stock/stock-lgr${filterQs}` },
    { label: "Sal Cont Date + Gdn Register", href: `/external/reports/grey-stock/gdn-register${filterQs}` },
    { label: "Sal Cont + Lgr", href: `/external/reports/grey-stock/sal-cont-lgr${filterQs}` },
    { label: "Cont # + Sal Register W.C", href: `/external/reports/grey-stock/sal-reg-wc${filterQs}` },
    { label: "Sal Register W.O.C", href: `/external/reports/grey-stock/sal-reg-woc${filterQs}` },
    { label: "Sal Register Lgr", href: `/external/reports/grey-stock/sal-reg-lgr${filterQs}` },
    { label: "WOR", href: `/external/reports/grey-stock/wor${filterQs}` },
  ];

  return (
    <Shell active="ext-r-greystock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Grey Stock</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {totalRecords} records &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={rows.map((r) => ({
                vNo: r.vNo,
                vDate: r.vDate,
                kpNo: r.kpNo ?? "",
                purchaseParty: r.purchaseParty ?? "",
                gdnParty: r.gdnParty ?? "",
                dspQuality: r.dspQuality ?? "",
                contNo: r.contNo ?? "",
                salContNo: r.salContNo ?? "",
                meter: r.meter,
                netMeter: r.netMeter,
                total: r.total,
                balance: r.balance,
              }))}
              columns={[
                { key: "vNo", label: "V.No" },
                { key: "vDate", label: "V.Date" },
                { key: "kpNo", label: "KP No" },
                { key: "purchaseParty", label: "Purchase Party" },
                { key: "gdnParty", label: "Gdn Party" },
                { key: "dspQuality", label: "Dsp Quality" },
                { key: "contNo", label: "Cont #" },
                { key: "salContNo", label: "Sal Cont #" },
                { key: "meter", label: "Meter" },
                { key: "netMeter", label: "Net Meter" },
                { key: "total", label: "Total" },
                { key: "balance", label: "Balance" },
              ]}
              filename="grey-stock"
              sheetName="GreyStock"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Grey Stock</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-6 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">Date From</label>
            <input type="date" name="from" defaultValue={from} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input type="date" name="to" defaultValue={to} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Dsp. Quality</label>
            <input type="text" name="dspQuality" defaultValue={dspQuality} className="input-box mono" list="dsp-quality-list" />
            <datalist id="dsp-quality-list">
              {greyRows.map((g) => (
                <option key={g.code} value={g.code} label={`${g.code} — ${g.description}`} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label block mb-1">Party</label>
            <input type="text" name="party" defaultValue={party} className="input-box" list="party-list" />
            <datalist id="party-list">
              {parties.map((p) => (
                <option key={p.code} value={p.description} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label block mb-1">Cont #</label>
            <input type="text" name="contNo" defaultValue={contNo} className="input-box mono" />
          </div>
          <div>
            <label className="label block mb-1">Sal Cont #</label>
            <input type="text" name="salContNo" defaultValue={salContNo} className="input-box mono" />
          </div>
          <div className="sm:col-span-6 flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/external/reports/grey-stock" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="border border-black p-4 mb-6 no-print">
          <div className="label mb-3">Reports</div>
          <div className="flex flex-wrap gap-2">
            {actionButtons.map((b) => (
              <a
                key={b.href}
                href={b.href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm"
              >
                {b.label}
              </a>
            ))}
            <Link href="/" className="btn btn-sm">Exit</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalRecords)}</div>
            <div className="stat-label">Total Records</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalMeter)}</div>
            <div className="stat-label">Total Meter</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalNetMeter)}</div>
            <div className="stat-label">Total Net Meter</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalBalance)}</div>
            <div className="stat-label">Total Balance</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>V.No</th>
                <th>V.Date</th>
                <th>KP No</th>
                <th>Purchase Party</th>
                <th>Gdn Party</th>
                <th>Dsp Quality</th>
                <th>Cont #</th>
                <th>Sal Cont #</th>
                <th className="text-right">Meter</th>
                <th className="text-right">Net Meter</th>
                <th className="text-right">Total</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center text-[var(--muted)] py-8">
                    No records found
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono text-[13px] font-bold">{r.vNo}</td>
                    <td className="mono text-[13px]">{r.vDate}</td>
                    <td className="mono text-[13px]">{r.kpNo ?? "-"}</td>
                    <td className="text-[13px]">
                      {r.purchaseParty ?? "-"}
                      {r.purchaseParty && partyCodeByName.get(r.purchaseParty) ? ` (${partyCodeByName.get(r.purchaseParty)})` : ""}
                    </td>
                    <td className="text-[13px]">
                      {r.gdnParty ?? "-"}
                      {r.gdnParty && partyCodeByName.get(r.gdnParty) ? ` (${partyCodeByName.get(r.gdnParty)})` : ""}
                    </td>
                    <td className="text-[13px]">
                      {r.dspQuality ?? "-"}
                      {r.dspQuality && greyDescMap.get(r.dspQuality) ? (
                        <div className="text-[11px] text-[var(--muted)]">{greyDescMap.get(r.dspQuality)}</div>
                      ) : null}
                    </td>
                    <td className="mono text-[13px]">{r.contNo ?? "-"}</td>
                    <td className="mono text-[13px]">{r.salContNo ?? "-"}</td>
                    <td className="mono text-right">{r.meter != null ? fmt(r.meter) : "-"}</td>
                    <td className="mono text-right">{r.netMeter != null ? fmt(r.netMeter) : "-"}</td>
                    <td className="mono text-right">{r.total != null ? fmt(r.total) : "-"}</td>
                    <td className="mono text-right font-bold">{r.balance != null ? fmt(r.balance) : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
