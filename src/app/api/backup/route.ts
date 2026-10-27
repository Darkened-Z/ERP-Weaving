import { NextResponse } from "next/server";
import { today as todayPk } from "@/lib/time";
import { db } from "@/db";
import { getSession } from "@/lib/auth";
import { createDatabaseBackup } from "@/lib/database-backup";
import { gzipSync } from "node:zlib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["ADMIN", "SUPERADMIN"].includes(session.roleName.toUpperCase())) return NextResponse.json({ error: "ADMIN only" }, { status: 403 });
  try {
    const dump = await createDatabaseBackup(db.$client, session.login);
    return new NextResponse(new Uint8Array(gzipSync(JSON.stringify(dump))), { headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="sk-mills-backup-${todayPk()}.json.gz"`,
      "Cache-Control": "no-store",
    } });
  } catch {
    return NextResponse.json({ error: "Backup failed. No complete snapshot was produced. Please retry." }, { status: 500 });
  }
}
