import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { db, schema } from "@/db";
import { and, gte, lte, eq, sql, or } from "drizzle-orm";
import { today as todayFn, monthsAgo } from "@/lib/time";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-PK").format(Math.round(n));
const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function sixMonthsAgo(): string {
  return monthsAgo(6);
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "R", label: "R - Running" },
  { value: "C", label: "C - Completed" },
  { value: "F", label: "F - Finished" },
  { value: "X", label: "X - Cancelled" },
];

type Row = {
  type: "PUR" | "SAL";
  id: number;
  contractNo: string;
  contractDate: string;
  party: string | null;
  greyCode: string | null;
  weave: string | null;
  quantityMtr: number | null;
  ratePerMtr: number | null;
  amount: number | null;
  extMtr: number | null;
  status: string;
};

export default async function GreyRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    shortTittle?: string;
    tittle?: string;
    code?: string;
    status?: string;
    reg2_code?: string;
    reg2_desc?: string;
    reg2_printcode?: string;
    reg2_desc2?: string;
    pc_no?: string;
    sc_no?: string;
  }>;
}) {
  const params = await searchParams;

  const today = todayFn();
  const from = params.from?.trim() || sixMonthsAgo();
  const to = params.to?.trim() || today;
  const shortTittle = params.shortTittle?.trim() ?? "";
  const tittle = params.tittle?.trim() ?? "";
  const code = params.code?.trim() ?? "";
  const status = params.status?.trim() ?? "";
  const reg2Code = params.reg2_code?.trim() ?? "";
  const reg2Desc = params.reg2_desc?.trim() ?? "";
  const reg2PrintCode = params.reg2_printcode?.trim() ?? "";
  const reg2Desc2 = params.reg2_desc2?.trim() ?? "";
  const pcNo = params.pc_no?.trim() ?? "";
  const scNo = params.sc_no?.trim() ?? "";

  const purConditions = [
    gte(schema.extGreyPurContract.contractDate, from),
    lte(schema.extGreyPurContract.contractDate, to),
  ];
  const salConditions = [
    gte(schema.extGreySalContract.contractDate, from),
    lte(schema.extGreySalContract.contractDate, to),
  ];

  if (shortTittle) {
    const pat = `%${escLike(shortTittle)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.greyCode} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.greyCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (tittle) {
    const pat = `%${escLike(tittle)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.party} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.party} LIKE ${pat} ESCAPE '\\'`);
  }
  if (code) {
    const pat = `%${escLike(code)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.contractNo} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.contractNo} LIKE ${pat} ESCAPE '\\'`);
  }
  if (status) {
    purConditions.push(eq(schema.extGreyPurContract.status, status));
    salConditions.push(eq(schema.extGreySalContract.status, status));
  }
  if (reg2Code) {
    const pat = `%${escLike(reg2Code)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.greyCode} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.greyCode} LIKE ${pat} ESCAPE '\\'`);
  }
  if (reg2Desc) {
    const pat = `%${escLike(reg2Desc)}%`;
    purConditions.push(
      or(
        sql`${schema.extGreyPurContract.weave} LIKE ${pat} ESCAPE '\\'`,
        sql`${schema.extGreyPurContract.remarks} LIKE ${pat} ESCAPE '\\'`,
      )!
    );
    salConditions.push(
      or(
        sql`${schema.extGreySalContract.weave} LIKE ${pat} ESCAPE '\\'`,
        sql`${schema.extGreySalContract.remarks} LIKE ${pat} ESCAPE '\\'`,
      )!
    );
  }
  if (reg2PrintCode) {
    const pat = `%${escLike(reg2PrintCode)}%`;
    purConditions.push(
      or(
        sql`${schema.extGreyPurContract.greyCode} LIKE ${pat} ESCAPE '\\'`,
        sql`${schema.extGreyPurContract.remarks} LIKE ${pat} ESCAPE '\\'`,
      )!
    );
    salConditions.push(
      or(
        sql`${schema.extGreySalContract.greyCode} LIKE ${pat} ESCAPE '\\'`,
        sql`${schema.extGreySalContract.remarks} LIKE ${pat} ESCAPE '\\'`,
      )!
    );
  }
  if (reg2Desc2) {
    const pat = `%${escLike(reg2Desc2)}%`;
    purConditions.push(sql`${schema.extGreyPurContract.remarks} LIKE ${pat} ESCAPE '\\'`);
    salConditions.push(sql`${schema.extGreySalContract.remarks} LIKE ${pat} ESCAPE '\\'`);
  }

  const [accountRows, greyRows] = await Promise.all([
    db.select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description }).from(schema.chartOfAccounts),
    db.select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description }).from(schema.greyConstruction),
  ]);
  const partyCodeByName = new Map(accountRows.map((r) => [r.description, r.code]));
  const greyDescMap = new Map(greyRows.map((r) => [r.code, r.description]));

  const purRows = await db.select().from(schema.extGreyPurContract).where(and(...purConditions));
  const salRows = await db.select().from(schema.extGreySalContract).where(and(...salConditions));

  const combined: Row[] = [
    ...purRows.map((r) => ({
      type: "PUR" as const,
      id: r.id,
      contractNo: r.contractNo,
      contractDate: r.contractDate,
      party: r.party,
      greyCode: r.greyCode,
      weave: r.weave,
      quantityMtr: r.quantityMtr,
      ratePerMtr: r.ratePerMtr,
      amount: r.amount,
      extMtr: r.extMtr,
      status: r.status,
    })),
    ...salRows.map((r) => ({
      type: "SAL" as const,
      id: r.id,
      contractNo: r.contractNo,
      contractDate: r.contractDate,
      party: r.party,
      greyCode: r.greyCode,
      weave: r.weave,
      quantityMtr: r.quantityMtr,
      ratePerMtr: r.ratePerMtr,
      amount: r.amount,
      extMtr: r.extMtr,
      status: r.status,
    })),
  ].sort((a, b) => (b.contractDate ?? "").localeCompare(a.contractDate ?? ""));

  const totalPur = purRows.length;
  const totalSal = salRows.length;
  const totalPurAmount = purRows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const totalSalAmount = salRows.reduce((s, r) => s + (r.amount ?? 0), 0);

  const excelRows = combined.map((r) => ({
    ...r,
    party: r.party ?? "",
    greyCode: r.greyCode ?? "",
    weave: r.weave ?? "",
  }));

  const statusBadge = (s: string) => {
    const map: Record<string, { bg: string; fg: string }> = {
      R: { bg: "black", fg: "white" },
      C: { bg: "transparent", fg: "black" },
      F: { bg: "transparent", fg: "black" },
      X: { bg: "transparent", fg: "var(--muted)" },
    };
    const v = map[s] ?? { bg: "transparent", fg: "black" };
    return (
      <span
        className="inline-block text-[11px] px-2 py-0.5 uppercase mono"
        style={{ letterSpacing: "0.05em", background: v.bg, color: v.fg, border: "1px solid black" }}
      >
        {s || "-"}
      </span>
    );
  };

  const printQs = new URLSearchParams();
  if (from) printQs.set("from", from);
  if (to) printQs.set("to", to);
  if (shortTittle) printQs.set("shortTittle", shortTittle);
  if (tittle) printQs.set("tittle", tittle);
  if (code) printQs.set("code", code);
  if (status) printQs.set("status", status);
  if (reg2Code) printQs.set("reg2_code", reg2Code);
  if (reg2Desc) printQs.set("reg2_desc", reg2Desc);
  if (reg2PrintCode) printQs.set("reg2_printcode", reg2PrintCode);
  if (reg2Desc2) printQs.set("reg2_desc2", reg2Desc2);

  return (
    <Shell active="ext-r-greyreg">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">GREY REGISTER</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {combined.length} contracts &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "type", label: "Type" },
                { key: "contractNo", label: "Contract No" },
                { key: "contractDate", label: "Contract Date" },
                { key: "party", label: "Party" },
                { key: "greyCode", label: "Grey Code" },
                { key: "weave", label: "Weave" },
                { key: "quantityMtr", label: "Qty Mtr" },
                { key: "ratePerMtr", label: "Rate/Mtr" },
                { key: "amount", label: "Amount" },
                { key: "extMtr", label: "Ext Mtr" },
                { key: "status", label: "Status" },
              ]}
              filename="grey-register"
              sheetName="GreyRegister"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">GREY REGISTER</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="no-print mb-6"
        >
          <div className="border border-black p-4 mb-3 grid grid-cols-1 sm:grid-cols-6 gap-4">
            <div>
              <label className="label block mb-1">Date From</label>
              <input type="date" name="from" defaultValue={from} className="input-box mono" />
            </div>
            <div>
              <label className="label block mb-1">Date To</label>
              <input type="date" name="to" defaultValue={to} className="input-box mono" />
            </div>
            <div>
              <label className="label block mb-1">Short Tittle</label>
              <input type="text" name="shortTittle" defaultValue={shortTittle} className="input-box mono" placeholder="Grey Code" />
            </div>
            <div>
              <label className="label block mb-1">Tittle</label>
              <input type="text" name="tittle" defaultValue={tittle} className="input-box" placeholder="Party" />
            </div>
            <div>
              <label className="label block mb-1">Code</label>
              <input type="text" name="code" defaultValue={code} className="input-box mono" placeholder="Contract No" />
            </div>
            <div>
              <label className="label block mb-1">Status</label>
              <select name="status" defaultValue={status} className="input-box">
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border border-black p-4 mb-3 grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="label block mb-1">Code</label>
              <input type="text" name="reg2_code" defaultValue={reg2Code} className="input-box mono" placeholder="Grey Code" />
            </div>
            <div>
              <label className="label block mb-1">Description</label>
              <input type="text" name="reg2_desc" defaultValue={reg2Desc} className="input-box" placeholder="Product Description" />
            </div>
            <div>
              <label className="label block mb-1">Print Code</label>
              <input type="text" name="reg2_printcode" defaultValue={reg2PrintCode} className="input-box mono" placeholder="Design / Print Code" />
            </div>
            <div>
              <label className="label block mb-1">Description</label>
              <input type="text" name="reg2_desc2" defaultValue={reg2Desc2} className="input-box" placeholder="Remarks" />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn btn-sm">Apply</button>
            <a href="/external/reports/grey-register" className="btn btn-outline btn-sm">Clear</a>
          </div>
        </form>

        <div className="no-print mb-6 border border-black p-4 flex flex-wrap items-end gap-3">
          <form
            method="GET"
            action="/external/reports/grey-register/pur-cont-history"
            target="_blank"
            className="flex items-end gap-2"
          >
            <div>
              <label className="label block mb-1">Pur Cont #</label>
              <input type="text" name="contNo" defaultValue={pcNo} className="input-box mono" style={{ width: 160 }} />
            </div>
            <button type="submit" className="btn btn-outline btn-sm">Pur Cont. History</button>
          </form>

          <form
            method="GET"
            action="/external/reports/grey-register/sal-cont-history"
            target="_blank"
            className="flex items-end gap-2"
          >
            <div>
              <label className="label block mb-1">Sal Cont #</label>
              <input type="text" name="contNo" defaultValue={scNo} className="input-box mono" style={{ width: 160 }} />
            </div>
            <button type="submit" className="btn btn-outline btn-sm">Sal Cont. History</button>
          </form>

          <a
            href={`/external/reports/grey-register/print${printQs.toString() ? "?" + printQs.toString() : ""}`}
            target="_blank"
            className="btn btn-sm"
          >
            Register / Print
          </a>
          <a href="/" className="btn btn-outline btn-sm">Exit</a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black border-2 border-black mb-8 no-print">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalPur)}</div>
            <div className="stat-label">Total Purchase Contracts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalSal)}</div>
            <div className="stat-label">Total Sale Contracts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalPurAmount)}</div>
            <div className="stat-label">Total Purchase Amount</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalSalAmount)}</div>
            <div className="stat-label">Total Sale Amount</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Contract No</th>
                <th>Contract Date</th>
                <th>Party</th>
                <th>Grey Code</th>
                <th>Weave</th>
                <th className="text-right">Qty Mtr</th>
                <th className="text-right">Rate/Mtr</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Ext Mtr</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {combined.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-[var(--muted)] py-8">
                    No records found
                  </td>
                </tr>
              ) : (
                combined.map((r) => (
                  <tr key={`${r.type}-${r.id}`}>
                    <td className="mono text-[12px] font-bold">{r.type}</td>
                    <td className="mono text-[13px] font-bold">{r.contractNo}</td>
                    <td className="mono text-[13px]">{r.contractDate}</td>
                    <td className="text-[13px]">
                      {r.party ?? "-"}
                      {r.party && partyCodeByName.get(r.party) ? ` (${partyCodeByName.get(r.party)})` : ""}
                    </td>
                    <td className="mono text-[13px]">
                      {r.greyCode ?? "-"}
                      {r.greyCode && greyDescMap.get(r.greyCode) ? (
                        <div className="text-[11px] text-[var(--muted)]">{greyDescMap.get(r.greyCode)}</div>
                      ) : null}
                    </td>
                    <td className="text-[13px]">{r.weave ?? "-"}</td>
                    <td className="mono text-right">{r.quantityMtr != null ? fmt(r.quantityMtr) : "-"}</td>
                    <td className="mono text-right">{r.ratePerMtr != null ? fmt2(r.ratePerMtr) : "-"}</td>
                    <td className="mono text-right font-bold">{r.amount != null ? fmt(r.amount) : "-"}</td>
                    <td className="mono text-right">{r.extMtr != null ? fmt(r.extMtr) : "-"}</td>
                    <td>{statusBadge(r.status)}</td>
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
