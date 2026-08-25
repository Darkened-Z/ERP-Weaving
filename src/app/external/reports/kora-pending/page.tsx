import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { sql, and, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));

function monthsBackFrom(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function toDate(iso: string | null | undefined): string {
  return iso ?? "";
}

type OptionKind = "KP" | "PP";

export default async function KoraPendingPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    purParty?: string;
    salParty?: string;
    option?: string;
  }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = (params.from && params.from.trim()) || monthsBackFrom(today, 6);
  const to = (params.to && params.to.trim()) || today;
  const purParty = (params.purParty ?? "").trim();
  const salParty = (params.salParty ?? "").trim();
  const optionRaw = (params.option ?? "").trim().toUpperCase();
  const option: OptionKind = optionRaw === "PP" ? "PP" : "KP";

  const parties = await db
    .select({
      code: schema.chartOfAccounts.code,
      description: schema.chartOfAccounts.description,
    })
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.description);

  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));
  const partyLabel = (name: string | null | undefined) => {
    if (!name) return "-";
    const code = partyCodeByDesc.get(name);
    return code ? `${name} (${code})` : name;
  };

  const purPartyPat = purParty ? `${escLike(purParty)}%` : "";
  const salPartyPat = salParty ? `${escLike(salParty)}%` : "";

  type Row = {
    id: number;
    vNo: string;
    vDate: string;
    subNo: string | null;
    purchaseParty: string | null;
    saleParty: string | null;
    meterA: number | null;
    meterB: number | null;
    convContNo: string | null;
  };

  let rows: Row[] = [];

  if (option === "KP") {
    const conditions = [
      gte(schema.extKachiParchi.vDate, from),
      lte(schema.extKachiParchi.vDate, to),
    ];
    if (purParty) {
      conditions.push(
        sql`${schema.extKachiParchi.purchaseParty} LIKE ${purPartyPat} ESCAPE '\\'`,
      );
    }
    if (salParty) {
      conditions.push(
        sql`${schema.extKachiParchi.saleParty} LIKE ${salPartyPat} ESCAPE '\\'`,
      );
    }
    const kpRows = await db
      .select({
        id: schema.extKachiParchi.id,
        vNo: schema.extKachiParchi.vNo,
        vDate: schema.extKachiParchi.vDate,
        kpNo: schema.extKachiParchi.kpNo,
        purchaseParty: schema.extKachiParchi.purchaseParty,
        saleParty: schema.extKachiParchi.saleParty,
        meter: schema.extKachiParchi.meter,
        totalElBadMtrs: schema.extKachiParchi.totalElBadMtrs,
        contNo: schema.extKachiParchi.contNo,
      })
      .from(schema.extKachiParchi)
      .where(and(...conditions))
      .orderBy(schema.extKachiParchi.vDate);

    rows = kpRows.map((r) => ({
      id: r.id,
      vNo: r.vNo,
      vDate: r.vDate,
      subNo: r.kpNo,
      purchaseParty: r.purchaseParty,
      saleParty: r.saleParty,
      meterA: r.meter,
      meterB: r.totalElBadMtrs,
      convContNo: r.contNo,
    }));
  } else {
    const conditions = [
      gte(schema.extPackiParchi.vDate, from),
      lte(schema.extPackiParchi.vDate, to),
    ];
    if (purParty) {
      conditions.push(
        sql`${schema.extPackiParchi.purchaseParty} LIKE ${purPartyPat} ESCAPE '\\'`,
      );
    }
    if (salParty) {
      conditions.push(
        sql`${schema.extPackiParchi.saleParty} LIKE ${salPartyPat} ESCAPE '\\'`,
      );
    }
    const ppRows = await db
      .select({
        id: schema.extPackiParchi.id,
        vNo: schema.extPackiParchi.vNo,
        vDate: schema.extPackiParchi.vDate,
        ppNo: schema.extPackiParchi.ppNo,
        purchaseParty: schema.extPackiParchi.purchaseParty,
        saleParty: schema.extPackiParchi.saleParty,
        meterRe: schema.extPackiParchi.meterRe,
        meterNet: schema.extPackiParchi.meterNet,
        convContNo: schema.extPackiParchi.convContNo,
      })
      .from(schema.extPackiParchi)
      .where(and(...conditions))
      .orderBy(schema.extPackiParchi.vDate);

    rows = ppRows.map((r) => ({
      id: r.id,
      vNo: r.vNo,
      vDate: r.vDate,
      subNo: r.ppNo,
      purchaseParty: r.purchaseParty,
      saleParty: r.saleParty,
      meterA: r.meterRe,
      meterB: r.meterNet,
      convContNo: r.convContNo,
    }));
  }

  const totalLots = rows.length;
  const pendingPurParty = rows.filter(
    (r) => !r.saleParty || r.saleParty.trim() === "",
  ).length;
  const pendingSalParty80 = rows.filter((r) => {
    const re = r.meterA ?? 0;
    const net = r.meterB ?? 0;
    return re > 0 && net < re * 0.8;
  }).length;
  const pending100 = rows.filter(
    (r) =>
      r.saleParty &&
      r.saleParty.trim() !== "" &&
      (!r.convContNo || r.convContNo.trim() === ""),
  ).length;

  const subLabel = option === "KP" ? "KP.No" : "PP.No";
  const meterALabel = option === "KP" ? "Meter" : "Meter Re";
  const meterBLabel = option === "KP" ? "Total EL+Bad Mtrs" : "Meter Net";

  const excelRows = rows.map((r) => ({
    vNo: r.vNo,
    vDate: r.vDate,
    subNo: r.subNo ?? "",
    purchaseParty: r.purchaseParty ?? "",
    saleParty: r.saleParty ?? "",
    meterA: r.meterA ?? 0,
    meterB: r.meterB ?? 0,
  }));

  return (
    <Shell active="ext-r-kora">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Kora Pending Lots</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {totalLots} lots &middot; {from} to {to} &middot; Option: {option}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "vNo", label: "V.No" },
                { key: "vDate", label: "V.Date" },
                { key: "subNo", label: subLabel },
                { key: "purchaseParty", label: "Purchase Party" },
                { key: "saleParty", label: "Sale Party" },
                { key: "meterA", label: meterALabel },
                { key: "meterB", label: meterBLabel },
              ]}
              filename="kora-pending"
              sheetName="KoraPending"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Kora Pending Lots</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to} &middot; Option: {option}
            {purParty ? ` · Pur Party: ${purParty}` : ""}
            {salParty ? ` · Sal Party: ${salParty}` : ""}
          </div>
        </div>

        <datalist id="kora-parties">
          {parties.map((p) => (
            <option key={p.code} value={p.description}>
              {p.code}
            </option>
          ))}
        </datalist>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-6 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">Date From</label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="input-box mono"
            />
          </div>
          <div>
            <label className="label block mb-1">Date To</label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="input-box mono"
            />
          </div>
          <div>
            <label className="label block mb-1">Pur Party</label>
            <input
              type="text"
              name="purParty"
              list="kora-parties"
              defaultValue={purParty}
              className="input-box mono"
              placeholder="Party name"
            />
          </div>
          <div>
            <label className="label block mb-1">Sal Party</label>
            <input
              type="text"
              name="salParty"
              list="kora-parties"
              defaultValue={salParty}
              className="input-box mono"
              placeholder="Party name"
            />
          </div>
          <div>
            <label className="label block mb-1">Option (F-9)</label>
            <select name="option" defaultValue={option} className="input-box mono">
              <option value="KP">KP - Kachi Parchi</option>
              <option value="PP">PP - Packi Parchi</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/external/reports/kora-pending" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalLots)}</div>
            <div className="stat-label">Total Lots</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(pendingPurParty)}</div>
            <div className="stat-label">Pur Party Pending</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(pendingSalParty80)}</div>
            <div className="stat-label">Sal Party 80%</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(pending100)}</div>
            <div className="stat-label">Pending 100%</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>V.No</th>
                <th>V.Date</th>
                <th>{subLabel}</th>
                <th>Purchase Party</th>
                <th>Sale Party</th>
                <th className="text-right">{meterALabel}</th>
                <th className="text-right">{meterBLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-[var(--muted)] py-8">
                    No records found
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono font-bold">{r.vNo}</td>
                    <td className="mono text-[13px]">{toDate(r.vDate)}</td>
                    <td className="mono text-[13px]">{r.subNo ?? "-"}</td>
                    <td className="text-[13px]">{partyLabel(r.purchaseParty)}</td>
                    <td className="text-[13px]">{partyLabel(r.saleParty)}</td>
                    <td className="mono text-right">{fmt(r.meterA ?? 0)}</td>
                    <td className="mono text-right">{fmt(r.meterB ?? 0)}</td>
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
