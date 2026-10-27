import assert from "node:assert/strict";
import { test } from "node:test";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { and, eq, inArray, sql } from "drizzle-orm";

// Every mutation is against a disposable copy of the fabricated demo database.
const directory = mkdtempSync(join(tmpdir(), "weaving-integrity-"));
const database = join(directory, "test.db");
copyFileSync("demo/demo.db", database);
Object.assign(process.env, { NODE_ENV: "test" });
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.DEMO_DB = "";
process.env.LOCAL_DB_PATH = database;
const { db, schema } = await import("../src/db/index");
const { assertYarnPurchaseStock, PurchaseStockError } = await import("../src/lib/yarn-purchase-stock");
const { assertYarnSaleStock, YarnStockError } = await import("../src/lib/yarn-sale-stock");
const { assertLoomAvailable, LoomTakenError, recomputeBeamStatus, canKnotBeam } = await import("../src/lib/beam-cycle");
const { captureVoucher, recordVoucherChange } = await import("../src/lib/change-history");
const actor = { userId: 1, login: "regression", fullName: "Regression", roleName: "ADMIN" };
const { clearVoucher } = await import("../src/lib/gl-post");
const { activeSession } = await import("../src/lib/active-session");
const { createToken, SESSION_LONG_TTL } = await import("../src/lib/session-token");
const { proxy } = await import("../src/proxy");
const { NextRequest } = await import("next/server");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SaleLine = { batchNo: string | null; count: string | null; lbs: number; qty: number };

