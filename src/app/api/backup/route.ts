import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { isTable } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.roleName !== "ADMIN") {
    return NextResponse.json({ error: "ADMIN only" }, { status: 403 });
  }

  const dump: Record<string, unknown> = {
    _meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: session.login,
      version: 1,
    },
  };
  const tables: Record<string, unknown[]> = {};

  for (const [name, value] of Object.entries(schema)) {
    if (!isTable(value)) continue;
    try {
      const rows = await db.select().from(value as SQLiteTable);
      tables[name] = rows;
    } catch {
      tables[name] = [];
    }
  }
  dump.tables = tables;

  const body = JSON.stringify(dump, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `sk-mills-backup-${date}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
