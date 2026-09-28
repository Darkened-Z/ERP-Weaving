import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { sql, eq, and, inArray, gte } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { assertPeriodOpen, parseLockedThroughFromError } from "@/lib/period-lock";
import { fyCodeForDate } from "@/lib/gl-post";

// Only journals. Cash, bank and petty vouchers carry a header account and
// contra legs (srno 50+/100+) that their own screens build; a bare
// debit/credit list posted under those types never shows up right there.
const VALID_VTYPES = ["JV"];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { vtype, vdate, narration, lines } = body;

  if (!vtype || !vdate || !lines || lines.length < 2) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!VALID_VTYPES.includes(vtype)) {
    return NextResponse.json({ error: "Invalid voucher type" }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(vdate)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const [company] = await db.select().from(schema.companyProfile).limit(1);
  if (!company?.currentFy) {
    return NextResponse.json({ error: "Company profile not configured — set current fiscal year" }, { status: 500 });
  }
  const fyCode = (await fyCodeForDate(vdate)) || company.currentFy;

  try {
    await assertPeriodOpen(vdate, "FINANCE");
  } catch (e) {
    const thru = parseLockedThroughFromError(e instanceof Error ? e.message : "");
    if (thru) return NextResponse.json({ error: `Period is locked through ${thru}` }, { status: 409 });
    throw e;
  }

  const totalDebit = lines.reduce((s: number, l: { debit: string }) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s: number, l: { credit: string }) => s + (parseFloat(l.credit) || 0), 0);
  if (Math.abs(totalDebit - totalCredit) >= 0.01) {
    return NextResponse.json({ error: "Debits and credits must balance" }, { status: 400 });
  }

  const accCodes = lines.map((l: { accCode: string }) => l.accCode).filter(Boolean);
  if (accCodes.length === 0) {
    return NextResponse.json({ error: "Account codes required" }, { status: 400 });
  }
  const validAccounts = await db
    .select({ code: schema.chartOfAccounts.code })
    .from(schema.chartOfAccounts)
    // Posting accounts only: a voucher against a group head never reaches any
    // ledger that reads leaf accounts.
    .where(and(inArray(schema.chartOfAccounts.code, accCodes), gte(schema.chartOfAccounts.level, 4)));
  const validCodes = new Set(validAccounts.map((a) => a.code));
  const invalid = accCodes.filter((c: string) => !validCodes.has(c));
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Invalid account codes: ${invalid.join(", ")}` }, { status: 400 });
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [maxRow] = await tx
        .select({ max: sql<number>`coalesce(max(vno), 0)` })
        .from(schema.transMain)
        .where(and(eq(schema.transMain.fyCode, fyCode), eq(schema.transMain.vtype, vtype)));

      const vno = (maxRow?.max ?? 0) + 1;

      const partyCode = lines.find((l: { accCode: string }) => l.accCode)?.accCode ?? null;
      await tx.insert(schema.transMain).values({
        fyCode,
        vtype,
        vno,
        vdate,
        accCode: partyCode,
        narration: narration || null,
        utCode: session.userId,
      });

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const debit = parseFloat(line.debit) || 0;
        const credit = parseFloat(line.credit) || 0;
        if (debit === 0 && credit === 0) continue;
        await tx.insert(schema.transDetail).values({
          fyCode,
          vtype,
          vno,
          srno: i + 1,
          accCode: line.accCode,
          partyCode,
          narration: line.narration || null,
          debit,
          credit,
        });
      }

      return vno;
    });

    return NextResponse.json({ success: true, vno: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg.includes("UNIQUE constraint")) {
      return NextResponse.json({ error: "Duplicate voucher number — retry" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to save voucher" }, { status: 500 });
  }
}
