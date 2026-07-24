import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql, eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vtype, vdate, narration, lines } = body;

  if (!vtype || !vdate || !lines || lines.length < 2) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const fyCode = "2022";

  const [maxRow] = await db
    .select({ max: sql<number>`coalesce(max(vno), 0)` })
    .from(schema.transMain)
    .where(and(eq(schema.transMain.fyCode, fyCode), eq(schema.transMain.vtype, vtype)));

  const vno = (maxRow?.max ?? 0) + 1;

  await db.insert(schema.transMain).values({
    fyCode,
    vtype,
    vno,
    vdate,
    narration: narration || null,
    utCode: 1,
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    await db.insert(schema.transDetail).values({
      fyCode,
      vtype,
      vno,
      srno: i + 1,
      accCode: line.accCode,
      narration: line.narration || null,
      debit: parseFloat(line.debit) || 0,
      credit: parseFloat(line.credit) || 0,
    });
  }

  return NextResponse.json({ success: true, vno });
}
