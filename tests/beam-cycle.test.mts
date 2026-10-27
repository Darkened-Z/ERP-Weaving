import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Import the real lifecycle code only after directing it to an isolated DB.
const directory = mkdtempSync(join(tmpdir(), "weaving-beam-test-"));
const databasePath = join(directory, "test.db");
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.DEMO_DB = "";
process.env.LOCAL_DB_PATH = databasePath;
const { db } = await import("../src/db/index");
const { recomputeBeamStatus, LoomTakenError, canKnotBeam } = await import("../src/lib/beam-cycle");
const client = db.$client;

await client.executeMultiple(`
  CREATE TABLE beams (beam_no TEXT PRIMARY KEY, br_date TEXT, br_vno TEXT, kn_vno TEXT,
    kn_date TEXT, shed TEXT, loom_no INTEGER, length REAL, status_loc TEXT, status_wrk TEXT);
  CREATE TABLE looms (id INTEGER PRIMARY KEY, loom_no INTEGER, shed TEXT, status_wrk TEXT,
    current_beam TEXT, current_contract TEXT);
  CREATE TABLE int_warped_beam_receiving (v_no TEXT, posted_date TEXT);
  CREATE TABLE int_daily_production (id INTEGER PRIMARY KEY, v_date TEXT, posted_date TEXT, shed_no TEXT);
  CREATE TABLE int_daily_production_set (id INTEGER PRIMARY KEY, production_id INTEGER, beam_no TEXT,
    beam_status TEXT, loom_no INTEGER, total_count REAL, rej_count REAL, b_length REAL,
    rcvd_mtr REAL, diff REAL, shrinkage REAL);
  CREATE TABLE int_knotting_sarning (id INTEGER PRIMARY KEY, v_no TEXT);
  CREATE TABLE int_knotting_sarning_line (knotting_id INTEGER, beam_no TEXT, shd_hash TEXT, lm_hash TEXT);
`);

async function seed(beam = "AJ-13", loom = 9, length = 3889) {
  await client.executeMultiple(`
    DELETE FROM beams; DELETE FROM looms; DELETE FROM int_daily_production_set;
    DELETE FROM int_daily_production; DELETE FROM int_knotting_sarning_line;
    DELETE FROM int_knotting_sarning; DELETE FROM int_warped_beam_receiving;
  `);
  await client.execute({ sql: `INSERT INTO beams VALUES (?, '2026-10-10', 'SET-1', 'IKS-1', '2026-10-12', '3', NULL, ?, 'L-ROLL', 'EMPTY')`, args: [beam, length] });
  await client.execute({ sql: `INSERT INTO looms VALUES (1, ?, '3', 'S', NULL, NULL)`, args: [loom] });
  await client.execute(`INSERT INTO int_warped_beam_receiving VALUES ('SET-1', '2026-10-10T08:00:00Z')`);
  await client.execute(`INSERT INTO int_knotting_sarning VALUES (1, 'IKS-1')`);
  await client.execute({ sql: `INSERT INTO int_knotting_sarning_line VALUES (1, ?, '3', ?)`, args: [beam, String(loom)] });
}

