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

type RegisterRow = {
  id: string;
  type: "PUR" | "SAL";
  contractNo: string;
  contractDate: string;
  party: string | null;
  greyCode: string | null;
  weave: string | null;
  qtyMtr: number | null;
  ratePerMtr: number | null;
  amount: number | null;
  status: string;
};

export default async function ClothRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    tittle?: string;
    code?: string;
  }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = (params.from && params.from.trim()) || monthsBackFrom(today, 6);
  const to = (params.to && params.to.trim()) || today;
  const tittle = (params.tittle ?? "").trim();
  const code = (params.code ?? "").trim();

  const tittlePat = tittle ? `%${escLike(tittle)}%` : "";
  const codePat = code ? `%${escLike(code)}%` : "";

  const purConditions = [
    gte(schema.extGreyPurContract.contractDate, from),
    lte(schema.extGreyPurContract.contractDate, to),
  ];
  if (tittle) {
    purConditions.push(
      sql`${schema.extGreyPurContract.party} LIKE ${tittlePat} ESCAPE '\\'`,
    );
  }
  if (code) {
    purConditions.push(
      sql`${schema.extGreyPurContract.contractNo} LIKE ${codePat} ESCAPE '\\'`,
    );
  }

  const salConditions = [
    gte(schema.extGreySalContract.contractDate, from),
    lte(schema.extGreySalContract.contractDate, to),
  ];
  if (tittle) {
    salConditions.push(
      sql`${schema.extGreySalContract.party} LIKE ${tittlePat} ESCAPE '\\'`,
    );
  }
  if (code) {
    salConditions.push(
      sql`${schema.extGreySalContract.contractNo} LIKE ${codePat} ESCAPE '\\'`,
    );
  }

  const [accountRows, greyRows] = await Promise.all([
    db.select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description }).from(schema.chartOfAccounts),
    db.select({ code: schema.greyConstruction.code, description: schema.greyConstruction.description }).from(schema.greyConstruction),
  ]);
  const partyCodeByName = new Map(accountRows.map((r) => [r.description, r.code]));
  const greyDescMap = new Map(greyRows.map((r) => [r.code, r.description]));

  const purRows = await db
    .select({
      id: schema.extGreyPurContract.id,
      contractNo: schema.extGreyPurContract.contractNo,
      contractDate: schema.extGreyPurContract.contractDate,
      party: schema.extGreyPurContract.party,
      greyCode: schema.extGreyPurContract.greyCode,
      weave: schema.extGreyPurContract.weave,
      qtyMtr: schema.extGreyPurContract.quantityMtr,
      ratePerMtr: schema.extGreyPurContract.ratePerMtr,
      amount: schema.extGreyPurContract.amount,
      status: schema.extGreyPurContract.status,
    })
    .from(schema.extGreyPurContract)
    .where(and(...purConditions));

  const salRows = await db
    .select({
      id: schema.extGreySalContract.id,
      contractNo: schema.extGreySalContract.contractNo,
      contractDate: schema.extGreySalContract.contractDate,
      party: schema.extGreySalContract.party,
      greyCode: schema.extGreySalContract.greyCode,
      weave: schema.extGreySalContract.weave,
      qtyMtr: schema.extGreySalContract.quantityMtr,
      ratePerMtr: schema.extGreySalContract.ratePerMtr,
      amount: schema.extGreySalContract.amount,
      status: schema.extGreySalContract.status,
    })
    .from(schema.extGreySalContract)
    .where(and(...salConditions));

  const rows: RegisterRow[] = [
    ...purRows.map<RegisterRow>((r) => ({
      id: `P-${r.id}`,
      type: "PUR",
      contractNo: r.contractNo,
      contractDate: r.contractDate,
      party: r.party,
      greyCode: r.greyCode,
      weave: r.weave,
      qtyMtr: r.qtyMtr,
      ratePerMtr: r.ratePerMtr,
      amount: r.amount,
      status: r.status,
    })),
    ...salRows.map<RegisterRow>((r) => ({
      id: `S-${r.id}`,
      type: "SAL",
      contractNo: r.contractNo,
      contractDate: r.contractDate,
      party: r.party,
      greyCode: r.greyCode,
      weave: r.weave,
      qtyMtr: r.qtyMtr,
      ratePerMtr: r.ratePerMtr,
      amount: r.amount,
      status: r.status,
    })),
  ].sort((a, b) => (a.contractDate < b.contractDate ? 1 : -1));

  const totalPur = purRows.length;
  const totalSal = salRows.length;
  const totalAmount =
    purRows.reduce((s, r) => s + (r.amount ?? 0), 0) +
    salRows.reduce((s, r) => s + (r.amount ?? 0), 0);

  const excelRows = rows.map((r) => ({
    type: r.type,
    contractNo: r.contractNo,
    contractDate: r.contractDate,
    party: r.party ?? "",
    greyCode: r.greyCode ?? "",
    weave: r.weave ?? "",
    qtyMtr: r.qtyMtr ?? 0,
    ratePerMtr: r.ratePerMtr ?? 0,
    amount: r.amount ?? 0,
    status: r.status,
  }));

  return (
    <Shell active="ext-r-cloth">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Cloth Purchase Sale Register</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} contracts &middot; {from} to {to}
            </p>
          </div>
          <div className="flex gap-2 items-center">
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
                { key: "qtyMtr", label: "Qty Mtr" },
                { key: "ratePerMtr", label: "Rate/Mtr" },
                { key: "amount", label: "Amount" },
                { key: "status", label: "Status" },
              ]}
              filename="cloth-register"
              sheetName="ClothRegister"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Cloth Purchase Sale Register</h1>
          <div className="mono text-[12px] mt-2">
            Period: {from} to {to}
            {tittle ? ` · Tittle: ${tittle}` : ""}
            {code ? ` · Code: ${code}` : ""}
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-5 gap-4 no-print"
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
            <label className="label block mb-1">Tittle</label>
            <input
              type="text"
              name="tittle"
              defaultValue={tittle}
              className="input-box mono"
              placeholder="Party name"
            />
          </div>
          <div>
            <label className="label block mb-1">Code</label>
            <input
              type="text"
              name="code"
              defaultValue={code}
              className="input-box mono"
              placeholder="Contract No"
            />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a
              href="/external/reports/cloth-register"
              className="btn btn-outline btn-sm"
            >
              Clear
            </a>
          </div>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border-2 border-black mb-8">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalPur)}</div>
            <div className="stat-label">Total Purchase Contracts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(totalSal)}</div>
            <div className="stat-label">Total Sale Contracts</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">Rs {fmt(totalAmount)}</div>
            <div className="stat-label">Total Amount</div>
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--muted)] py-8">
                    No records found
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          r.type === "PUR"
                            ? "bg-black text-white"
                            : "border border-black"
                        }`}
                      >
                        {r.type}
                      </span>
                    </td>
                    <td className="mono font-bold">{r.contractNo}</td>
                    <td className="mono text-[13px]">{toDate(r.contractDate)}</td>
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
                    <td className="mono text-right">{fmt(r.qtyMtr ?? 0)}</td>
                    <td className="mono text-right">{fmt(r.ratePerMtr ?? 0)}</td>
                    <td className="mono text-right font-bold">
                      {fmt(r.amount ?? 0)}
                    </td>
                    <td className="mono text-[12px]">{r.status}</td>
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
