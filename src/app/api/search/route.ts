import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { or, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const INV_TAB_MAP: Record<string, string> = { YARN: "yarn", GREY: "grey", BEAM: "beam" };

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const rawLimit = parseInt(url.searchParams.get("limit") ?? "5", 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 5, 1), 10);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const escQ = q.replace(/[\\%_]/g, (m) => "\\" + m);
  const pat = `%${escQ}%`;

  const [accounts, contracts, beams, greyCons, products, looms, invOpen, ticketRows] = await Promise.all([
    db
      .select({
        code: schema.chartOfAccounts.code,
        description: schema.chartOfAccounts.description,
        descShort: schema.chartOfAccounts.descShort,
      })
      .from(schema.chartOfAccounts)
      .where(
        or(
          sql`${schema.chartOfAccounts.code} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.chartOfAccounts.description} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.chartOfAccounts.descShort} LIKE ${pat} ESCAPE '\\'`
        )
      )
      .limit(limit),
    db
      .select({
        id: schema.contracts.id,
        contractNo: schema.contracts.contractNo,
        party: schema.contracts.party,
        type: schema.contracts.type,
      })
      .from(schema.contracts)
      .where(
        or(
          sql`${schema.contracts.contractNo} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.contracts.party} LIKE ${pat} ESCAPE '\\'`
        )
      )
      .limit(limit),
    db
      .select({
        id: schema.beams.id,
        beamNo: schema.beams.beamNo,
        product: schema.beams.product,
        type: schema.beams.type,
      })
      .from(schema.beams)
      .where(
        or(
          sql`${schema.beams.beamNo} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.beams.product} LIKE ${pat} ESCAPE '\\'`
        )
      )
      .limit(limit),
    db
      .select({
        id: schema.greyConstruction.id,
        code: schema.greyConstruction.code,
        description: schema.greyConstruction.description,
      })
      .from(schema.greyConstruction)
      .where(
        or(
          sql`${schema.greyConstruction.code} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.greyConstruction.description} LIKE ${pat} ESCAPE '\\'`
        )
      )
      .limit(limit),
    db
      .select({
        id: schema.products.id,
        code: schema.products.code,
        description: schema.products.description,
      })
      .from(schema.products)
      .where(
        or(
          sql`${schema.products.code} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.products.description} LIKE ${pat} ESCAPE '\\'`
        )
      )
      .limit(limit),
    db
      .select({
        id: schema.looms.id,
        loomNo: schema.looms.loomNo,
        weaverName: schema.looms.weaverName,
        shed: schema.looms.shed,
      })
      .from(schema.looms)
      .where(
        or(
          sql`${schema.looms.loomNo} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.looms.weaverName} LIKE ${pat} ESCAPE '\\'`
        )
      )
      .limit(limit),
    db
      .select({
        id: schema.inventoryOpening.id,
        itemCode: schema.inventoryOpening.itemCode,
        description: schema.inventoryOpening.description,
        voucherNo: schema.inventoryOpening.voucherNo,
        itemType: schema.inventoryOpening.itemType,
      })
      .from(schema.inventoryOpening)
      .where(
        or(
          sql`${schema.inventoryOpening.itemCode} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.inventoryOpening.description} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.inventoryOpening.voucherNo} LIKE ${pat} ESCAPE '\\'`
        )
      )
      .limit(limit),
    db
      .select({
        id: schema.tickets.id,
        ticketNo: schema.tickets.ticketNo,
        title: schema.tickets.title,
        status: schema.tickets.status,
      })
      .from(schema.tickets)
      .where(
        or(
          sql`${schema.tickets.ticketNo} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.tickets.title} LIKE ${pat} ESCAPE '\\'`,
          sql`${schema.tickets.description} LIKE ${pat} ESCAPE '\\'`
        )
      )
      .limit(limit),
  ]);

  const results = [
    ...accounts.map((a) => ({
      type: "Account",
      id: a.code,
      title: a.description,
      subtitle: a.descShort ? `${a.code} - ${a.descShort}` : a.code,
      href: `/accounts?code=${encodeURIComponent(a.code)}`,
    })),
    ...contracts.map((c) => ({
      type: "Contract",
      id: String(c.id),
      title: `${c.contractNo} - ${c.party}`,
      subtitle: c.type,
      href: `/contracts?type=${c.type}`,
    })),
    ...beams.map((b) => ({
      type: "Beam",
      id: String(b.id),
      title: b.beamNo,
      subtitle: [b.product, b.type].filter(Boolean).join(" - "),
      href: `/weaving/beams`,
    })),
    ...greyCons.map((g) => ({
      type: "Grey Construction",
      id: String(g.id),
      title: g.description,
      subtitle: g.code,
      href: `/define/grey-construction?id=${g.id}`,
    })),
    ...products.map((p) => ({
      type: "Product",
      id: String(p.id),
      title: p.description,
      subtitle: String(p.code),
      href: `/define/products?section=products&id=${p.id}`,
    })),
    ...looms.map((l) => ({
      type: "Loom",
      id: String(l.id),
      title: `Loom ${l.loomNo}`,
      subtitle: [l.weaverName, l.shed].filter(Boolean).join(" - "),
      href: `/weaving/looms?id=${l.id}`,
    })),
    ...invOpen.map((i) => ({
      type: "Inventory Opening",
      id: String(i.id),
      title: i.description,
      subtitle: [i.itemCode, i.voucherNo].filter(Boolean).join(" - "),
      href: `/define/inv-opening?tab=${INV_TAB_MAP[i.itemType] ?? "yarn"}&id=${i.id}`,
    })),
    ...ticketRows.map((t) => ({
      type: "Ticket",
      id: String(t.id),
      title: t.title,
      subtitle: `${t.ticketNo} · ${t.status}`,
      href: `/tickets/${t.id}`,
    })),
  ].slice(0, 30);

  return NextResponse.json({ results });
}