async function production(id: number, beam: string | null, loom: number, status: string, metres: number, length: number, date = "2026-10-27") {
  await client.execute({ sql: `INSERT INTO int_daily_production VALUES (?, ?, '2026-10-27T09:00:00Z', '3')`, args: [id, date] });
  await client.execute({ sql: `INSERT INTO int_daily_production_set (id, production_id, beam_no, beam_status, loom_no, total_count, b_length)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, args: [id, id, beam, status, loom, metres, length] });
}

async function state(beam: string) {
  const b = (await client.execute({ sql: "SELECT beam_no, status_wrk, status_loc, loom_no FROM beams WHERE beam_no = ?", args: [beam] })).rows[0];
  const loom = (await client.execute("SELECT * FROM looms WHERE id = 1")).rows[0];
  return { b, loom };
}

test("beam lifecycle follows entered statuses, not estimated length", async (t) => {
  for (const sample of [
    { beam: "AJ-13", loom: 9, length: 3889, metres: 3922.96 },
    { beam: "AJ-35", loom: 17, length: 1350, metres: 1556.5 },
  ]) {
    await t.test(`restores ${sample.beam} on Shed 3 loom ${sample.loom} despite excess metres`, async () => {
      await seed(sample.beam, sample.loom, sample.length);
      await production(1, sample.beam, sample.loom, "RUNNING", sample.metres, sample.length);
      await db.transaction(tx => recomputeBeamStatus(tx, sample.beam));
      const { b, loom } = await state(sample.beam);
      assert.equal(b.status_wrk, "RUNNING");
      assert.equal(b.status_loc, "RUNNING");
      assert.equal(b.loom_no, sample.loom);
      assert.equal(loom.current_beam, sample.beam);
      assert.equal(loom.status_wrk, "RUNNING");
      const [line] = (await client.execute("SELECT rcvd_mtr, diff FROM int_daily_production_set")).rows;
      assert.equal(line.rcvd_mtr, sample.metres);
      assert.equal(line.diff, Math.round((sample.length - sample.metres) * 100) / 100);
      // An edit/re-save must not empty it again.
      await db.transaction(tx => recomputeBeamStatus(tx, sample.beam));
      assert.equal((await state(sample.beam)).b.status_wrk, "RUNNING");
    });
  }
  await t.test("reaching the exact length on F-ROLL keeps the loom occupied", async () => {
    await seed();
    await production(1, "AJ-13", 9, "F-ROLL", 3889, 3889);
    await db.transaction(tx => recomputeBeamStatus(tx, "AJ-13"));
    assert.equal((await state("AJ-13")).b.status_wrk, "F-ROLL");
    assert.equal((await state("AJ-13")).loom.current_beam, "AJ-13");
  });
  for (const status of ["L-ROLL", "EMPTY"]) {
    await t.test(`explicit ${status} still releases the loom`, async () => {
      await seed();
      await production(1, "AJ-13", 9, "RUNNING", 100, 3889);
      await db.transaction(tx => recomputeBeamStatus(tx, "AJ-13"));
      await production(2, "AJ-13", 9, status, 20, 3889);
      await db.transaction(tx => recomputeBeamStatus(tx, "AJ-13"));
      const { b, loom } = await state("AJ-13");
      assert.equal(b.status_wrk, "EMPTY");
      assert.equal(b.loom_no, null);
      assert.equal(loom.current_beam, null);
      assert.equal(loom.status_wrk, "S");
    });
  }
  await t.test("R-CUT remains mounted and cannot be offered for another knotting", async () => {
    await seed();
    await production(1, "AJ-13", 9, "R-CUT", 3922.96, 3889);
    await db.transaction(tx => recomputeBeamStatus(tx, "AJ-13"));
    const { b, loom } = await state("AJ-13");
    assert.equal(b.status_wrk, "R-CUT");
    assert.equal(loom.current_beam, "AJ-13");
    assert.equal(canKnotBeam("R-CUT", 9), false);
    assert.equal(canKnotBeam("R-CUT", null), true);
    assert.equal(canKnotBeam("LOADED", null), true);
    assert.equal(canKnotBeam("RUNNING", 9), false);
  });
  await t.test("editing earlier production cannot overrule the later L-ROLL", async () => {
    await seed();
    await production(1, "AJ-13", 9, "RUNNING", 100, 3889);
    await production(2, "AJ-13", 9, "L-ROLL", 20, 3889);
    await db.transaction(tx => recomputeBeamStatus(tx, "AJ-13"));
    await client.execute("UPDATE int_daily_production_set SET total_count=110 WHERE id=1");
    await db.transaction(tx => recomputeBeamStatus(tx, "AJ-13"));
    assert.equal((await state("AJ-13")).b.status_wrk, "EMPTY");
  });
  await t.test("deleting the last production leaves a valid knotting mount", async () => {
    await seed();
    await db.transaction(tx => recomputeBeamStatus(tx, "AJ-13"));
    assert.equal((await state("AJ-13")).b.status_wrk, "KNOTTING");
    assert.equal((await state("AJ-13")).loom.current_beam, "AJ-13");
  });
  await t.test("previous-cycle last roll does not finish a newly received beam", async () => {
    await seed();
    await production(1, "AJ-13", 9, "L-ROLL", 100, 3889, "2026-10-09");
    await production(2, "AJ-13", 9, "RUNNING", 125, 3889);
    await db.transaction(tx => recomputeBeamStatus(tx, "AJ-13"));
    assert.equal((await state("AJ-13")).b.status_wrk, "RUNNING");
    assert.equal((await client.execute("SELECT rcvd_mtr FROM int_daily_production_set WHERE id=2")).rows[0].rcvd_mtr, 125);
  });
  await t.test("a restored beam cannot displace another mounted beam", async () => {
    await seed();
    await production(1, "AJ-13", 9, "RUNNING", 3922.96, 3889);
    await client.execute("INSERT INTO beams (beam_no, shed, loom_no, status_wrk) VALUES ('OTHER', '3', 9, 'RUNNING')");
    await client.execute("UPDATE looms SET current_beam='OTHER', status_wrk='RUNNING' WHERE id=1");
    await assert.rejects(db.transaction(tx => recomputeBeamStatus(tx, "AJ-13")), LoomTakenError);
    assert.equal((await state("AJ-13")).loom.current_beam, "OTHER");
    assert.equal((await state("AJ-13")).b.status_wrk, "EMPTY");
  });
});
