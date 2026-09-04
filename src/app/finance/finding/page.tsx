import { Shell } from "@/components/shell";
import { Combobox } from "@/components/combobox";
import { db, schema } from "@/db";
import { requireSession } from "@/lib/auth";
import { and, desc, eq, gte, lte, inArray, sql, type SQL } from "drizzle-orm";
import { escLike, fmtMoney as formatNum } from "@/lib/form";

export const dynamic = "force-dynamic";

const VTYPES = ["CR", "CP", "BR", "BP", "JV", "PR", "PC"] as const;
const VTYPE_LABEL: Record<string, string> = {
  CR: "Cash Receipt",
  CP: "Cash Payment",
  BR: "Bank Receipt",
  BP: "Bank Payment",
  JV: "Journal",
  PR: "Petty Receipt",
  PC: "Petty Payment",
};
const VTYPE_ROUTE: Record<string, string> = {
  CR: "/finance/cr",
  CP: "/finance/cp",
  BR: "/finance/br",
  BP: "/finance/bp",
  JV: "/finance/jv",
  PR: "/finance/pr",
  PC: "/finance/pc",
};

const trim = (s?: string) => (s ?? "").trim();
const numOrNull = (s?: string) => {
  const t = trim(s);
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

export default async function FindingPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    vtype?: string;
    vno?: string;
    acc?: string;
    amt_from?: string;
    amt_to?: string;
    narr?: string;
    chq?: string;
  }>;
}) {
  await requireSession();
  const p = await searchParams;
  const from = trim(p.from);
  const to = trim(p.to);
  const vtype = trim(p.vtype).toUpperCase();
  const vnoStr = trim(p.vno);
  const vno = numOrNull(vnoStr);
  const acc = trim(p.acc);
  const amtFrom = numOrNull(p.amt_from);
  const amtTo = numOrNull(p.amt_to);
  const narr = trim(p.narr);
  const chq = trim(p.chq);

  const [company] = await db
    .select({ currentFy: schema.companyProfile.currentFy })
    .from(schema.companyProfile)
    .limit(1);
  const fyCode = company?.currentFy ?? "";

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
    })
    .from(schema.chartOfAccounts)
    .where(gte(schema.chartOfAccounts.level, 4))
    .orderBy(schema.chartOfAccounts.code);
  const partyOpts = parties.map((a) => ({
    value: a.code,
    label: `${a.code} — ${a.description}`,
  }));
  const partyMap = new Map(parties.map((a) => [a.code, a.description]));

  const hasAnyFilter =
    !!(from || to || vnoStr || acc || p.amt_from || p.amt_to || narr || chq || vtype);

  const vtypeList: readonly string[] =
    vtype && VTYPES.includes(vtype as (typeof VTYPES)[number]) ? [vtype] : VTYPES;

  const narrPat = narr ? `%${escLike(narr)}%` : "";
  const chqPat = chq ? `%${escLike(chq)}%` : "";

  const detailExists = (extra: SQL) =>
    sql`EXISTS (SELECT 1 FROM ${schema.transDetail} d WHERE d.fy_code = ${schema.transMain.fyCode} AND d.vtype = ${schema.transMain.vtype} AND d.vno = ${schema.transMain.vno} AND ${extra})`;

  const filters = [
    inArray(schema.transMain.vtype, [...vtypeList]),
    fyCode ? eq(schema.transMain.fyCode, fyCode) : undefined,
    from ? gte(schema.transMain.vdate, from) : undefined,
    to ? lte(schema.transMain.vdate, to) : undefined,
    vno != null ? eq(schema.transMain.vno, vno) : undefined,
    amtFrom != null ? gte(schema.transMain.balanceAmount, amtFrom) : undefined,
    amtTo != null ? lte(schema.transMain.balanceAmount, amtTo) : undefined,
    acc
      ? detailExists(sql`d.acc_code = ${acc}`)
      : undefined,
    chq
      ? detailExists(sql`d.chq_no LIKE ${chqPat} ESCAPE '\\'`)
      : undefined,
    narr
      ? sql`(${schema.transMain.narration} LIKE ${narrPat} ESCAPE '\\' OR ${detailExists(sql`d.narration LIKE ${narrPat} ESCAPE '\\'`)})`
      : undefined,
  ];

  const rows = hasAnyFilter
    ? await db
        .select()
        .from(schema.transMain)
        .where(and(...filters))
        .orderBy(desc(schema.transMain.vdate), desc(schema.transMain.id))
        .limit(500)
    : [];

  const totalMap = new Map<number, number>();
  const partyByVoucher = new Map<number, string>();
  if (rows.length > 0) {
    const vnoByKey = new Map<string, number[]>();
    for (const r of rows) {
      const k = `${r.fyCode}|${r.vtype}`;
      if (!vnoByKey.has(k)) vnoByKey.set(k, []);
      vnoByKey.get(k)!.push(r.vno);
    }
    type DetailRow = {
      fy: string;
      vtype: string;
      vno: number;
      accCode: string;
      srno: number;
      debit: number | null;
      credit: number | null;
    };
    const detailGroups = await Promise.all(
      Array.from(vnoByKey.entries()).map(([k, vnos]) => {
        const [fy, vt] = k.split("|");
        return db
          .select({
            fy: schema.transDetail.fyCode,
            vtype: schema.transDetail.vtype,
            vno: schema.transDetail.vno,
            accCode: schema.transDetail.accCode,
            srno: schema.transDetail.srno,
            debit: schema.transDetail.debit,
            credit: schema.transDetail.credit,
          })
          .from(schema.transDetail)
          .where(
            and(
              eq(schema.transDetail.fyCode, fy),
              eq(schema.transDetail.vtype, vt),
              inArray(schema.transDetail.vno, vnos)
            )
          )
          .orderBy(schema.transDetail.srno);
      })
    );
    const detailMap = new Map<string, DetailRow[]>();
    for (const group of detailGroups) {
      for (const d of group) {
        const k = `${d.fy}|${d.vtype}|${d.vno}`;
        if (!detailMap.has(k)) detailMap.set(k, []);
        detailMap.get(k)!.push(d);
      }
    }
    for (const r of rows) {
      const list = detailMap.get(`${r.fyCode}|${r.vtype}|${r.vno}`) ?? [];
      const total = list.reduce((s, d) => s + (d.debit ?? 0), 0);
      totalMap.set(r.id, total || r.balanceAmount || 0);
      const head = list.find((d) => d.srno < 50 && d.accCode !== r.accCode) ?? list[0];
      if (head) partyByVoucher.set(r.id, head.accCode);
    }
  }

  const perVtype = new Map<string, number>();
  for (const v of VTYPES) perVtype.set(v, 0);
  for (const r of rows) perVtype.set(r.vtype, (perVtype.get(r.vtype) ?? 0) + 1);

  return (
    <Shell active="finding">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">FIND&nbsp;&nbsp;VOUCHER</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              FY {fyCode} · Global search across CR / CP / BR / BP / JV / PR / PC
            </p>
          </div>
          <div className="text-[11px] mono text-[var(--muted)]">
            {hasAnyFilter ? `${rows.length} match${rows.length === 1 ? "" : "es"}` : "Enter filters and click Find"}
          </div>
        </div>

        <form method="GET" action="/finance/finding" className="border border-black p-6 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-3 gap-y-3">
            <div className="lg:col-span-2">
              <label className="label block mb-1">Date From</label>
              <input name="from" type="date" className="input-box mono" defaultValue={from} />
            </div>
            <div className="lg:col-span-2">
              <label className="label block mb-1">Date To</label>
              <input name="to" type="date" className="input-box mono" defaultValue={to} />
            </div>
            <div className="lg:col-span-2">
              <label className="label block mb-1">V. Type</label>
              <select name="vtype" className="input-box mono" defaultValue={vtype}>
                <option value="">ALL</option>
                {VTYPES.map((v) => (
                  <option key={v} value={v}>
                    {v} — {VTYPE_LABEL[v]}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="label block mb-1">V. No</label>
              <input name="vno" type="number" className="input-box mono" defaultValue={vnoStr} />
            </div>
            <div className="lg:col-span-2">
              <label className="label block mb-1">Amount From</label>
              <input name="amt_from" type="number" step="any" className="input-box mono text-right" defaultValue={p.amt_from ?? ""} />
            </div>
            <div className="lg:col-span-2">
              <label className="label block mb-1">Amount To</label>
              <input name="amt_to" type="number" step="any" className="input-box mono text-right" defaultValue={p.amt_to ?? ""} />
            </div>

            <div className="lg:col-span-4">
              <label className="label block mb-1">Party / Account (F9)</label>
              <Combobox name="acc" options={partyOpts} defaultValue={acc} placeholder="Any account" />
            </div>
            <div className="lg:col-span-4">
              <label className="label block mb-1">Narration contains</label>
              <input name="narr" className="input-box mono" defaultValue={narr} />
            </div>
            <div className="lg:col-span-2">
              <label className="label block mb-1">Chq. No</label>
              <input name="chq" className="input-box mono" defaultValue={chq} />
            </div>
            <div className="lg:col-span-2 flex items-end gap-2">
              <button type="submit" className="btn btn-sm">Find</button>
              <a href="/finance/finding" className="btn btn-outline btn-sm">Clear</a>
            </div>
          </div>
        </form>

        {hasAnyFilter && (
          <div className="border border-black mb-6">
            <div className="px-4 py-2 border-b border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
              Summary by voucher type
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-0">
              {VTYPES.map((v) => (
                <div key={v} className="border-r border-b border-black last:border-r-0 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--muted)]">{v}</div>
                  <div className="mono text-[15px]">{perVtype.get(v) ?? 0}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border border-black">
          <div className="px-4 py-3 border-b-2 border-black text-[11px] uppercase tracking-[0.1em] font-semibold">
            Results
          </div>
          <div className="overflow-x-auto" style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>V.Type</th>
                  <th>V.No</th>
                  <th>Date</th>
                  <th>Party (contra)</th>
                  <th>Trn.Type</th>
                  <th>Narration</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const href = `${VTYPE_ROUTE[r.vtype] ?? "/vouchers"}?id=${r.id}`;
                  const partyCode = r.accCode ?? partyByVoucher.get(r.id) ?? "";
                  const partyDescText = partyCode ? partyMap.get(partyCode) ?? "" : "";
                  return (
                    <tr key={r.id} className="cursor-pointer hover:bg-gray-50">
                      <td className="mono text-[12px]"><a href={href} className="no-underline block">{r.vtype}</a></td>
                      <td className="mono text-[13px]"><a href={href} className="no-underline block">{r.vno}</a></td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block">{r.vdate}</a></td>
                      <td className="text-[12px]">
                        <a href={href} className="no-underline block">
                          {partyCode ? (
                            <>
                              <span className="mono">{partyCode}</span>
                              <span className="text-[11px] text-[var(--muted)] ml-1">
                                — {partyDescText}
                              </span>
                            </>
                          ) : (
                            "-"
                          )}
                        </a>
                      </td>
                      <td className="mono text-[12px]"><a href={href} className="no-underline block">{r.trnType ?? "-"}</a></td>
                      <td className="text-[13px]"><a href={href} className="no-underline block">{r.narration ?? "-"}</a></td>
                      <td className="text-right mono text-[13px]"><a href={href} className="no-underline block">{formatNum(totalMap.get(r.id))}</a></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-[13px] text-[var(--muted)] py-6">
                      {hasAnyFilter ? "No vouchers match these filters." : "Enter filters above and click Find."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
