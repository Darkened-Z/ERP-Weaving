import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { createClient } from "@libsql/client";
import { createDatabaseBackup, restoreDatabaseBackup, parseDatabaseBackup } from "../src/lib/database-backup";

const folder = mkdtempSync(join(tmpdir(), "weaving-restore-"));
copyFileSync("demo/demo.db", join(folder, "source.db"));
const source = createClient({ url: `file:${join(folder, "source.db")}` });
await source.execute("CREATE TABLE backup_blob_test(id INTEGER PRIMARY KEY AUTOINCREMENT, data BLOB, value REAL)");
await source.execute({ sql: "INSERT INTO backup_blob_test(data,value) VALUES (?,?)", args: [new Uint8Array([0,1,255]), 878.25] });
const backup = await createDatabaseBackup(source, "regression");
await test("downloaded gzip snapshots and plain JSON parse without losing data", () => {
  const bytes = Buffer.from(JSON.stringify(backup));
  assert.deepEqual(parseDatabaseBackup(bytes), backup);
  assert.deepEqual(parseDatabaseBackup(gzipSync(bytes)), backup);
  assert.throws(() => parseDatabaseBackup(Buffer.from('{"meta":{"version":1}}')), /version 2/);
});
await test("complete backup restores schema, values, sequences and blobs", async () => {
  const target = createClient({ url: `file:${join(folder, "restored.db")}` });
  const result = await restoreDatabaseBackup(target, backup);
  assert.equal(result.checksum, backup.checksum);
  assert.equal(result.foreignKeyIssues, 0);
  const row = (await target.execute("SELECT data,value FROM backup_blob_test")).rows[0];
  assert.equal(row.value, 878.25);
  assert.deepEqual(Buffer.from(row.data as ArrayBuffer), Buffer.from([0,1,255]));
});
await test("tampered backup and existing target are refused", async () => {
  const target = createClient({ url: `file:${join(folder, "empty.db")}` });
  await assert.rejects(restoreDatabaseBackup(target, { ...backup, checksum: "wrong" }), /checksum/);
  await assert.rejects(restoreDatabaseBackup(source, backup), /empty/);
});
await test("remote restoration is refused before any network write", async () => {
  const remote = createClient({ url: "https://restore-test.invalid" });
  await assert.rejects(restoreDatabaseBackup(remote, backup), /local database/);
});
