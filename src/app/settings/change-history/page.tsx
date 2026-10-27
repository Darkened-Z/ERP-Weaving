import { Shell } from "@/components/shell";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ensureChangeHistory, type FieldChange } from "@/lib/change-history";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export default async function ChangeHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin("/");
  await ensureChangeHistory(db);
  const q = (await searchParams).q?.trim() ?? "";
  const rows = await db.all<{ id: number; changed_at: string; actor_login: string; kind: string; voucher_no: string; action: string; changes: string }>(sql`
    SELECT id,changed_at,actor_login,kind,voucher_no,action,changes FROM record_history
    WHERE ${q}='' OR instr(lower(voucher_no),lower(${q}))>0 OR instr(lower(actor_login),lower(${q}))>0
    ORDER BY id DESC LIMIT 200`);
  const display = (value: unknown) => value == null ? "—" : String(value);
  const kindLabels: Record<string, string> = { yarn_purchase: "Yarn purchase", yarn_sale: "Yarn sale", production: "Production", knotting: "Knotting" };
  return <Shell active="change-history">
    <h1 className="page-title mb-4">Change History</h1>
    <p className="text-sm mb-4">Who changed yarn purchases, yarn sales, production and knotting. History starts when this feature is enabled. Showing the latest 200 matching changes.</p>
    <form className="flex gap-2 mb-4"><input name="q" defaultValue={q} placeholder="Voucher number or user" aria-label="Find changes" className="input-box min-w-0 flex-1" /><button className="btn">Find</button></form>
    <div className="space-y-3">{rows.map(row => <details key={row.id} className="border p-3">
      <summary className="cursor-pointer text-sm">{kindLabels[row.kind] ?? row.kind} · {row.voucher_no} · {row.action} · {row.actor_login} · {new Date(row.changed_at).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}</summary>
      <div className="overflow-x-auto mt-3"><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>
        {(JSON.parse(row.changes) as FieldChange[]).map((change, i) => <tr key={i}><td>{change.field.replaceAll("_", " ")}</td><td className="mono">{display(change.before)}</td><td className="mono">{display(change.after)}</td></tr>)}
      </tbody></table></div>
    </details>)}{!rows.length && <p>No matching changes recorded yet.</p>}</div>
  </Shell>;
}
