import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const TYPES = [
  "ALL",
  "YARN_PUR",
  "YARN_SALE",
  "GREY_SALE",
  "GREY_CONV",
  "WARPING",
  "KNOTTING",
] as const;

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const activeType = params.type ?? "ALL";

  const contracts =
    activeType === "ALL"
      ? await db
          .select()
          .from(schema.contracts)
          .orderBy(sql`contract_date desc`)
      : await db
          .select()
          .from(schema.contracts)
          .where(eq(schema.contracts.type, activeType))
          .orderBy(sql`contract_date desc`);

  const allContracts = await db.select().from(schema.contracts);
  const totalCount = allContracts.length;
  const activeCount = allContracts.filter((c) => c.status === "A").length;
  const totalValue = allContracts.reduce((s, c) => s + (c.amount ?? 0), 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const statusBadge = (status: string | null) => {
    if (status === "A")
      return (
        <span
          className="inline-block text-[11px] px-2 py-0.5 uppercase bg-black text-white"
          style={{ letterSpacing: "0.05em" }}
        >
          ACTIVE
        </span>
      );
    if (status === "C")
      return (
        <span
          className="inline-block text-[11px] px-2 py-0.5 uppercase border border-black"
          style={{ letterSpacing: "0.05em", color: "var(--muted)" }}
        >
          CLOSED
        </span>
      );
    if (status === "X")
      return (
        <span
          className="inline-block text-[11px] px-2 py-0.5 uppercase border border-black"
          style={{
            letterSpacing: "0.05em",
            textDecoration: "line-through",
            color: "var(--muted)",
          }}
        >
          CANCELLED
        </span>
      );
    return (
      <span
        className="inline-block text-[11px] px-2 py-0.5 uppercase border border-black"
        style={{ letterSpacing: "0.05em" }}
      >
        {status ?? "-"}
      </span>
    );
  };

  return (
    <Shell active="contracts">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Contracts</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {totalCount} contracts &middot; Total value{" "}
            <span className="mono">{fmt(totalValue)}</span>
          </p>
        </div>

        <div className="flex gap-2 mb-8 flex-wrap">
          {TYPES.map((t) => (
            <a
              key={t}
              href={t === "ALL" ? "/contracts" : `/contracts?type=${t}`}
              className="inline-block text-[11px] px-3 py-1 uppercase no-underline"
              style={{
                letterSpacing: "0.05em",
                background: activeType === t ? "black" : "transparent",
                color: activeType === t ? "white" : "black",
                border: "1px solid black",
              }}
            >
              {t.replace(/_/g, " ")}
            </a>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{contracts.length}</div>
            <div className="stat-label">
              {activeType === "ALL" ? "Total" : activeType.replace(/_/g, " ")}{" "}
              Contracts
            </div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{activeCount}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{fmt(totalValue)}</div>
            <div className="stat-label">Total Value</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Contract No</th>
              <th>FY</th>
              <th>Type</th>
              <th>Party</th>
              <th>Broker</th>
              <th>Product</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={`${c.contractNo}-${c.fyCode}-${c.type}`}>
                <td className="mono">{c.contractNo}</td>
                <td className="mono">{c.fyCode}</td>
                <td>
                  <span
                    className="inline-block text-[11px] px-2 py-0.5 border border-black uppercase"
                    style={{ letterSpacing: "0.05em" }}
                  >
                    {c.type}
                  </span>
                </td>
                <td>{c.party}</td>
                <td>{c.broker}</td>
                <td>{c.product}</td>
                <td className="mono text-right">
                  {fmt(c.quantity ?? 0)} {c.unit}
                </td>
                <td className="mono text-right">{fmt(c.rate ?? 0)}</td>
                <td className="mono text-right">{fmt(c.amount ?? 0)}</td>
                <td>{statusBadge(c.status)}</td>
              </tr>
            ))}
            {contracts.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="text-center text-[var(--muted)]"
                >
                  No contracts found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
