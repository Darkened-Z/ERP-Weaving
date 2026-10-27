import type { Client, InValue, Value } from "@libsql/client";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

type StoredValue = string | number | null | { blob: string } | { bigint: string };
export type DatabaseBackup = {
  meta: { version: 2; generatedAt: string; generatedBy: string };
  schema: { type: string; name: string; sql: string }[];
  tables: Record<string, { columns: string[]; rows: StoredValue[][] }>;
  checksum: string;
};
export function parseDatabaseBackup(bytes: Buffer): DatabaseBackup {
  const content = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  const backup = JSON.parse(content.toString("utf8")) as DatabaseBackup;
  if (backup.meta?.version !== 2) throw new Error("Expected a version 2 database snapshot");
  return backup;
}
const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
const encode = (v: Value): StoredValue => v instanceof ArrayBuffer ? { blob: Buffer.from(v).toString("base64") } : typeof v === "bigint" ? { bigint: String(v) } : v;
const decode = (v: StoredValue): InValue => v && typeof v === "object" ? "blob" in v ? Buffer.from(v.blob, "base64") : BigInt(v.bigint) : v;
export const backupChecksum = (tables: DatabaseBackup["tables"]) => createHash("sha256").update(JSON.stringify(
  Object.keys(tables).sort().map(name => [name, tables[name].columns, tables[name].rows.map(row => JSON.stringify(row)).sort()]),
)).digest("hex");

/** One consistent read snapshot. Any missing/unreadable table fails the backup. */
export async function createDatabaseBackup(client: Client, generatedBy: string): Promise<DatabaseBackup> {
  const tx = await client.transaction("read");
  try {
    const catalog = await tx.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name");
    const schema = catalog.rows.map(r => ({ type: String(r.type), name: String(r.name), sql: String(r.sql) }));
    const tables: DatabaseBackup["tables"] = {};
    const names = schema.filter(s => s.type === "table").map(s => s.name);
    if ((await tx.execute("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'")).rows.length) names.push("sqlite_sequence");
    for (const name of names) {
      const result = await tx.execute(`SELECT * FROM ${quote(name)}`);
      tables[name] = { columns: result.columns, rows: result.rows.map(row => result.columns.map((_, i) => encode(row[i]))) };
    }
    await tx.commit();
    return { meta: { version: 2, generatedAt: new Date().toISOString(), generatedBy }, schema, tables, checksum: backupChecksum(tables) };
  } catch (e) {
    if (!tx.closed) await tx.rollback();
    throw e;
  } finally { tx.close(); }
}

/** Restore only into an empty LOCAL database; never accept a remote target. */
export async function restoreDatabaseBackup(client: Client, backup: DatabaseBackup) {
  if (client.protocol !== "file") throw new Error("Restore target must be a local database");
  if (backup.meta.version !== 2 || backupChecksum(backup.tables) !== backup.checksum) throw new Error("Backup checksum/version is invalid");
  if ((await client.execute("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")).rows.length) throw new Error("Restore target must be empty");
  await client.execute("PRAGMA foreign_keys=OFF");
  const tx = await client.transaction("write");
  try {
    for (const entry of backup.schema.filter(s => s.type === "table")) await tx.execute(entry.sql);
    for (const [name, table] of Object.entries(backup.tables)) {
      if (name === "sqlite_sequence") await tx.execute("DELETE FROM sqlite_sequence");
      for (const row of table.rows) await tx.execute({ sql: `INSERT INTO ${quote(name)} (${table.columns.map(quote).join(",")}) VALUES (${table.columns.map(() => "?").join(",")})`, args: row.map(decode) });
    }
    for (const entry of backup.schema.filter(s => s.type !== "table")) await tx.execute(entry.sql);
    await tx.commit();
  } catch (e) {
    if (!tx.closed) await tx.rollback();
    throw e;
  } finally { tx.close(); }
  await client.execute("PRAGMA foreign_keys=ON");
  const integrity = await client.execute("PRAGMA integrity_check");
  if (integrity.rows.some(r => r[0] !== "ok")) throw new Error("Restored database failed integrity_check");
  const verified = await createDatabaseBackup(client, "restore-verification");
  if (verified.checksum !== backup.checksum) throw new Error("Restored rows do not match the backup");
  return { tables: Object.keys(backup.tables).length, rows: Object.values(backup.tables).reduce((sum, t) => sum + t.rows.length, 0), checksum: verified.checksum, foreignKeyIssues: (await client.execute("PRAGMA foreign_key_check")).rows.length };
}
