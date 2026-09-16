import { createClient } from "@libsql/client";
import path from "node:path";

// Slips saved before the "a quality always reads in full" rule stored the
// collapsed construction — GC-001 as "71 X 56  30/S MVS PV 65;35" instead of
// "71 X 56  30/S MVS PV 65;35 x 30/S MVS PV 65;35". Rewrites ONLY rows whose
// stored text is exactly the collapsed form of their own quality code: that
// proves the value was generated, so a quality somebody typed by hand is left
// untouched. Idempotent.

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const counts = await client.execute("SELECT count_code, description, type FROM yarn_counts");
const label = new Map(
  counts.rows.map((c) => [String(c.count_code), `${c.description ?? ""}${c.type ? ` ${c.type}` : ""}`.trim()]),
);
const lbl = (code) => (code == null || code === "" ? "" : label.get(String(code)) || String(code));

const constructions = await client.execute(
  "SELECT code, reed, pick, warp_count, warp_2, weft_count, weft_2 FROM grey_construction",
);

const forms = new Map();
for (const c of constructions.rows) {
  const rp = c.reed != null && c.pick != null ? `${c.reed} X ${c.pick}` : "";
  const warp = [c.warp_count, c.warp_2].map(lbl).filter(Boolean).join(" / ");
  const weft = [c.weft_count, c.weft_2].map(lbl).filter(Boolean).join(" / ");
  const collapsed = warp && weft ? (warp === weft ? warp : `${warp} × ${weft}`) : warp || weft;
  const full = warp && weft ? `${warp} × ${weft}` : warp || weft;
  const join = (wf) => `${rp}${rp && wf ? "  " : ""}${wf}`.trim();
  forms.set(c.code, { collapsed: join(collapsed), full: join(full) });
}

const rows = await client.execute(
  "SELECT id, v_no, dsp_quality, dsp_quality_desc FROM int_grey_despatch_dami WHERE dsp_quality_desc IS NOT NULL AND dsp_quality_desc <> ''",
);

let changed = 0;
for (const r of rows.rows) {
  const f = forms.get(r.dsp_quality);
  if (!f) {
    console.log(`  ? ${r.v_no}: quality ${r.dsp_quality} not in the construction master — left alone`);
    continue;
  }
  const stored = String(r.dsp_quality_desc).trim();
  if (stored === f.full) {
    console.log(`  = ${r.v_no}: already full`);
    continue;
  }
  if (stored !== f.collapsed) {
    console.log(`  ! ${r.v_no}: "${stored}" is not the generated form — left alone (hand written)`);
    continue;
  }
  await client.execute({
    sql: "UPDATE int_grey_despatch_dami SET dsp_quality_desc = ? WHERE id = ?",
    args: [f.full, r.id],
  });
  console.log(`  ~ ${r.v_no}: "${stored}"  ->  "${f.full}"`);
  changed++;
}

console.log(`done — ${changed} slip(s) rewritten`);
process.exit(0);