// Exercise the actual inline server-action transactions, without rendering a page
// or supplying real credentials. The source is parsed, never copied into the test.
function extract(file: string, predicate: (node: ts.Node) => boolean): string {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let hit: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (!hit && predicate(node)) hit = node;
    if (!hit) ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(hit, `Source expression not found in ${file}`);
  return hit.getText(source);
}
function transaction(file: string, marker: string): string {
  const source = extract(file, node => ts.isCallExpression(node) && node.expression.getText() === "db.transaction" && !!node.arguments[0]?.getText().includes(marker));
  const parsed = ts.createSourceFile("transaction.ts", source, ts.ScriptTarget.Latest, true);
  const statement = parsed.statements[0];
  assert.ok(ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression));
  return statement.expression.arguments[0].getText(parsed);
}
function compile<T>(expression: string, deps: Record<string, unknown>): T {
  const js = ts.transpileModule(`const selected = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(deps), `${js}\nreturn selected;`)(...Object.values(deps)) as T;
}
class Redirect extends Error { constructor(readonly url: string) { super(url); } }
const redirect = (url: string): never => { throw new Redirect(url); };
const shared = { assertYarnPurchaseStock, PurchaseStockError, actor, captureVoucher, recordVoucherChange, db, schema, eq, and, inArray, sql, assertYarnSaleStock, clearVoucher, recomputeBeamStatus };
const saleCreate = transaction("src/app/external/yarn/sale/page.tsx", "const existingRows");
const saleEdit = transaction("src/app/external/yarn/sale/page.tsx", "assertYarnSaleStock(tx, validLines, id)");
let serial = 0;
async function purchase(count: string, lbs: number) {
  const name = `REG-PUR-${++serial}`;
  const [header] = await db.insert(schema.extYarnPurVoucher).values({ vNo: name, vDate: "2026-10-28" }).returning();
  const batch = `${name}/A`;
  await db.insert(schema.extYarnPurVoucherLine).values({ voucherId: header.id, batchNo: batch, count, qty: lbs / 100, lbs });
  return batch;
}
function saveSale(validLines: SaleLine[], id?: number, connection = db) {
  const fields = Object.fromEntries(["type", "loomType", "party", "broker", "term", "dueDate", "img", "cont", "pur", "bal", "stockBag", "stockCon", "stockLbs", "ratePv", "amtPv", "pl", "avgRate", "remarks", "pendingFinance"].map(k => [k, null]));
  const callback = compile<(tx: Tx) => Promise<number | void>>(id ? saleEdit : saleCreate, {
    ...shared, ...fields, type: "SAL", term: "CASH", validLines, id, vDate: "2026-10-28", posting: "N", nowIso: "2026-10-28T01:00:00Z", doGl: false,
    providedVNo: `REG-SALE-${++serial}`,
  });
  return connection.transaction(callback);
}
const line = (batchNo: string | null, count: string, lbs: number): SaleLine => ({ batchNo, count, lbs, qty: lbs / 100 });

await test("yarn sale transactions", async t => {
  await t.test("two simultaneous saves cannot both consume the same stock", async () => {
    const batch = await purchase("REG-RACE", 100);
    const other = drizzle(createClient({ url: `file:${database}` }), { schema });
    const attempts = await Promise.allSettled([saveSale([line(batch, "REG-RACE", 80)]), saveSale([line(batch, "REG-RACE", 80)], undefined, other)]);
    assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1, attempts.map(r => r.status === "rejected" ? String(r.reason) : "saved").join("; "));
    const [sum] = await db.select({ lbs: sql<number>`sum(${schema.extYarnSalVoucherLine.lbs})` }).from(schema.extYarnSalVoucherLine).where(eq(schema.extYarnSalVoucherLine.batchNo, batch));
    assert.equal(sum.lbs, 80);
    // Whether the other local SQLite writer waited or got SQLITE_BUSY, retry
    // must recheck committed stock rather than reuse a pre-transaction result.
    await assert.rejects(saveSale([line(batch, "REG-RACE", 80)]), YarnStockError);
  });
  await t.test("legacy count-only sales reduce availability of later batch sales", async () => {
    const batch = await purchase("REG-LEGACY", 100);
    await saveSale([line(null, "REG-LEGACY", 80)]);
    await assert.rejects(saveSale([line(batch, "REG-LEGACY", 100)]), (e: unknown) => e instanceof YarnStockError && e.available === 20);
    await saveSale([line(batch, "REG-LEGACY", 20)]);
  });
  await t.test("mixed batched/unbatched rows are checked together and rejected atomically", async () => {
    const batch = await purchase("REG-MIX", 100);
    await assert.rejects(saveSale([line(batch, "REG-MIX", 60), line(null, "REG-MIX", 60)]), YarnStockError);
    assert.equal((await db.select().from(schema.extYarnSalVoucherLine).where(eq(schema.extYarnSalVoucherLine.count, "REG-MIX"))).length, 0);
    await saveSale([line(batch, "REG-MIX", 60), line(null, "REG-MIX", 40)]);
  });
  await t.test("edits exclude their old quantity but still protect other sales", async () => {
    const batch = await purchase("REG-EDIT", 100);
    const id = await saveSale([line(batch, "REG-EDIT", 80)]);
    assert.equal(typeof id, "number");
    await saveSale([line(batch, "REG-EDIT", 90)], id as number);
    await assert.rejects(saveSale([line(batch, "REG-EDIT", 110)], id as number), YarnStockError);
    const [saved] = await db.select().from(schema.extYarnSalVoucherLine).where(eq(schema.extYarnSalVoucherLine.voucherId, id as number));
    assert.equal(saved.lbs, 90);
  });
});

await test("U mount action respects both occupancy records", async t => {
  await db.insert(schema.looms).values({ loomNo: 9001, shed: "REG", type: "AIRJET", statusWrk: "RUNNING", currentBeam: "REG-OTHER" });
  await db.insert(schema.beams).values([
    { beamNo: "REG-OTHER", type: "OWN", statusWrk: "RUNNING", loomNo: 9001, shed: "REG" },
    { beamNo: "REG-MOUNT", type: "OWN", statusWrk: "LOADED" },
  ]);
  const [kn] = await db.insert(schema.intKnottingSarning).values({ vNo: "REG-KN", vDate: "2026-10-28" }).returning();
  const [kl] = await db.insert(schema.intKnottingSarningLine).values({ knottingId: kn.id, srNo: 1, beamNo: "REG-MOUNT", lmHash: "9001", shdHash: "REG" }).returning();
  const mount = compile<(fd: FormData) => Promise<void>>(extract("src/app/inventory/knotting/page.tsx", n => ts.isFunctionDeclaration(n) && n.name?.text === "mountBeam"), {
    ...shared, assertLoomAvailable, LoomTakenError, canKnotBeam, getSession: async () => actor, intVal: Number, redirect, revalidatePath: () => {},
  });
  const form = new FormData(); form.set("mount_line_id", String(kl.id));
  const busy = (e: unknown) => e instanceof Redirect && e.url.includes("error=loom_busy");
  await t.test("occupied loom rejects the mount and preserves both beam states", async () => {
    await assert.rejects(mount(form), busy);
    const [b] = await db.select().from(schema.beams).where(eq(schema.beams.beamNo, "REG-MOUNT"));
    assert.equal(b.statusWrk, "LOADED");
    const [loom] = await db.select().from(schema.looms).where(eq(schema.looms.shed, "REG"));
    assert.equal(loom.currentBeam, "REG-OTHER");
  });
  await t.test("beam record alone blocks a mount even when loom pointer is missing", async () => {
    await db.update(schema.looms).set({ currentBeam: null }).where(eq(schema.looms.shed, "REG"));
    await assert.rejects(mount(form), busy);
  });
  await t.test("loom pointer alone blocks a mount even when beam location is missing", async () => {
    await db.update(schema.looms).set({ currentBeam: "REG-OTHER" }).where(eq(schema.looms.shed, "REG"));
    await db.update(schema.beams).set({ loomNo: null }).where(eq(schema.beams.beamNo, "REG-OTHER"));
    await assert.rejects(mount(form), busy);
  });
  await t.test("finished beam permits mounting and repeating U on the same mount", async () => {
    await db.update(schema.beams).set({ statusWrk: "EMPTY" }).where(eq(schema.beams.beamNo, "REG-OTHER"));
    const success = (e: unknown) => e instanceof Redirect && e.url === `/inventory/knotting?id=${kn.id}`;
    await assert.rejects(mount(form), success);
    await assert.rejects(mount(form), success);
    const [b] = await db.select().from(schema.beams).where(eq(schema.beams.beamNo, "REG-MOUNT"));
    assert.equal(b.statusWrk, "KNOTTING"); assert.equal(b.loomNo, 9001);
  });
});

await test("production edits preserve despatched cloth", async t => {
  const [prod] = await db.insert(schema.intDailyProduction).values({ vNo: "REG-DP", vDate: "2026-10-28" }).returning();
  await db.insert(schema.intDailyProductionSet).values([
    { productionId: prod.id, srNo: 1, mmThanSrNo: "REG-DP/A", totalCount: 100 },
    { productionId: prod.id, srNo: 2, mmThanSrNo: "REG-DP/B", totalCount: 50 },
  ]);
  const [desp] = await db.insert(schema.intGreyDespatch).values({ vNo: "REG-GDP", vDate: "2026-10-28", lockState: "EDIT", convRate: 10, amnt: 1000, amtTot: 1000, thanQty: 1 }).returning();
  await db.insert(schema.intGreyDespatchLine).values({ despatchId: desp.id, srNo: 1, tSrNo: "REG-DP/A" as unknown as number, lengthMtrs: 100 });
  const source = transaction("src/app/inventory/daily-production/page.tsx", "const oldSets2");
  const edit = (validSets: { srNo: number; mmThanSrNo: string; totalCount: number }[]) => db.transaction(compile<(tx: Tx) => Promise<void>>(source, {
    ...shared, validSets, id: prod.id, header: { vDate: "2026-10-28" }, nowIso: "2026-10-28T02:00:00Z", formVNo: "REG-DP", gridRowOf: [0, 1], thanLetter: () => "B",
  }));
  const b = { srNo: 2, mmThanSrNo: "REG-DP/B", totalCount: 50 };
  await t.test("erasing or renaming a despatched than rolls back the entire edit", async () => {
    await assert.rejects(edit([b]), /THAN_DESPATCHED:REG-DP\/A:REG-GDP/);
    await assert.rejects(edit([{ srNo: 1, mmThanSrNo: "REG-DP/C", totalCount: 100 }, b]), /THAN_DESPATCHED/);
    assert.equal((await db.select().from(schema.intDailyProductionSet).where(eq(schema.intDailyProductionSet.productionId, prod.id))).length, 2);
    const [l] = await db.select().from(schema.intGreyDespatchLine).where(eq(schema.intGreyDespatchLine.despatchId, desp.id));
    assert.equal(l.lengthMtrs, 100);
  });
  await t.test("EDIT still allows metre corrections and updates despatch amount", async () => {
    await edit([{ srNo: 1, mmThanSrNo: "REG-DP/A", totalCount: 125.25 }, b]);
    const [l] = await db.select().from(schema.intGreyDespatchLine).where(eq(schema.intGreyDespatchLine.despatchId, desp.id));
    const [h] = await db.select().from(schema.intGreyDespatch).where(eq(schema.intGreyDespatch.id, desp.id));
    assert.equal(l.lengthMtrs, 125.25); assert.equal(h.amnt, 1252.5);
  });
  await t.test("FINAL still refuses metre changes", async () => {
    await db.update(schema.intGreyDespatch).set({ lockState: "FINAL" }).where(eq(schema.intGreyDespatch.id, desp.id));
    await assert.rejects(edit([{ srNo: 1, mmThanSrNo: "REG-DP/A", totalCount: 140 }, b]), /THAN_LOCKED/);
  });
  await t.test("production can be removed after removing it from the despatch", async () => {
    await db.delete(schema.intGreyDespatchLine).where(eq(schema.intGreyDespatchLine.despatchId, desp.id));
    await edit([b]);
    assert.equal((await db.select().from(schema.intDailyProductionSet).where(eq(schema.intDailyProductionSet.productionId, prod.id))).length, 1);
  });
});

await test("existing sessions follow current user state", async t => {
  const [user] = await db.insert(schema.users).values({ login: "reg-session", password: "unused", fullName: "Regression", roleName: "ADMIN", status: "A" }).returning();
  const token = createToken({ userId: user.id, login: user.login, fullName: user.fullName, roleName: user.roleName }, SESSION_LONG_TTL);
  const request = (path: string, method = "GET") => new NextRequest(`http://localhost${path}`, { method, headers: { cookie: `session=${token}` } });
  await t.test("active sessions work; invalid and expired tokens fail", async () => {
    assert.equal((await activeSession(token))?.userId, user.id);
    assert.equal((await proxy(request("/"))).status, 200);
    assert.equal(await activeSession(`${token}bad`), null);
    assert.equal(await activeSession(createToken({ userId: user.id, login: user.login, fullName: user.fullName, roleName: user.roleName }, -1)), null);
  });
  await t.test("disabling the user immediately blocks pages, APIs and actions", async () => {
    await db.update(schema.users).set({ status: "I" }).where(eq(schema.users.id, user.id));
    assert.equal(await activeSession(token), null);
    assert.equal((await proxy(request("/"))).headers.get("location"), "http://localhost/login");
    assert.equal((await proxy(request("/api/backup"))).status, 401);
    assert.equal((await proxy(request("/inventory/knotting", "POST"))).status, 401);
  });
  await t.test("role and module changes override old admin permissions", async () => {
    await db.update(schema.users).set({ status: "A", roleName: "OPERATOR", allowedModules: "my-tasks" }).where(eq(schema.users.id, user.id));
    assert.equal((await activeSession(token))?.roleName, "OPERATOR");
    assert.equal((await proxy(request("/api/backup"))).status, 403);
    assert.equal((await proxy(request("/settings/users", "POST"))).status, 403);
  });
  await t.test("deleting the user revokes their session", async () => {
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
    assert.equal(await activeSession(token), null);
  });
});

