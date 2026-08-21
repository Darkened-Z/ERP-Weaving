import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import path from "node:path";

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${path.resolve("data.db")}` });

console.log(url ? "Target: TURSO" : "Target: local data.db");

const { rows } = await client.execute("SELECT id, login, password FROM users");
let hashed = 0;
let skipped = 0;
for (const u of rows) {
  const pw = String(u.password ?? "");
  if (pw.startsWith("$2")) {
    skipped++;
    continue;
  }
  const hash = await bcrypt.hash(pw, 10);
  await client.execute({ sql: "UPDATE users SET password = ? WHERE id = ?", args: [hash, u.id] });
  console.log(`  hashed ${u.login}`);
  hashed++;
}
console.log(`Done. hashed=${hashed} alreadyHashed=${skipped}`);
client.close();
