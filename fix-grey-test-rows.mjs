import { createClient } from "@libsql/client";
import fs from "node:fs";
for (const line of fs.readFileSync(".env.turso", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// Resolve count code -> full blend "desc type"
const yc = await c.execute("SELECT count_code, description, type FROM yarn_counts");
const blendByCode = new Map(yc.rows.map(r => [String(r.count_code), `${r.description}${r.type ? ' ' + r.type : ''}`.trim()]));

for (const t of ["ext_grey_conv_warp","ext_grey_conv_weft"]) {
  const rows = await c.execute(`SELECT id, count, descr, brand FROM ${t}`);
  for (const r of rows.rows) {
    const fullBlend = blendByCode.get(String(r.count)) ?? r.descr;
    // Clear brand if it looks like a blend (contains ; or matches the count's type), and set desc to full blend
    const brandIsBlend = r.brand && /[;:]/.test(r.brand);
    const newBrand = brandIsBlend ? "" : r.brand;
    await c.execute({
      sql: `UPDATE ${t} SET descr = ?, brand = ? WHERE id = ?`,
      args: [fullBlend, newBrand, r.id],
    });
    console.log(`${t} id=${r.id}: count=${r.count} descr "${r.descr}" -> "${fullBlend}", brand "${r.brand}" -> "${newBrand}"`);
  }
}
console.log("\nDone.");
