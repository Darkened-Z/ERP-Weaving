import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso","utf8").split(/\r?\n/)){const m=line.match(/^\s*([A-Z_]+)=(.*)$/);if(m)process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const ct = await c.execute("SELECT id, cont_no, party, gray_qlty_code, gray_code, width FROM ext_grey_conv_contract ORDER BY id");
console.log("Contracts:");
ct.rows.forEach(r=>console.log(`  id=${r.id} ${r.cont_no} party=${r.party} grayQ=${r.gray_qlty_code} grayC=${r.gray_code} width=${r.width}`));
const wf = await c.execute("SELECT contract_id, sr_no, count, cal_count, ends, wt_per_mtr, rate_per_lbs, cost_per_mtr FROM ext_grey_conv_weft ORDER BY contract_id, sr_no");
console.log("\nWeft rows (saved values):");
wf.rows.forEach(r=>console.log(`  ctr=${r.contract_id} sr${r.sr_no} count=${r.count} cal=${r.cal_count} ends=${r.ends} WT=${r.wt_per_mtr} rate=${r.rate_per_lbs} COST=${r.cost_per_mtr}`));
const wp = await c.execute("SELECT contract_id, sr_no, count, cal_count, ends, wt_per_mtr, cost_per_mtr FROM ext_grey_conv_warp ORDER BY contract_id, sr_no");
console.log("\nWarp rows (saved values):");
wp.rows.forEach(r=>console.log(`  ctr=${r.contract_id} sr${r.sr_no} count=${r.count} cal=${r.cal_count} ends=${r.ends} WT=${r.wt_per_mtr} COST=${r.cost_per_mtr}`));
