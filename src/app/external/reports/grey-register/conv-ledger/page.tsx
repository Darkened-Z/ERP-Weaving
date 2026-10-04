import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { Combobox } from "@/components/combobox";
import { DateBox } from "@/components/date-box";
import { db, schema } from "@/db";
import { and, gte, lte, eq, inArray, sql } from "drizzle-orm";
import { today as todayIso, monthsAgo } from "@/lib/time";
import { countLabelMap, fullConstruction } from "@/lib/grey-quality";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

const FINANCE_TYPES = ["CR", "CP", "BR", "BP", "JV"] as const;

export default async function GreyRegisterConvLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ party?: string; from?: string; to?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || monthsAgo(12);
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";

  const [partyRows, accounts, financePartyCodes] = await Promise.all([
    db
      .selectDistinct({ party: schema.extPackiParchi.saleParty })
      .from(schema.extPackiParchi)
      .where(sql`${schema.extPackiParchi.convRate} IS NOT NULL AND ${schema.extPackiParchi.convRate} > 0`),
    db
      .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
      .from(schema.chartOfAccounts),
    db
      .selectDistinct({ accCode: schema.transDetail.accCode })
      .from(schema.transDetail)
      .where(
        and(
          inArray(schema.transDetail.vtype, [...FINANCE_TYPES]),
          sql`${schema.transDetail.accCode} LIKE '1.01.01.%'`,
        ),
      ),
  ]);
  const codeByDesc = new Map(accounts.map((a) => [(a.description ?? "").trim(), a.code]));
  const descByCode = new Map(accounts.map((a) => [a.code, (a.description ?? "").trim()]));
  const ppParties = new Set(partyRows.map((r) => (r.party ?? "").trim()).filter(Boolean));
  for (const r of financePartyCodes) {
    const desc = descByCode.get(r.accCode ?? "");
    if (desc && !ppParties.has(desc)) ppParties.add(desc);
  }
  const partyOpts = Array.from(ppParties).sort().map((v) => ({ value: v, label: v }));
  const partyCoa = party
    ? /^\d+(\.\d+)+$/.test(party)
      ? party
      : codeByDesc.get(party) ?? ""
    : "";

  const parchiConds = [
    gte(schema.extPackiParchi.vDate, from),
    lte(schema.extPackiParchi.vDate, to),
    sql`${schema.extPackiParchi.convRate} IS NOT NULL AND ${schema.extPackiParchi.convRate} > 0`,
  ];
  if (party) {
    const pat = `%${escLike(party)}%`;
    parchiConds.push(sql`${schema.extPackiParchi.saleParty} LIKE ${pat} ESCAPE '\\'`);
  }
  const parchis = party
    ? await db
        .select({
          id: schema.extPackiParchi.id,
          vNo: schema.extPackiParchi.vNo,
          vDate: schema.extPackiParchi.vDate,
          than: schema.extPackiParchi.than,
          meterNet: schema.extPackiParchi.meterNet,
          convRate: schema.extPackiParchi.convRate,
          convAmount: schema.extPackiParchi.convAmount,
          quality: schema.extPackiParchi.quality,
          convContNo: schema.extPackiParchi.convContNo,
          convContNoSale: schema.extPackiParchi.convContNoSale,
          convContSale2: schema.extPackiParchi.convContSale2,
        })
        .from(schema.extPackiParchi)
        .where(and(...parchiConds))
    : [];

  const contractNos = Array.from(
    new Set(parchis.flatMap((r) => [r.convContNo, r.convContNoSale, r.convContSale2].filter(Boolean) as string[])),
  );
  const [convContracts, salContracts, constructions, counts] = await Promise.all([
    contractNos.length
      ? db
          .select({
            contNo: schema.extGreyConvContract.contNo,
            grayQltyCode: schema.extGreyConvContract.grayQltyCode,
            grayCode: schema.extGreyConvContract.grayCode,
          })
          .from(schema.extGreyConvContract)
          .where(inArray(schema.extGreyConvContract.contNo, contractNos))
      : Promise.resolve([]),
    contractNos.length
      ? db
          .select({
            contractNo: schema.extGreySalContract.contractNo,
            greyCode: schema.extGreySalContract.greyCode,
          })
          .from(schema.extGreySalContract)
          .where(inArray(schema.extGreySalContract.contractNo, contractNos))
      : Promise.resolve([]),
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
    constructions.map((g) => [String(g.code), fullConstruction(g, countLabels) || g.description || String(g.code)]),
  );
  const qualityOfContract = new Map<string, string>();
  for (const c of convContracts) {
    const code = c.grayQltyCode ?? c.grayCode ?? "";
    if (c.contNo) qualityOfContract.set(c.contNo, constrByCode.get(String(code)) ?? String(code));
  }
  for (const c of salContracts) {
    if (c.contractNo && !qualityOfContract.has(c.contractNo)) {
      qualityOfContract.set(c.contractNo, constrByCode.get(String(c.greyCode)) ?? String(c.greyCode ?? ""));
    }
  }

  const finance = partyCoa
    ? await db
        .select({
          vtype: schema.transDetail.vtype,
          vno: schema.transDetail.vno,
          vdate: schema.transMain.vdate,
          narration: schema.transDetail.narration,
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
        .where(
          and(
            eq(schema.transDetail.accCode, partyCoa),
            inArray(schema.transDetail.vtype, [...FINANCE_TYPES]),
            gte(schema.transMain.vdate, from),
            lte(schema.transMain.vdate, to),
            sql`COALESCE(${schema.transMain.trnType}, '') != 'ADJUSTMENT'`,
          ),
        )
    : [];

  type Line = {
    date: string;
    vno: string;
    narration: string;
    convCont: string;
    saleCont: string;
    than: number;
    mtr: number;
    rate: number;
    dr: number;
    cr: number;
    kind: "PP" | "FIN";
  };

  const lines: Line[] = [
    ...parchis.map((r) => {
      const mtr = r.meterNet ?? 0;
      const rate = r.convRate ?? 0;
      const dr = r.convAmount ?? Math.round(mtr * rate * 100) / 100;
      return {
        date: r.vDate ?? "",
        vno: `${r.vNo ?? r.id}-PP`,
        narration:
          qualityOfContract.get(r.convContNo ?? "") ??
          qualityOfContract.get(r.convContNoSale ?? "") ??
          constrByCode.get(String(r.quality ?? "")) ??
          "",
        convCont: (r.convContNo ?? "").trim(),
        saleCont: (r.convContNoSale ?? r.convContSale2 ?? "").trim(),
        than: r.than ?? 0,
        mtr,
        rate,
        dr,
        cr: 0,
        kind: "PP" as const,
      };
    }),
    ...finance.map((r) => ({
      date: r.vdate ?? "",
      vno: `${r.vno}-${r.vtype}`,
      narration: (r.narration ?? "").trim(),
      convCont: "",
      saleCont: "",
      than: 0,
      mtr: 0,
      rate: 0,
      dr: r.debit ?? 0,
      cr: r.credit ?? 0,
      kind: "FIN" as const,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.vno.localeCompare(b.vno));

  const rows = lines.reduce<(Line & { balance: number })[]>((acc, l) => {
    const balance = (acc[acc.length - 1]?.balance ?? 0) + l.dr - l.cr;
    acc.push({ ...l, balance });
    return acc;
  }, []);
  const running = rows[rows.length - 1]?.balance ?? 0;

  const total = rows.reduce(
    (t, r) => ({ than: t.than + r.than, mtr: t.mtr + r.mtr, dr: t.dr + r.dr, cr: t.cr + r.cr }),
    { than: 0, mtr: 0, dr: 0, cr: 0 },
  );

  const excelRows = rows.map((r) => ({
    date: r.date,
    vno: r.vno,
    convCont: r.convCont,
    saleCont: r.saleCont,
    narration: r.narration,
    than: r.than,
    mtr: r.mtr,
    rate: r.rate,
    dr: Math.round(r.dr),
    cr: Math.round(r.cr),
    balance: Math.round(r.balance),
  }));

  return (
    <Shell active="ext-r-grey-conv-ledger">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Grey Register &mdash; Conversion Ledger</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {party || "pick a party"} &middot; {rows.length} lines &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 no-print">
            <PrintButton label="Print" />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "date", label: "Date" },
                { key: "vno", label: "V.#" },
                { key: "convCont", label: "Conv Cont #" },
                { key: "saleCont", label: "Sale Cont #" },
                { key: "narration", label: "Narration" },
                { key: "than", label: "Than" },
                { key: "mtr", label: "Mtr" },
                { key: "rate", label: "Conv. Rate" },
                { key: "dr", label: "Dr" },
                { key: "cr", label: "Cr" },
                { key: "balance", label: "Balance" },
              ]}
              filename="grey-register-conv-ledger"
              title={`Grey Register - Conversion Ledger - ${party}`}
            />
          </div>
        </div>

        <form method="GET" className="card p-4 mb-5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end no-print">
          <div className="sm:col-span-5">
            <label className="label block mb-1">Conversion Party</label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="Select party..." />
          </div>
          <div className="sm:col-span-3">
            <label className="label block mb-1">Date From</label>
            <DateBox name="from" className="input-box mono" defaultValue={from} />
          </div>
          <div className="sm:col-span-3">
            <label className="label block mb-1">Date To</label>
            <DateBox name="to" className="input-box mono" defaultValue={to} />
          </div>
          <div className="sm:col-span-1">
            <button type="submit" className="btn btn-sm w-full">View</button>
          </div>
        </form>

        <div className="card overflow-x-auto">
          <table className="sm:min-w-[1150px]">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Date</th>
                <th style={{ width: 80 }}>V.#</th>
                <th className="hidden sm:table-cell" style={{ width: 80 }}>Conv Cont #</th>
                <th className="hidden sm:table-cell" style={{ width: 80 }}>Sale Cont #</th>
                <th>Narration</th>
                <th className="hidden sm:table-cell text-right" style={{ width: 60 }}>Than</th>
                <th className="text-right" style={{ width: 70 }}>Mtr</th>
                <th className="hidden sm:table-cell text-right" style={{ width: 70 }}>Conv. Rate</th>
                <th className="text-right" style={{ width: 90 }}>Dr</th>
                <th className="text-right" style={{ width: 90 }}>Cr</th>
                <th className="text-right" style={{ width: 100 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-[13px] text-[var(--muted)] py-8">
                    {party ? "No conversion or payment entries for this party in the period." : "Pick a conversion party above."}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.vno}-${i}`}>
                    <td className="mono text-[11px] sm:text-[12px]">{r.date}</td>
                    <td className="mono text-[11px] sm:text-[12px] font-bold">{r.vno}</td>
                    <td className="hidden sm:table-cell mono text-[12px]">{r.convCont}</td>
                    <td className="hidden sm:table-cell mono text-[12px]">{r.saleCont}</td>
                    <td className="text-[11px] sm:text-[12px] max-w-[120px] sm:max-w-none truncate">{r.narration}</td>
                    <td className="hidden sm:table-cell mono text-right">{r.than ? fmt(r.than) : ""}</td>
                    <td className="mono text-right text-[11px] sm:text-[13px]">{r.mtr ? fmt(r.mtr) : ""}</td>
                    <td className="hidden sm:table-cell mono text-right">{r.rate ? fmt2(r.rate) : ""}</td>
                    <td className="mono text-right text-[11px] sm:text-[13px]">{r.dr ? fmt(r.dr) : ""}</td>
                    <td className="mono text-right text-[11px] sm:text-[13px]">{r.cr ? fmt(r.cr) : ""}</td>
                    <td className="mono text-right font-semibold text-[11px] sm:text-[13px]">
                      {fmt(Math.abs(r.balance))}{" "}
                      <span className="text-[10px] text-[var(--muted)]">{r.balance >= 0 ? "Dr" : "Cr"}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-black">
                  <td colSpan={2} className="font-bold text-[11px] sm:text-[12px] uppercase tracking-[0.05em]">
                    Closing ({to})
                  </td>
                  <td className="hidden sm:table-cell" />
                  <td className="hidden sm:table-cell" />
                  <td />
                  <td className="hidden sm:table-cell mono text-right font-bold">{fmt(total.than)}</td>
                  <td className="mono text-right font-bold">{fmt(total.mtr)}</td>
                  <td className="hidden sm:table-cell" />
                  <td className="mono text-right font-bold">{fmt(total.dr)}</td>
                  <td className="mono text-right font-bold">{fmt(total.cr)}</td>
                  <td className="mono text-right font-bold">
                    {fmt(Math.abs(running))}{" "}
                    <span className="text-[10px] text-[var(--muted)]">{running >= 0 ? "Dr" : "Cr"}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
