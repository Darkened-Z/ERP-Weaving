import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { DateBox } from "@/components/date-box";
import { db, schema } from "@/db";
import { and, eq, lte, gte } from "drizzle-orm";
import { today as todayIso } from "@/lib/time";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(Math.abs(n)));
const LEVELS = [2, 3, 4, 5] as const;

/**
 * ACCOUNT CLOSING BALANCE.
 *
 * Every head at the chosen level with what it closes on, and a way down into
 * it: a head opens its children, a detail account opens its ledger. So picking
 * LOCAL INVESTORS at the 4th level and pressing through lands on the same
 * account ledger the mill already reads, without hunting for the code.
 *
 * Balances roll UP from the detail rows by code prefix rather than being stored
 * on the head, so a head can never disagree with the accounts beneath it.
 */
export default async function AccountClosingBalancePage({
  searchParams,
}: {
  searchParams: Promise<{
    to?: string;
    from?: string;
    level?: string;
    head?: string;
    zero?: string;
    find?: string;
  }>;
}) {
  await requireSession();
  const p = await searchParams;
  const to = p.to?.trim() || todayIso();
  // "Transactions within date margin" on the mill's screen — when a From is
  // given the balance is the movement in that window, not everything to date.
  const from = p.from?.trim() ?? "";
  const head = p.head?.trim() ?? "";
  const zero = p.zero?.trim() || "non"; // non | only | all
  const find = p.find?.trim() ?? "";
  const level = Number(p.level ?? (head ? String(head.split(".").length + 1) : "4"));

  const accounts = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
      descShort: schema.chartOfAccounts.descShort,
      level: schema.chartOfAccounts.level,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.code);

  const conds = [lte(schema.transMain.vdate, to)];
  if (from) conds.push(gte(schema.transMain.vdate, from));
  const detail = await db
    .select({
      accCode: schema.transDetail.accCode,
      debit: schema.transDetail.debit,
      credit: schema.transDetail.credit,
    })
    .from(schema.transDetail)
    .innerJoin(
      schema.transMain,
      and(
        eq(schema.transDetail.fyCode, schema.transMain.fyCode),
        eq(schema.transDetail.vtype, schema.transMain.vtype),
        eq(schema.transDetail.vno, schema.transMain.vno),
      ),
    )
    .where(and(...conds));

  // Net per detail account, then rolled up into whatever level is being shown.
  const netByAccount = new Map<string, number>();
  for (const d of detail) {
    netByAccount.set(d.accCode, (netByAccount.get(d.accCode) ?? 0) + (d.debit ?? 0) - (d.credit ?? 0));
  }
  const cut = (code: string, lv: number) => code.split(".").slice(0, lv).join(".");
  const rolled = new Map<string, number>();
  for (const [code, net] of netByAccount) {
    const key = cut(code, level);
    rolled.set(key, (rolled.get(key) ?? 0) + net);
  }

  const rows = accounts
    .filter((a) => (a.level ?? 0) === level)
    .filter((a) => !head || (a.code ?? "").startsWith(`${head}.`) || a.code === head)
    .map((a) => ({
      code: a.code,
      name: a.description ?? a.code,
      short: (a.descShort ?? "").trim(),
      balance: rolled.get(a.code) ?? 0,
    }))
    .filter((r) => {
      if (zero === "only") return Math.abs(r.balance) <= 0.01;
      if (zero === "non") return Math.abs(r.balance) > 0.01;
      return true;
    })
    .filter((r) => {
      if (!find) return true;
      const q = find.toLowerCase();
      return (
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.short.toLowerCase().includes(q)
      );
    });

  const total = rows.reduce((s, r) => s + r.balance, 0);
  const keep = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (to) q.set("to", to);
    if (from) q.set("from", from);
    if (zero) q.set("zero", zero);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return `?${q.toString()}`;
  };

  const crumbs = head
    ? head.split(".").map((_, i) => {
        const code = head.split(".").slice(0, i + 1).join(".");
        return { code, name: accounts.find((a) => a.code === code)?.description ?? code };
      })
    : [];

  return (
    <Shell active="fin-acc-closing">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Account Closing Balance</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              Level {level} &middot; upto {to}
              {from ? ` (movement from ${from})` : ""} &middot; {rows.length} account
              {rows.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex gap-2 no-print">
            <PrintButton label="Print" />
            <ExcelExportButton
              rows={rows.map((r) => ({ code: r.code, short: r.short, name: r.name, balance: Math.round(r.balance) }))}
              columns={[
                { key: "code", label: "Code" },
                { key: "short", label: "Short Tittle" },
                { key: "name", label: "Tittle" },
                { key: "balance", label: "Closing Balance" },
              ]}
              filename="account-closing-balance"
              title="Account Closing Balance"
            />
          </div>
        </div>

        <form method="GET" className="card p-4 mb-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end no-print">
          <div className="sm:col-span-2">
            <label className="label block mb-1">Upto Date</label>
            <DateBox name="to" className="input-box mono" defaultValue={to} />
          </div>
          <div className="sm:col-span-2">
            <label className="label block mb-1">
              Date From <span className="text-[9px] text-[var(--muted)]">(optional)</span>
            </label>
            <DateBox name="from" className="input-box mono" defaultValue={from} />
          </div>
          <div className="sm:col-span-2">
            <label className="label block mb-1">Level</label>
            <select name="level" className="input-box mono" defaultValue={String(level)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l === 2 ? "2 — All Head" : `${l}${l === 4 ? " — 4th Level" : ""}`}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label block mb-1">Balances</label>
            <select name="zero" className="input-box mono" defaultValue={zero}>
              <option value="non">Non-zero only (W.O.Z)</option>
              <option value="only">Zero only</option>
              <option value="all">All</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <label className="label block mb-1">Find</label>
            <input name="find" className="input-box mono" defaultValue={find} placeholder="code / title" />
          </div>
          <input type="hidden" name="head" value={head} />
          <div className="sm:col-span-1">
            <button type="submit" className="btn btn-sm w-full">View</button>
          </div>
        </form>

        {head && (
          <div className="mb-3 text-[12px] mono no-print">
            <a href={keep({ level: "2" })} className="underline">All heads</a>
            {crumbs.map((c) => (
              <span key={c.code}>
                {" / "}
                <a href={keep({ head: c.code })} className="underline">
                  {c.name}
                </a>
              </span>
            ))}
          </div>
        )}

        <div className="card overflow-x-auto">
          <table style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ width: 140 }}>Code</th>
                <th style={{ width: 180 }}>Short Tittle</th>
                <th>Tittle</th>
                <th className="text-right" style={{ width: 160 }}>Closing Balance</th>
                <th className="no-print" style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-[13px] text-[var(--muted)] py-8">
                    No accounts at this level{zero === "non" ? " with a balance" : ""}.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.code}>
                    <td className="mono text-[12px]">{r.code}</td>
                    <td className="text-[12px]">{r.short}</td>
                    <td className="text-[13px]">{r.name}</td>
                    <td className="mono text-right font-semibold">
                      {fmt(r.balance)}{" "}
                      <span className="text-[10px] text-[var(--muted)]">
                        {r.balance >= 0 ? "Dr" : "Cr"}
                      </span>
                    </td>
                    <td className="no-print text-right whitespace-nowrap">
                      {/* A head opens what is under it; a detail account opens
                          its ledger. Same arrow either way. */}
                      {level < 5 ? (
                        <a
                          href={keep({ head: r.code, level: String(level + 1) })}
                          className="btn btn-outline btn-xs"
                          title="Open the accounts under this head"
                        >
                          &gt;
                        </a>
                      ) : (
                        <a
                          href={`/ledger?account=${encodeURIComponent(r.code)}&to=${to}${from ? `&from=${from}` : ""}`}
                          className="btn btn-outline btn-xs"
                          title="Open this account's ledger"
                        >
                          &gt;
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={3}>Total</td>
                  <td className="mono text-right">
                    {fmt(total)}{" "}
                    <span className="text-[10px] text-[var(--muted)]">{total >= 0 ? "Dr" : "Cr"}</span>
                  </td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
