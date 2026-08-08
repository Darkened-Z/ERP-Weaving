import Link from "next/link";
import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { sql } from "drizzle-orm";
import { WhatsAppModal } from "@/components/whatsapp-modal";

export const dynamic = "force-dynamic";

export default async function GreyDespatchPage() {
  const rows = await db
    .select()
    .from(schema.greyDespatch)
    .orderBy(sql`despatch_date DESC`);

  const formatNum = (n: number) =>
    new Intl.NumberFormat("en-PK").format(Math.round(n));

  const totalMeters = rows.reduce((s, r) => s + (r.meters ?? 0), 0);
  const totalRolls = rows.reduce((s, r) => s + (r.rolls ?? 0), 0);

  return (
    <Shell active="grey-despatch">
      <div className="animate-in">
        <div className="mb-8">
          <h1 className="page-title">Grey Cloth Despatch</h1>
          <p className="text-[13px] text-[var(--muted)] mt-2">
            {rows.length} despatches
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black border border-black mb-10">
          <div className="bg-white p-6">
            <div className="stat-value">{rows.length}</div>
            <div className="stat-label">Total Despatches</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalMeters)}</div>
            <div className="stat-label">Total Meters</div>
          </div>
          <div className="bg-white p-6">
            <div className="stat-value">{formatNum(totalRolls)}</div>
            <div className="stat-label">Total Rolls</div>
          </div>
        </div>

        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>No.</th>
              <th>Party</th>
              <th>Product</th>
              <th className="text-right">Meters</th>
              <th className="text-right">Rolls</th>
              <th>Vehicle</th>
              <th>Bilty No.</th>
              <th>Gate Pass</th>
              <th className="text-right">Chalan</th>
              <th className="text-right">Notify</th>
              <th className="text-right">Issue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono text-[13px]">{r.despatchDate}</td>
                <td className="mono font-bold">{r.despatchNo}</td>
                <td className="text-[13px]">{r.party}</td>
                <td className="text-[13px]">{r.product ?? "-"}</td>
                <td className="text-right mono">{r.meters != null ? formatNum(r.meters) : "-"}</td>
                <td className="text-right mono">{r.rolls != null ? formatNum(r.rolls) : "-"}</td>
                <td className="mono text-[13px]">{r.vehicleNo ?? "-"}</td>
                <td className="mono text-[13px]">{r.biltyNo ?? "-"}</td>
                <td className="mono text-[13px]">{r.gatePassNo ?? "-"}</td>
                <td className="text-right">
                  <Link
                    href={`/inventory/grey-despatch/${r.id}/chalan`}
                    target="_blank"
                    className="btn btn-outline btn-sm"
                  >
                    Print
                  </Link>
                </td>
                <td className="text-right">
                  <WhatsAppModal
                    party={r.party}
                    despatchNo={r.despatchNo}
                    date={r.despatchDate}
                    vehicleNo={r.vehicleNo}
                    biltyNo={r.biltyNo}
                    meters={r.meters}
                    rolls={r.rolls}
                  />
                </td>
                <td className="text-right">
                  <Link
                    href={`/tickets/new?party=${encodeURIComponent(String(r.partyCode ?? r.party))}`}
                    className="btn btn-outline btn-sm"
                  >
                    Report Issue
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </Shell>
  );
}