const purchaseEdit = transaction("src/app/external/yarn/purchase/page.tsx", "assertYarnPurchaseStock(tx, id, validLines)");
async function editPurchase(batch: string, count: string, lbs: number, connection = db) {
  const [row] = await db.select().from(schema.extYarnPurVoucherLine).where(eq(schema.extYarnPurVoucherLine.batchNo, batch));
  const fields = Object.fromEntries(["loomType", "bmParty", "party", "broker", "dueDate", "img", "cont", "pur", "bal", "salAvgRate", "purAvgRate", "percent", "perBag", "rkd", "lotNo", "pendingFinance"].map(k => [k, null]));
  const action = compile<(tx: Tx) => Promise<void>>(purchaseEdit, {
    ...shared, ...fields, id: row.voucherId, validLines: [line(batch, count, lbs)], vDate: "2026-10-28", type: "PUR", term: "CASH", posting: "N", nowIso: "2026-10-28T03:00:00Z", existingLvNo: 0, canPostGL: false,
  });
  await connection.transaction(action);
}
await test("purchase corrections and history", async t => {
  const batch = await purchase("REG-PUR-GUARD", 100);
  const [p] = await db.select().from(schema.extYarnPurVoucherLine).where(eq(schema.extYarnPurVoucherLine.batchNo, batch));
  const remove = compile<(fd: FormData) => Promise<void>>(extract("src/app/external/yarn/purchase/page.tsx", n => ts.isFunctionDeclaration(n) && n.name?.text === "deleteVoucher"), {
    ...shared, getSession: async () => actor, redirect, refuseIfLocked: async () => {}, revalidatePath: () => {},
  });
  const fd = new FormData(); fd.set("id", String(p.voucherId));
  await saveSale([line(batch, "REG-PUR-GUARD", 80)]);
  await t.test("sold batches cannot shrink below sales, switch counts, or be deleted", async () => {
    await assert.rejects(editPurchase(batch, "REG-PUR-GUARD", 70), PurchaseStockError);
    await assert.rejects(editPurchase(batch, "REG-OTHER-COUNT", 100), PurchaseStockError);
    await assert.rejects(remove(fd), (e: unknown) => e instanceof Redirect && e.url.includes("batch_sold"));
    assert.equal((await db.select().from(schema.extYarnPurVoucherLine).where(eq(schema.extYarnPurVoucherLine.batchNo, batch)))[0].lbs, 100);
  });
  await t.test("valid correction is logged with actor and before/after values", async () => {
    await editPurchase(batch, "REG-PUR-GUARD", 90);
    const history = await db.all<{ actor_login: string; changes: string }>(sql`SELECT actor_login,changes FROM record_history WHERE kind='yarn_purchase' AND record_id=${p.voucherId}`);
    assert.equal(history.length, 1);
    assert.equal(history[0].actor_login, "regression");
    assert.ok(JSON.parse(history[0].changes).some((c: { field: string; before: number; after: number }) => c.field === "Line 1: lbs" && c.before === 100 && c.after === 90));
    assert.ok(!history[0].changes.includes("password"));
    await editPurchase(batch, "REG-PUR-GUARD", 90);
    assert.equal((await db.all(sql`SELECT id FROM record_history WHERE kind='yarn_purchase' AND record_id=${p.voucherId}`)).length, 1);
  });
  await t.test("count-only sales also block purchase shrinkage", async () => {
    const legacy = await purchase("REG-PUR-LEGACY", 100);
    await saveSale([line(null, "REG-PUR-LEGACY", 80)]);
    await assert.rejects(editPurchase(legacy, "REG-PUR-LEGACY", 70), PurchaseStockError);
  });
  await t.test("purchase shrink racing a sale cannot leave negative stock", async () => {
    const racing = await purchase("REG-PUR-RACE", 100);
    const other = drizzle(createClient({ url: `file:${database}` }), { schema });
    const attempts = await Promise.allSettled([editPurchase(racing, "REG-PUR-RACE", 50), saveSale([line(racing, "REG-PUR-RACE", 80)], undefined, other)]);
    assert.equal(attempts.filter(a => a.status === "fulfilled").length, 1);
    const [supply] = await db.select().from(schema.extYarnPurVoucherLine).where(eq(schema.extYarnPurVoucherLine.batchNo, racing));
    const [sold] = await db.select({ lbs: sql<number>`coalesce(sum(${schema.extYarnSalVoucherLine.lbs}),0)` }).from(schema.extYarnSalVoucherLine).where(eq(schema.extYarnSalVoucherLine.batchNo, racing));
    assert.ok((supply.lbs ?? 0) >= sold.lbs);
  });
  await t.test("uncommitted history rolls back with the failed save", async () => {
    const count = (await db.all(sql`SELECT id FROM record_history`)).length;
    await assert.rejects(db.transaction(async tx => {
      const before = await captureVoucher(tx, "yarn_purchase", p.voucherId);
      await recordVoucherChange(tx, actor, "yarn_purchase", p.voucherId, before, null);
      throw new Error("rollback-test");
    }), /rollback-test/);
    assert.equal((await db.all(sql`SELECT id FROM record_history`)).length, count);
  });
});
