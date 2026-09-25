import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const LOOM_TYPES = ["SULZER", "AIRJET"];

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ fparty?: string; fstatus?: string; floom?: string; find?: string }>;
}) {
  const params = await searchParams;
  const fParty = (params.fparty ?? "").trim();
  const fStatus = (params.fstatus ?? "R").trim();
  const fLoom = (params.floom ?? "").trim();
  const findFilter = (params.find ?? "").trim();
  const findL = findFilter.toLowerCase();

  const allContracts = await db
    .select()
    .from(schema.extGreyConvContract)
    .orderBy(sql`cont_date desc`);

  const productRows = await db
    .select({ description: schema.products.description, mainDesc: schema.products.mainDesc })
    .from(schema.products);
  const productMainDesc = new Map(productRows.map((p) => [p.description, p.mainDesc ?? ""]));

  const greyRows = await db
    .select({ code: schema.greyConstruction.code, reed: schema.greyConstruction.reed, pick: schema.greyConstruction.pick })
    .from(schema.greyConstruction);
  const greyReedPick = new Map(greyRows.map((g) => [g.code, { reed: g.reed as number | null, pick: g.pick as number | null }]));

  const parties = await db
    .select({ code: schema.chartOfAccounts.code, description: schema.chartOfAccounts.description })
    .from(schema.chartOfAccounts)
    .where(sql`${schema.chartOfAccounts.level} >= 5`)
    .orderBy(schema.chartOfAccounts.description);
  const partyCodeByDesc = new Map(parties.map((p) => [p.description, p.code]));

  const usedParties = [...new Set(allContracts.map((c) => c.party).filter(Boolean))].sort() as string[];

  const contracts = allContracts.filter((c) => {
    if (fStatus && c.status !== fStatus) return false;
    if (fParty && c.party !== fParty) return false;
    if (fLoom && c.loomType !== fLoom) return false;
    if (findL) {
      const hay = `${c.contNo ?? ""} ${c.party ?? ""} ${c.productName ?? ""} ${c.grayCode ?? ""}`.toLowerCase();
      if (!hay.includes(findL)) return false;
    }
    return true;
  });

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const activeCount = contracts.filter((c) => c.status === "R").length;
  const totalValue = round2(contracts.reduce((s, c) => s + (c.qtyMtr ?? 0) * (c.convRatePerMtr ?? 0), 0));
  const fmt = (n: number) => n.toLocaleString("en-US");
  const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Shell>
      <div className="animate-in">
        <div className="mb-6">
          <h1 className="page-title">Grey Conv Ext — Contracts</h1>
          <p className="text-[13px] text-[var(--muted)] mt-1">
            {contracts.length} contract{contracts.length !== 1 ? "s" : ""} &middot; Total value{" "}
            <span className="mono">{fmt(totalValue)}</span>
          </p>
        </div>

        <form
          action="/contracts"
          method="get"
          className="flex gap-3 items-end flex-wrap border border-black p-3 bg-gray-50 mb-6"
        >
          <div>
            <label className="label block mb-1">Find</label>
            <input
              name="find"
              defaultValue={findFilter}
              placeholder="Cont No, Party, Product…"
              className="input-box mono text-[13px]"
              style={{ maxWidth: 220 }}
            />
          </div>
          <div>
            <label className="label block mb-1">Status</label>
            <select name="fstatus" defaultValue={fStatus} className="input-box mono text-[13px]" style={{ minWidth: 120 }}>
              <option value="R">Running</option>
              <option value="C">Completed</option>
              <option value="">All</option>
            </select>
          </div>
          <div>
            <label className="label block mb-1">Party</label>
            <select name="fparty" defaultValue={fParty} className="input-box mono text-[13px]" style={{ minWidth: 200 }}>
              <option value="">— All parties —</option>
              {usedParties.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Loom Type</label>
            <select name="floom" defaultValue={fLoom} className="input-box mono text-[13px]" style={{ minWidth: 120 }}>
              <option value="">All</option>
              {LOOM_TYPES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-outline btn-sm">Search</button>
          {(findFilter || fParty || fStatus !== "R" || fLoom) && (
            <a href="/contracts" className="btn btn-outline btn-sm">Clear</a>
          )}
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-8">
          <div className="bg-white p-5">
            <div className="stat-value">{contracts.length}</div>
            <div className="stat-label">Grey Conv Ext Contracts</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{activeCount}</div>
            <div className="stat-label">Running</div>
          </div>
          <div className="bg-white p-5">
            <div className="stat-value">{fmt(totalValue)}</div>
            <div className="stat-label">Total Value</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Cont No</th>
                <th>Party</th>
                <th>Product</th>
                <th style={{ minWidth: 220 }}>Quality</th>
                <th className="text-right">Qty Mtr</th>
                <th className="text-right">Pick</th>
                <th className="text-right">R/Pick</th>
                <th className="text-right">Rate/Mtr</th>
                <th className="text-right">Amount</th>
                <th>Loom</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const constrCode = c.grayQltyCode ?? c.grayCode ?? null;
                const gInfo = constrCode ? greyReedPick.get(constrCode) : null;
                const quality = gInfo?.reed && gInfo?.pick ? `${gInfo.reed}×${gInfo.pick}` : "";
                const mainDesc = c.productName ? productMainDesc.get(c.productName) ?? "" : "";
                const qty = c.qtyMtr ?? 0;
                const rateMtr = c.convRatePerMtr ?? 0;
                const amount = round2(qty * rateMtr);
                return (
                  <tr key={c.id}>
                    <td className="mono font-bold">
                      <Link href={`/external/contracts/grey-conversion?id=${c.id}`} className="no-underline" style={{ color: "inherit" }}>
                        {c.contNo}
                      </Link>
                    </td>
                    <td className="text-[13px]">
                      {c.party ?? "-"}
                      {c.party && partyCodeByDesc.get(c.party) && (
                        <span className="block text-[11px] text-[var(--muted)]">{partyCodeByDesc.get(c.party)}</span>
                      )}
                    </td>
                    <td className="text-[13px] mono">{c.productName ?? "-"}</td>
                    <td className="text-[13px]">
                      {quality && <span className="font-bold">{quality}</span>}
                      {mainDesc && <span className="block text-[11px] text-[var(--muted)]">{mainDesc}</span>}
                      {!quality && !mainDesc && (constrCode ?? "-")}
                    </td>
                    <td className="mono text-right">{qty ? fmt2(qty) : "-"}</td>
                    <td className="mono text-right">{c.pick ?? "-"}</td>
                    <td className="mono text-right">{c.ratePerPick ?? "-"}</td>
                    <td className="mono text-right">{rateMtr ? fmt2(rateMtr) : "-"}</td>
                    <td className="mono text-right">{amount ? fmt(amount) : "-"}</td>
                    <td className="text-[12px]">{c.loomType ?? "-"}</td>
                    <td>
                      {c.status === "R" ? (
                        <span className="inline-block text-[11px] px-2 py-0.5 uppercase bg-black text-white" style={{ letterSpacing: "0.05em" }}>RUNNING</span>
                      ) : (
                        <span className="inline-block text-[11px] px-2 py-0.5 uppercase border border-black" style={{ letterSpacing: "0.05em", color: "var(--muted)" }}>{c.status === "C" ? "CLOSED" : c.status}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {contracts.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-[var(--muted)] py-6">
                    No contracts match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
