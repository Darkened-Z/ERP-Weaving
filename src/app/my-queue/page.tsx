import { Shell } from "@/components/shell";
import { ApprovalBadge } from "@/components/approval-controls";
import { db, schema } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth";
import {
  canForwardToAudit,
  canForwardToFinance,
} from "@/lib/approvals";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-PK");

type QueueRow = {
  kind: "grn" | "demand" | "return" | "adjustment";
  id: number;
  vno: number;
  fyCode: string;
  vdate: string;
  party: string;
  amount: number;
  status: string;
  href: string;
  label: string;
};

async function fetchByStatus(status: "STORE" | "AUDITED"): Promise<QueueRow[]> {
  const [grn, dmd, ret, adj] = await Promise.all([
    db
      .select()
      .from(schema.storeGrn)
      .where(eq(schema.storeGrn.approvalStatus, status))
      .orderBy(sql`grn_date DESC, id DESC`),
    db
      .select()
      .from(schema.storeDemands)
      .where(eq(schema.storeDemands.approvalStatus, status))
      .orderBy(sql`demand_date DESC, id DESC`),
    db
      .select()
      .from(schema.storeReturns)
      .where(eq(schema.storeReturns.approvalStatus, status))
      .orderBy(sql`return_date DESC, id DESC`),
    db
      .select()
      .from(schema.storeAdjustments)
      .where(eq(schema.storeAdjustments.approvalStatus, status))
      .orderBy(sql`adj_date DESC, id DESC`),
  ]);

  const rows: QueueRow[] = [];
  for (const r of grn)
    rows.push({
      kind: "grn",
      id: r.id,
      vno: r.grnNo,
      fyCode: r.fyCode,
      vdate: r.grnDate,
      party: r.supplier,
      amount: r.totalAmount ?? 0,
      status: r.approvalStatus,
      href: `/store/grn?id=${r.id}`,
      label: "GRN",
    });
  for (const r of dmd)
    rows.push({
      kind: "demand",
      id: r.id,
      vno: r.demandNo,
      fyCode: r.fyCode,
      vdate: r.demandDate,
      party: r.department,
      amount: r.totalAmount ?? 0,
      status: r.approvalStatus,
      href: `/store/demand?id=${r.id}`,
      label: "Demand",
    });
  for (const r of ret)
    rows.push({
      kind: "return",
      id: r.id,
      vno: r.returnNo,
      fyCode: r.fyCode,
      vdate: r.returnDate,
      party: r.department,
      amount: r.totalAmount ?? 0,
      status: r.approvalStatus,
      href: `/store/gatepass?id=${r.id}`,
      label: "Return",
    });
  for (const r of adj)
    rows.push({
      kind: "adjustment",
      id: r.id,
      vno: r.adjNo,
      fyCode: r.fyCode,
      vdate: r.adjDate,
      party: r.type,
      amount: r.totalValue ?? 0,
      status: r.approvalStatus,
      href: `/store/adjustment?id=${r.id}`,
      label: "Adjustment",
    });

  return rows.sort((a, b) => (b.vdate < a.vdate ? -1 : b.vdate > a.vdate ? 1 : 0));
}

function Section({
  title,
  subtitle,
  rows,
  cta,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  rows: QueueRow[];
  cta: string;
  emptyMessage: string;
}) {
  return (
    <div className="border border-black mb-8">
      <div className="border-b border-black px-4 py-2 bg-gray-50 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] font-semibold">
            {title}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-1">{subtitle}</div>
        </div>
        <div className="mono text-[13px]">{fmt.format(rows.length)}</div>
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Date</th>
              <th>No.</th>
              <th>Party / Dept</th>
              <th className="text-right">Amount</th>
              <th>Approval</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-[var(--muted)] py-4">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="hover:bg-gray-50">
                  <td className="text-[12px]">{r.label}</td>
                  <td className="mono text-[13px]">{r.vdate}</td>
                  <td className="mono text-[13px]">
                    {r.vno}/{r.fyCode}
                  </td>
                  <td className="text-[13px]">{r.party}</td>
                  <td className="mono text-[13px] text-right">
                    {fmt.format(Math.round(r.amount))}
                  </td>
                  <td>
                    <ApprovalBadge status={r.status} />
                  </td>
                  <td>
                    <a href={r.href} className="btn btn-outline btn-sm">
                      {cta}
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function MyQueuePage() {
  const session = await requireSession();
  const role = session.roleName;

  const storeRows = await fetchByStatus("STORE");
  const auditedRows = await fetchByStatus("AUDITED");

  const canAudit = canForwardToAudit(role);
  const canFinance = canForwardToFinance(role);

  return (
    <Shell active="my-queue">
      <div className="animate-in">
        <div className="mb-6">
          <h1 className="page-title">My Queue &middot; {session.fullName}</h1>
          <p className="text-[12px] text-[var(--muted)] mt-2 uppercase tracking-[0.1em]">
            {role}
          </p>
          <p className="text-[12px] text-[var(--muted)] mt-1">
            Store &rarr; Audit &rarr; Finance approval pipeline for PR / PV / SR / SV vouchers.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-6">
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt.format(storeRows.length)}</div>
            <div className="stat-label">At Store</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">{fmt.format(auditedRows.length)}</div>
            <div className="stat-label">Audited (awaiting Finance)</div>
          </div>
          <div className="bg-white p-4">
            <div className="mono text-xl font-bold">
              {fmt.format(storeRows.length + auditedRows.length)}
            </div>
            <div className="stat-label">Open in Pipeline</div>
          </div>
        </div>

        <Section
          title="Awaiting Store Approval"
          subtitle={
            canAudit
              ? "You can forward these to Audit."
              : "Only STORE_INCHARGE or ADMIN can forward these."
          }
          rows={storeRows}
          cta="Open"
          emptyMessage="Nothing awaiting store approval."
        />

        <Section
          title="Awaiting Audit"
          subtitle={
            canFinance
              ? "You can forward these to Finance."
              : "Awaiting AUDITOR / ADMIN action to post to Finance."
          }
          rows={auditedRows}
          cta="Open"
          emptyMessage="Nothing awaiting audit or finance posting."
        />

        <Section
          title="Awaiting Finance Post"
          subtitle="Same set as Awaiting Audit — Finance posts after audit sign-off."
          rows={auditedRows}
          cta="Open"
          emptyMessage="Nothing awaiting finance posting."
        />
      </div>
    </Shell>
  );
}
