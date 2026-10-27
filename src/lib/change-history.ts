import { db } from "@/db";
import { sql } from "drizzle-orm";
import type { Session } from "./session-token";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type HistoryKind = "yarn_purchase" | "yarn_sale" | "production" | "knotting";
type Snapshot = { header: Record<string, unknown>[]; lines: Record<string, unknown>[] } | null;
const specs = {
  yarn_purchase: ["ext_yarn_pur_voucher", "ext_yarn_pur_voucher_line", "voucher_id", "v_no,v_date,party,posting", "batch_no,cont_no,count,count_dot,party_count,pack,do_no,qty,lbs,rate,rate_sv,brand,despatch_party"],
  yarn_sale: ["ext_yarn_sal_voucher", "ext_yarn_sal_voucher_line", "voucher_id", "v_no,v_date,party,posting,lock_state", "batch_no,cont_no,count,count_dot,party_count,pack,do_no,qty,lbs,rate,amt,brand,despatch_party,remarks"],
  production: ["int_daily_production", "int_daily_production_set", "production_id", "v_no,v_date,shed_no,conv_cont_party", "sr_no,mm_than_sr_no,beam_no,beam_status,loom_no,a_count,b_count,c_count,cp_count,ppc_count,total_count,rej_count,rcvd_mtr,b_length,wast_wt_kg,shrinkage,cont_no"],
  knotting: ["int_knotting_sarning", "int_knotting_sarning_line", "knotting_id", "v_no,v_date,party,type", "sr_no,beam_no,beam_set_no,beam_length,shd_hash,lm_hash,k_date,kn_cont_no,ends,amount,extra_charger,ext_amt,net_amt,wt,mtr"],
} as const;

export async function ensureChangeHistory(connection: Tx | typeof db) {
  await connection.run(sql`CREATE TABLE IF NOT EXISTS record_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, changed_at TEXT NOT NULL,
    actor_id INTEGER NOT NULL, actor_login TEXT NOT NULL,
    kind TEXT NOT NULL, record_id INTEGER NOT NULL, voucher_no TEXT,
    action TEXT NOT NULL, changes TEXT NOT NULL
  )`);
  await connection.run(sql`CREATE INDEX IF NOT EXISTS ix_history_record ON record_history(kind, record_id, id)`);
}

/** Only business fields are captured: never passwords, photo data or tokens. */
export async function captureVoucher(tx: Tx, kind: HistoryKind, id: number): Promise<Snapshot> {
  const [headerTable, lineTable, fk, headerFields, lineFields] = specs[kind];
  const header = await tx.all<Record<string, unknown>>(sql`SELECT ${sql.raw(headerFields)} FROM ${sql.raw(headerTable)} WHERE id=${id}`);
  if (!header.length) return null;
  const lines = await tx.all<Record<string, unknown>>(sql`SELECT ${sql.raw(lineFields)} FROM ${sql.raw(lineTable)} WHERE ${sql.raw(fk)}=${id} ORDER BY id`);
  return { header, lines };
}

export type FieldChange = { field: string; before: unknown; after: unknown };
export function changedFields(before: Snapshot, after: Snapshot): FieldChange[] {
  const fields = (value: Snapshot) => {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value?.header[0] ?? {})) result[key] = v;
    value?.lines.forEach((row, index) => {
      for (const [key, v] of Object.entries(row)) result[`Line ${index + 1}: ${key}`] = v;
    });
    return result;
  };
  const old = fields(before), next = fields(after);
  return [...new Set([...Object.keys(old), ...Object.keys(next)])]
    .filter(key => JSON.stringify(old[key] ?? null) !== JSON.stringify(next[key] ?? null))
    .map(field => ({ field, before: old[field] ?? null, after: next[field] ?? null }));
}

export async function recordVoucherChange(tx: Tx, actor: Session, kind: HistoryKind, id: number, before: Snapshot, after: Snapshot, extra: FieldChange[] = []) {
  const changes = [...changedFields(before, after), ...extra];
  if (!changes.length) return;
  await ensureChangeHistory(tx);
  const action = before == null ? "CREATE" : after == null ? "DELETE" : "UPDATE";
  const voucher = String(after?.header[0]?.v_no ?? before?.header[0]?.v_no ?? id);
  await tx.run(sql`INSERT INTO record_history (changed_at,actor_id,actor_login,kind,record_id,voucher_no,action,changes)
    VALUES (${new Date().toISOString()},${actor.userId},${actor.login},${kind},${id},${voucher},${action},${JSON.stringify(changes)})`);
}
