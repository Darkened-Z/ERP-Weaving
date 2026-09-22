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

/** The money side of a sale party: what they were billed, and what they paid. */
const FINANCE_TYPES = ["CR", "CP", "BR", "BP", "JV"] as const;

/**
 * GREY REGISTER — SALE LEDGER.
 *
 * A sale party's account, told the way the mill reads it: every packi parchi
 * that went out to them, and every receipt, payment and journal that came back,
 * on one running balance.
 *
 * The cloth rows come from the packi parchi, not from the ledger narration —
 * so the line carries its contract, its grey construction taken FROM that
 * contract, and the than and metres that actually left. The money rows come
 * from the general ledger, so nothing can appear here that is not on the books.
 */
export default async function GreyRegisterSaleLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ party?: string; from?: string; to?: string }>;
}) {
  const p = await searchParams;
  const from = p.from?.trim() || monthsAgo(12);
  const to = p.to?.trim() || todayIso();
  const party = p.party?.trim() ?? "";

  // Sale parties are whoever a parchi has actually gone out to.
  const partyRows = await db
    .selectDistinct({ party: schema.extPackiParchi.saleParty })
    .from(schema.extPackiParchi);
  const partyOpts = partyRows
    .map((r) => (r.party ?? "").trim())
    .filter(Boolean)
    .sort()
    .map((v) => ({ value: v, label: v }));

  const accounts = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts);
  const codeByDesc = new Map(accounts.map((a) => [(a.description ?? "").trim(), a.code]));
  const partyCoa = party
    ? /^\d+(\.\d+)+$/.test(party)
      ? party
      : codeByDesc.get(party) ?? ""
    : "";

  // ── the cloth side: packi parchis that went to this party ──────────────────
  const parchiConds = [
    gte(schema.extPackiParchi.vDate, from),
    lte(schema.extPackiParchi.vDate, to),
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
          rate: schema.extPackiParchi.greyRateKp,
          quality: schema.extPackiParchi.quality,
          contSale: schema.extPackiParchi.convContNoSale,
          contSale2: schema.extPackiParchi.convContSale2,
          contConv: schema.extPackiParchi.convContNo,
        })
        .from(schema.extPackiParchi)
        .where(and(...parchiConds))
    : [];

  // Grey construction comes FROM the contract the parchi names, not from the
  // parchi's own quality field — the contract is what the party agreed to.
  const contractNos = Array.from(
    new Set(parchis.flatMap((r) => [r.contSale, r.contSale2, r.contConv].filter(Boolean) as string[])),
  );
  const convContracts = contractNos.length
    ? await db
        .select({
          contNo: schema.extGreyConvContract.contNo,
          grayQltyCode: schema.extGreyConvContract.grayQltyCode,
          grayCode: schema.extGreyConvContract.grayCode,
        })
        .from(schema.extGreyConvContract)
        .where(inArray(schema.extGreyConvContract.contNo, contractNos))
    : [];
  const salContracts = contractNos.length
    ? await db
        .select({
          contractNo: schema.extGreySalContract.contractNo,
          greyCode: schema.extGreySalContract.greyCode,
        })
        .from(schema.extGreySalContract)
        .where(inArray(schema.extGreySalContract.contractNo, contractNos))
    : [];

  const constructions = await db.select().from(schema.greyConstruction);
  const counts = await db
    .select({
      countCode: schema.yarnCounts.countCode,
      description: schema.yarnCounts.description,
      type: schema.yarnCounts.type,
    })
    .from(schema.yarnCounts);
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

  // ── the money side: receipts, payments and journals on the party's account ──
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
          ),
        )
    : [];

  type Line = {
    date: string;
    vno: string;
    narration: string;
    cont: string;
    than: number;
    mtr: number;
    rate: number;
    dr: number;
    cr: number;
    kind: "PP" | "FIN";
  };

  const lines: Line[] = [
    ...parchis.map((r) => {
      const cont = (r.contSale || r.contSale2 || r.contConv || "").trim();
      const mtr = r.meterNet ?? 0;
      const rate = r.rate ?? 0;
      return {
        date: r.vDate ?? "",
        vno: `${r.vNo ?? r.id}-PP`,
        narration: qualityOfContract.get(cont) ?? constrByCode.get(String(r.quality ?? "")) ?? "",
        cont,
        than: r.than ?? 0,
        mtr,
        rate,
        // The register prints what the cloth came to at its rate, the way the
        // mill's own sheet does: metres x conversion rate.
        dr: Math.round(mtr * rate * 100) / 100,
        cr: 0,
        kind: "PP" as const,
      };
    }),
    ...finance.map((r) => ({
      date: r.vdate ?? "",
      vno: `${r.vno}-${r.vtype}`,
      narration: (r.narration ?? "").trim(),
      cont: "",
      than: 0,
      mtr: 0,
      rate: 0,
      dr: r.debit ?? 0,
      cr: r.credit ?? 0,
      kind: "FIN" as const,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.vno.localeCompare(b.vno));

  // Accumulate inside the reduce rather than mutating a variable the render
  // closes over — the compiler rejects the latter, and this reads no worse.
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
    narration: r.narration,
    cont: r.cont,
    than: r.than,
    mtr: r.mtr,
    rate: r.rate,
    dr: Math.round(r.dr),
    cr: Math.round(r.cr),
    balance: Math.round(r.balance),
  }));

  return (
    <Shell active="ext-r-grey-sale-ledger">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4">
          <div>
            <h1 className="page-title">Grey Register — Sale Ledger</h1>
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
                { key: "narration", label: "Narration" },
                { key: "cont", label: "Conv Cont #" },
                { key: "than", label: "Than" },
                { key: "mtr", label: "Mtr" },
                { key: "rate", label: "Conv. Rate" },
                { key: "dr", label: "Dr" },
                { key: "cr", label: "Cr" },
                { key: "balance", label: "Balance" },
              ]}
              filename="grey-register-sale-ledger"
              title={`Grey Register - Sale Ledger - ${party}`}
            />
          </div>
        </div>

        <form method="GET" className="card p-4 mb-5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end no-print">
          <div className="sm:col-span-5">
            <label className="label block mb-1">Sale Party</label>
            <Combobox name="party" options={partyOpts} defaultValue={party} placeholder="Select party…" />
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
          <table style={{ minWidth: 1050 }}>
            <thead>
              <tr>
                <th className="text-right" style={{ width: 60 }}>Than</th>
                <th className="text-right" style={{ width: 80 }}>Mtr</th>
                <th style={{ width: 90 }}>Date</th>
                <th style={{ width: 90 }}>V.#</th>
                <th>Narration</th>
                <th style={{ width: 90 }}>Conv Cont #</th>
                <th className="text-right" style={{ width: 75 }}>Conv. Rate</th>
                <th className="text-right" style={{ width: 100 }}>Dr</th>
                <th className="text-right" style={{ width: 100 }}>Cr</th>
                <th className="text-right" style={{ width: 110 }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-[13px] text-[var(--muted)] py-8">
                    {party ? "No cloth or money on this party in the period." : "Pick a sale party above."}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={`${r.vno}-${i}`}>
                    <td className="mono text-right">{r.than ? fmt(r.than) : ""}</td>
                    <td className="mono text-right">{r.mtr ? fmt(r.mtr) : ""}</td>
                    <td className="mono text-[12px]">{r.date}</td>
                    <td className="mono text-[12px] font-bold">{r.vno}</td>
                    <td className="text-[12px]">{r.narration}</td>
                    <td className="mono text-[12px]">{r.cont}</td>
                    <td className="mono text-right">{r.rate ? fmt2(r.rate) : ""}</td>
                    <td className="mono text-right">{r.dr ? fmt(r.dr) : ""}</td>
                    <td className="mono text-right">{r.cr ? fmt(r.cr) : ""}</td>
                    <td className="mono text-right font-semibold">
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
                  <td className="mono text-right font-bold">{fmt(total.than)}</td>
                  <td className="mono text-right font-bold">{fmt(total.mtr)}</td>
                  <td colSpan={5} className="font-bold text-[12px] uppercase tracking-[0.05em]">
                    Closing Balance ({to})
                  </td>
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
