import Link from "next/link";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { and, gte, lte, eq } from "drizzle-orm";
import { DateBox } from "@/components/date-box";
import { requireSession } from "@/lib/auth";
import { countLabelMap } from "@/lib/grey-quality";
import { readFilters, loadRegister, totalsOf, filterText } from "./voucher-register";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) => new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const TYPE_OPTIONS = [
  { value: "", label: "All - Purchase & Sale" },
  { value: "PUR", label: "PUR - Purchase only" },
  { value: "SAL", label: "SAL - Sale only" },
];

export default async function YarnRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    party?: string;
    count?: string;
    brand?: string;
    type?: string;
    rate?: string;
  }>;
}) {
  await requireSession();
  const params = await searchParams;

  // The list is the voucher register: every yarn purchase / sale line that
  // matches the filters, whichever of them are filled (owner 2026-10-23 —
  // count + brand + rate, or brand alone, or rate alone, or party + rate …).
  // Contracts are almost never booked, so the old contract list stayed empty.
  const f = readFilters(params);
  const { from, to, party, count, brand, type } = f;
  const rateRaw = params.rate?.trim() ?? "";

  const accountRows = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts);
  const partyDescByCode = new Map(accountRows.map((r) => [r.code, r.description]));
  const countLookup = await db
    .select({
      countCode: schema.yarnCounts.countCode,
      description: schema.yarnCounts.description,
      type: schema.yarnCounts.type,
    })
    .from(schema.yarnCounts);
  // Code + name + blend: "12 — 36/S PV" and "21 — 36/s" hid that 12 is
  // PV 80;20 and 21 is PV 90;10, and the wrong one got picked.
  const countLabels = countLabelMap(countLookup);

  const [purAll, salAll] = await Promise.all([
    db
      .select({
        partyCode: schema.extYarnPurContract.partyCode,
        countCode: schema.extYarnPurContract.countCode,
        brand: schema.extYarnPurContract.brand,
      })
      .from(schema.extYarnPurContract)
      .where(and(gte(schema.extYarnPurContract.contDate, from), lte(schema.extYarnPurContract.contDate, to))),
    db
      .select({
        partyCode: schema.extYarnSalContract.partyCode,
        countCode: schema.extYarnSalContract.countCode,
        brand: schema.extYarnSalContract.brand,
      })
      .from(schema.extYarnSalContract)
      .where(and(gte(schema.extYarnSalContract.contDate, from), lte(schema.extYarnSalContract.contDate, to))),
  ]);
  // The reports read the vouchers, so their parties / counts / brands must be
  // pickable too. A voucher stores the party NAME; offer its account code.
  const codeByPartyDesc = new Map(accountRows.map((r) => [r.description, r.code]));
  const [purVch, salVch] = await Promise.all([
    db
      .select({ party: schema.extYarnPurVoucher.party, countCode: schema.extYarnPurVoucherLine.count, brand: schema.extYarnPurVoucherLine.brand })
      .from(schema.extYarnPurVoucherLine)
      .innerJoin(schema.extYarnPurVoucher, eq(schema.extYarnPurVoucher.id, schema.extYarnPurVoucherLine.voucherId))
      .where(and(gte(schema.extYarnPurVoucher.vDate, from), lte(schema.extYarnPurVoucher.vDate, to))),
    db
      .select({ party: schema.extYarnSalVoucher.party, countCode: schema.extYarnSalVoucherLine.count, brand: schema.extYarnSalVoucherLine.brand })
      .from(schema.extYarnSalVoucherLine)
      .innerJoin(schema.extYarnSalVoucher, eq(schema.extYarnSalVoucher.id, schema.extYarnSalVoucherLine.voucherId))
      .where(and(gte(schema.extYarnSalVoucher.vDate, from), lte(schema.extYarnSalVoucher.vDate, to))),
  ]);
  const optionRows = [
    ...purAll,
    ...salAll,
    ...[...purVch, ...salVch].map((r) => ({
      partyCode: r.party ? codeByPartyDesc.get(r.party) ?? r.party : null,
      countCode: r.countCode,
      brand: r.brand,
    })),
  ];
  const uniq = (xs: Array<string | null>) =>
    Array.from(new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );

  const partyOptions = uniq(optionRows.map((r) => r.partyCode)).map((c) => ({
    value: c,
    label: partyDescByCode.get(c) ?? c,
    desc: c,
  }));
  const scoped = party ? optionRows.filter((r) => (r.partyCode ?? "") === party) : optionRows;
  const countOptions = uniq(scoped.map((r) => r.countCode)).map((c) => ({
    value: c,
    label: countLabels.get(c) ? `${c} — ${countLabels.get(c)}` : c,
  }));
  const brandOptions = uniq(scoped.map((r) => r.brand)).map((b) => ({ value: b, label: b }));

  const { lines, partyLabel, countLabel } = await loadRegister(f);
  const pur = totalsOf(lines.filter((l) => l.type === "PUR"));
  const sal = totalsOf(lines.filter((l) => l.type === "SAL"));
  const vouchers = new Set(lines.map((l) => l.vNo)).size;
  const filterLine = filterText(f, partyLabel, countLabel);

  const excelRows = lines.map((l) => ({
    type: l.type,
    vNo: l.vNo,
    vDate: l.vDate,
    party: l.party,
    count: l.countLabel,
    brand: l.brand,
    doNo: l.doNo,
    bags: l.bags,
    lbs: l.lbs,
    rate: l.rate,
    amount: l.amount,
  }));

  return (
    <Shell active="ext-r-yarnreg">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Yarn Register</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {vouchers} voucher{vouchers === 1 ? "" : "s"} &middot; {filterLine}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "type", label: "Type" },
                { key: "vNo", label: "V.#" },
                { key: "vDate", label: "V. Date" },
                { key: "party", label: "Party" },
                { key: "count", label: "Count" },
                { key: "brand", label: "Brand" },
                { key: "doNo", label: "DO #" },
                { key: "bags", label: "Bags" },
                { key: "lbs", label: "Lbs" },
                { key: "rate", label: "Rate" },
                { key: "amount", label: "Amount" },
              ]}
              filename="yarn-register"
              sheetName="YarnRegister"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Yarn Register</h1>
          <div className="mono text-[12px] mt-2">
            {filterLine}
          </div>
        </div>

        <form id="yr-filter" method="GET" action="" className="border border-black p-4 mb-6 no-print">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="label block mb-1">Date From</label>
              <DateBox name="from" defaultValue={from} className="input-box mono" />
            </div>
            <div>
              <label className="label block mb-1">Date To</label>
              <DateBox name="to" defaultValue={to} className="input-box mono" />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">Party</label>
              <Combobox name="party" options={partyOptions} defaultValue={party} placeholder="All parties" />
            </div>
            <div className="sm:col-span-2">
              <label className="label block mb-1">Count</label>
              <Combobox name="count" options={countOptions} defaultValue={count} placeholder="All counts" />
            </div>
            <div>
              <label className="label block mb-1">Brand</label>
              <Combobox name="brand" options={brandOptions} defaultValue={brand} placeholder="All brands" />
            </div>
            <div>
              <label className="label block mb-1">Rate/Lbs</label>
              <input type="number" step="0.01" name="rate" defaultValue={rateRaw} className="input-box mono" placeholder="Any rate" />
            </div>
            <div>
              <label className="label block mb-1">Type</label>
              <select name="type" defaultValue={type} className="input-box">
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2">
              <button type="submit" className="btn btn-sm">Apply</button>
              <a href="/external/reports/yarn-register" className="btn btn-outline btn-sm">Clear</a>
            </div>
          </div>
        </form>

        <div className="border border-black p-4 mb-6 no-print">
          <div className="label mb-3">Actions</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <form method="GET" action="/external/reports/yarn-register/pur-cont-history" target="_blank" className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="label block mb-1">Pur Cont #</label>
                  <input type="text" name="contNo" className="input-box mono" placeholder="e.g. YPC-001" />
                </div>
                <button type="submit" className="btn btn-outline btn-sm">Pur Cont. History</button>
              </form>
              <form method="GET" action="/external/reports/yarn-register/sal-cont-history" target="_blank" className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="label block mb-1">Sal Cont #</label>
                  <input type="text" name="contNo" className="input-box mono" placeholder="e.g. YSC-001" />
                </div>
                <button type="submit" className="btn btn-outline btn-sm">Sal Cont. History</button>
              </form>
            </div>

            <div className="flex flex-col gap-3">
              {/* These submit the filter form as it stands — a date typed but not yet
                  applied still reaches the report (owner 2026-10-22). */}
              <div className="label">Reports (filters above)</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="submit" form="yr-filter" formAction="/external/reports/yarn-register/count-avg" formTarget="_blank" className="btn btn-outline btn-sm text-center">Count Avg</button>
                <button type="submit" form="yr-filter" formAction="/external/reports/yarn-register/count-list" formTarget="_blank" className="btn btn-outline btn-sm text-center">Count</button>
                <button type="submit" form="yr-filter" formAction="/external/reports/yarn-register/register-party" formTarget="_blank" className="btn btn-outline btn-sm text-center">Register/Party</button>
                <button type="submit" form="yr-filter" formAction="/external/reports/yarn-register/do-no" formTarget="_blank" className="btn btn-outline btn-sm text-center">DO No</button>
              </div>
              <Link href="/" className="btn btn-sm text-center">Exit</Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(vouchers)}</div>
            <div className="stat-label">Vouchers</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt2(pur.bags)} <span className="text-[12px] font-normal">bags</span></div>
            <div className="stat-label">Purchase · {fmt(pur.lbs)} lbs · Rs {fmt(pur.amount)}</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt2(sal.bags)} <span className="text-[12px] font-normal">bags</span></div>
            <div className="stat-label">Sale · {fmt(sal.lbs)} lbs · Rs {fmt(sal.amount)}</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt2(pur.bags - sal.bags)} <span className="text-[12px] font-normal">bags</span></div>
            <div className="stat-label">Balance · {fmt(pur.lbs - sal.lbs)} lbs</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>V.#</th>
                <th>V. Date</th>
                <th>Party</th>
                <th>Count</th>
                <th>Brand</th>
                <th>DO #</th>
                <th className="text-right">Bags</th>
                <th className="text-right">Lbs</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-[var(--muted)] py-8">
                    No yarn vouchers match these filters
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => (
                  <tr key={`${l.vNo}-${i}`}>
                    <td className="mono text-[12px] font-bold">{l.type}</td>
                    <td className="mono text-[13px] font-bold whitespace-nowrap">{l.vNo}</td>
                    <td className="mono text-[13px] whitespace-nowrap">{l.vDate}</td>
                    <td className="text-[13px]">{l.party || "-"}</td>
                    <td className="text-[13px]">{l.countLabel}</td>
                    <td className="text-[13px]">{l.brand || "-"}</td>
                    <td className="mono text-[13px]">{l.doNo}</td>
                    <td className="mono text-right">{fmt2(l.bags)}</td>
                    <td className="mono text-right">{fmt(l.lbs)}</td>
                    <td className="mono text-right">{fmt2(l.rate)}</td>
                    <td className="mono text-right font-bold">{fmt(l.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot>
                {[
                  ...(pur.lbs ? [{ name: "Purchase", t: pur }] : []),
                  ...(sal.lbs ? [{ name: "Sale", t: sal }] : []),
                ].map(({ name, t }) => (
                  <tr key={name} style={{ fontWeight: 700 }}>
                    <td colSpan={7} className="text-right">{name} total · avg rate {fmt2(t.avgRate)}</td>
                    <td className="mono text-right">{fmt2(t.bags)}</td>
                    <td className="mono text-right">{fmt(t.lbs)}</td>
                    <td></td>
                    <td className="mono text-right">{fmt(t.amount)}</td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
