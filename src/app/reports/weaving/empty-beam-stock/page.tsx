import { Fragment } from "react";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { ExcelExportButton } from "@/components/excel-export-button";
import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { fmt } from "../../_shared";

export const dynamic = "force-dynamic";

const SORTS = {
  shed: (a: Row, b: Row) =>
    (a.shed ?? "").localeCompare(b.shed ?? "") ||
    (a.partyTrade ?? "").localeCompare(b.partyTrade ?? "") ||
    a.beamNo.localeCompare(b.beamNo),
  party: (a: Row, b: Row) =>
    (a.partyTrade ?? "").localeCompare(b.partyTrade ?? "") ||
    (a.shed ?? "").localeCompare(b.shed ?? "") ||
    a.beamNo.localeCompare(b.beamNo),
  beam: (a: Row, b: Row) => a.beamNo.localeCompare(b.beamNo),
  length: (a: Row, b: Row) => (b.length ?? 0) - (a.length ?? 0),
} as const;

type SortKey = keyof typeof SORTS;

type Row = {
  id: number;
  beamNo: string;
  shed: string | null;
  partyTrade: string | null;
  contractNo: string | null;
  yarnCount: string | null;
  ends: number | null;
  length: number | null;
  weight: number | null;
  statusWrk: string;
};

export default async function EmptyBeamStockPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  await requireSession();
  const p = await searchParams;
  const sort = (p.sort?.trim() as SortKey) || "shed";

  const statusCounts = await db
    .select({
      statusWrk: schema.beams.statusWrk,
      n: sql<number>`count(*)`,
    })
    .from(schema.beams)
    .groupBy(schema.beams.statusWrk);
  const statMap = new Map(statusCounts.map((s) => [s.statusWrk, s.n]));

  const rawBeams = await db
    .select({
      id: schema.beams.id,
      beamNo: schema.beams.beamNo,
      shed: schema.beams.shed,
      partyTrade: schema.beams.partyTrade,
      contractNo: schema.beams.contractNo,
      yarnCount: schema.beams.yarnCount,
      ends: schema.beams.ends,
      length: schema.beams.length,
      weight: schema.beams.weight,
      statusWrk: schema.beams.statusWrk,
    })
    .from(schema.beams)
    .where(eq(schema.beams.statusWrk, "EMPTY"));
  const emptyBeams: Row[] = rawBeams;

  emptyBeams.sort(SORTS[sort] ?? SORTS.shed);

  // group by shed + party
  const groups = new Map<string, { shed: string; party: string; beams: Row[] }>();
  for (const b of emptyBeams) {
    const shed = b.shed ?? "(no shed)";
    const party = b.partyTrade ?? "(no party)";
    const k = `${shed}${party}`;
    const g = groups.get(k) ?? { shed, party, beams: [] };
    g.beams.push(b);
    groups.set(k, g);
  }
  const sortedGroups = [...groups.values()].sort(
    (a, b) => a.shed.localeCompare(b.shed) || a.party.localeCompare(b.party),
  );

  const excelRows = emptyBeams.map((r) => ({
    beamNo: r.beamNo,
    shed: r.shed ?? "",
    partyTrade: r.partyTrade ?? "",
    contractNo: r.contractNo ?? "",
    yarnCount: r.yarnCount ?? "",
    ends: r.ends ?? 0,
    length: r.length ?? 0,
    weight: r.weight ?? 0,
  }));

  const totalLength = emptyBeams.reduce((s, r) => s + (r.length ?? 0), 0);
  const totalWeight = emptyBeams.reduce((s, r) => s + (r.weight ?? 0), 0);

  const linkSort = (k: SortKey) => `?sort=${k}`;

  return (
    <Shell active="w-empty-beam-stock">
      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Empty Beam Stock</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {emptyBeams.length} empty beams &middot; {sortedGroups.length} shed/party groups
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <PrintButton />
            <ExcelExportButton
              rows={excelRows}
              columns={[
                { key: "beamNo", label: "Beam No" },
                { key: "shed", label: "Shed" },
                { key: "partyTrade", label: "Party" },
                { key: "contractNo", label: "Contract No" },
                { key: "yarnCount", label: "Yarn Count" },
                { key: "ends", label: "Ends" },
                { key: "length", label: "Length" },
                { key: "weight", label: "Weight" },
              ]}
              filename="empty-beam-stock"
            />
          </div>
        </div>

        <div className="hidden print:block mb-6">
          <h1 className="page-title">Empty Beam Stock</h1>
        </div>

        <div className="grid grid-cols-3 gap-px bg-black border-2 border-black mb-8">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(statMap.get("EMPTY") ?? 0)}</div>
            <div className="stat-label">Empty</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(statMap.get("LOADED") ?? 0)}</div>
            <div className="stat-label">Loaded</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt(statMap.get("RUNNING") ?? 0)}</div>
            <div className="stat-label">Running</div>
          </div>
        </div>

        <form
          method="GET"
          action=""
          className="border border-black p-4 mb-6 grid grid-cols-1 sm:grid-cols-4 gap-4 no-print"
        >
          <div>
            <label className="label block mb-1">Sort</label>
            <select name="sort" defaultValue={sort} className="input-box mono">
              <option value="shed">Shed / Party</option>
              <option value="party">Party / Shed</option>
              <option value="beam">Beam No</option>
              <option value="length">Length (desc)</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-sm">
              Apply
            </button>
            <a href="/reports/weaving/empty-beam-stock" className="btn btn-outline btn-sm">
              Clear
            </a>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>
                  <a href={linkSort("beam")}>Beam No</a>
                </th>
                <th>
                  <a href={linkSort("shed")}>Shed</a>
                </th>
                <th>
                  <a href={linkSort("party")}>Party</a>
                </th>
                <th>Contract</th>
                <th>Yarn Count</th>
                <th className="text-right">Ends</th>
                <th className="text-right">
                  <a href={linkSort("length")}>Length</a>
                </th>
                <th className="text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-[var(--muted)] py-8">
                    No empty beams
                  </td>
                </tr>
              ) : (
                sortedGroups.map((g) => {
                  const gLen = g.beams.reduce((s, r) => s + (r.length ?? 0), 0);
                  const gWt = g.beams.reduce((s, r) => s + (r.weight ?? 0), 0);
                  return (
                    <Fragment key={`${g.shed}||${g.party}`}>
                      <tr style={{ background: "#f4f4f4" }}>
                        <td colSpan={8} className="font-bold">
                          {g.shed} — {g.party} — {g.beams.length} beams
                        </td>
                      </tr>
                      {g.beams.map((r) => (
                        <tr key={r.id}>
                          <td className="mono font-bold">{r.beamNo}</td>
                          <td className="mono">{r.shed ?? "-"}</td>
                          <td>{r.partyTrade ?? "-"}</td>
                          <td className="mono">{r.contractNo ?? "-"}</td>
                          <td className="mono">{r.yarnCount ?? "-"}</td>
                          <td className="mono text-right">{r.ends ?? "-"}</td>
                          <td className="mono text-right">{fmt(r.length ?? 0)}</td>
                          <td className="mono text-right">{fmt(r.weight ?? 0)}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 700, borderTop: "1px solid black" }}>
                        <td colSpan={6}>Subtotal</td>
                        <td className="mono text-right">{fmt(gLen)}</td>
                        <td className="mono text-right">{fmt(gWt)}</td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {emptyBeams.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid black", fontWeight: 700 }}>
                  <td colSpan={6}>Total</td>
                  <td className="mono text-right">{fmt(totalLength)}</td>
                  <td className="mono text-right">{fmt(totalWeight)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </Shell>
  );
}
