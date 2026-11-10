import { db, schema } from "@/db";
import { and, gte, lte, eq, inArray, sql } from "drizzle-orm";
import { countLabelMap, fullConstruction } from "@/lib/grey-quality";

export const CONV_LEDGER_FINANCE_TYPES = ["CR", "CP", "BR", "BP", "JV"] as const;

const escLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export type ConvLedgerLine = {
  date: string;
  vno: string;
  narration: string;
  convCont: string;
  saleCont: string;
  than: number;
  mtr: number;
  rate: number;
  dr: number;
  cr: number;
  kind: "PP" | "GDN" | "FIN";
  /** Pakki Parchi id (PP) or godown stock id (GDN). */
  refId?: number;
  href?: string;
  balance: number;
};

/**
 * The Grey Register conversion ledger of one party, FROM–TO, with a running
 * balance that starts at zero on FROM. Debtors: Pakki Parchi lots (Dr conv
 * amount). Creditors (`3.03.*`): Grey Purchase In Stock lots (Cr net metres ×
 * the Pur Conv Contract's conv rate). Plus CR/CP/BR/BP/JV on the party account.
 * Shared by the report and the Conv Bill so both show the same balance.
 */
export async function loadConvLedger(party: string, partyCoa: string, from: string, to: string): Promise<ConvLedgerLine[]> {
  if (!party) return [];
  const pat = `%${escLike(party)}%`;
  const parchis = await db
    .select({
      id: schema.extPackiParchi.id,
      vNo: schema.extPackiParchi.vNo,
      vDate: schema.extPackiParchi.vDate,
      than: schema.extPackiParchi.than,
      meterNet: schema.extPackiParchi.meterNet,
      convRate: schema.extPackiParchi.convRate,
      convAmount: schema.extPackiParchi.convAmount,
      quality: schema.extPackiParchi.quality,
      convContNo: schema.extPackiParchi.convContNo,
      convContNoSale: schema.extPackiParchi.convContNoSale,
      convContSale2: schema.extPackiParchi.convContSale2,
    })
    .from(schema.extPackiParchi)
    .where(
      and(
        gte(schema.extPackiParchi.vDate, from),
        lte(schema.extPackiParchi.vDate, to),
        sql`${schema.extPackiParchi.convRate} IS NOT NULL AND ${schema.extPackiParchi.convRate} > 0`,
        sql`${schema.extPackiParchi.saleParty} LIKE ${pat} ESCAPE '\\'`,
      ),
    );

  const godownLots = partyCoa.startsWith("3.03.")
    ? await db
        .select({
          id: schema.extGodownStock.id,
          vNo: schema.extGodownStock.vNo,
          vDate: schema.extGodownStock.vDate,
          contNo: schema.extGodownStock.contNo,
          dspQuality: schema.extGodownStock.dspQuality,
          contactQuality: schema.extGodownStock.contactQuality,
          than: schema.extGodownStock.than,
          netMeter: schema.extGodownStock.netMeter,
          meter: schema.extGodownStock.meter,
        })
        .from(schema.extGodownStock)
        .where(
          and(
            eq(schema.extGodownStock.type, "STOCK"),
            sql`trim(${schema.extGodownStock.purchaseParty}) = ${party}`,
            gte(schema.extGodownStock.vDate, from),
            lte(schema.extGodownStock.vDate, to),
          ),
        )
    : [];

  const contractNos = Array.from(
    new Set([
      ...parchis.flatMap((r) => [r.convContNo, r.convContNoSale, r.convContSale2].filter(Boolean) as string[]),
      ...godownLots.map((r) => (r.contNo ?? "").trim()).filter(Boolean),
    ]),
  );
  const [convContracts, salContracts, constructions, counts, finance] = await Promise.all([
    contractNos.length
      ? db
          .select({
            contNo: schema.extGreyConvContract.contNo,
            grayQltyCode: schema.extGreyConvContract.grayQltyCode,
            grayCode: schema.extGreyConvContract.grayCode,
            convRate: schema.extGreyConvContract.convRatePerMtr,
          })
          .from(schema.extGreyConvContract)
          .where(inArray(schema.extGreyConvContract.contNo, contractNos))
      : Promise.resolve([]),
    contractNos.length
      ? db
          .select({ contractNo: schema.extGreySalContract.contractNo, greyCode: schema.extGreySalContract.greyCode })
          .from(schema.extGreySalContract)
          .where(inArray(schema.extGreySalContract.contractNo, contractNos))
      : Promise.resolve([]),
    db.select().from(schema.greyConstruction),
    db
      .select({ countCode: schema.yarnCounts.countCode, description: schema.yarnCounts.description, type: schema.yarnCounts.type })
      .from(schema.yarnCounts),
    partyCoa
      ? db
          .select({
            vtype: schema.transDetail.vtype,
            vno: schema.transDetail.vno,
            vdate: schema.transMain.vdate,
            narration: schema.transDetail.narration,
            debit: schema.transDetail.debit,
            credit: schema.transDetail.credit,
          })
          .from(schema.transDetail)
          .innerJoin(
            schema.transMain,
            and(
              eq(schema.transDetail.fyCode, schema.transMain.fyCode),
              eq(schema.transDetail.vtype, schema.transMain.vtype),
              eq(schema.transDetail.vno, schema.transMain.vno),
            ),
          )
          .where(
            and(
              eq(schema.transDetail.accCode, partyCoa),
              // A creditor who weaves for us also buys our yarn (YSV, Dr party); without it
              // its balance never matched the account (owner 2026-11-10). Debtors' yarn
              // lives in the Weaving Counts report, so it stays out of theirs.
              inArray(
                schema.transDetail.vtype,
                partyCoa.startsWith("3.03.") ? [...CONV_LEDGER_FINANCE_TYPES, "YSV"] : [...CONV_LEDGER_FINANCE_TYPES],
              ),
              gte(schema.transMain.vdate, from),
              lte(schema.transMain.vdate, to),
              sql`COALESCE(${schema.transDetail.trnType}, ${schema.transMain.trnType}, '') != 'ADJUSTMENT'`,
            ),
          )
      : Promise.resolve([]),
  ]);

  const countLabels = countLabelMap(counts);
  const constrByCode = new Map(
    constructions.map((g) => [String(g.code), fullConstruction(g, countLabels) || g.description || String(g.code)]),
  );
  const qualityOfContract = new Map<string, string>();
  const convRateOfContract = new Map(convContracts.map((c) => [c.contNo, c.convRate ?? 0]));
  for (const c of convContracts) {
    const code = c.grayQltyCode ?? c.grayCode ?? "";
    if (c.contNo) qualityOfContract.set(c.contNo, constrByCode.get(String(code)) ?? String(code));
  }
  for (const c of salContracts) {
    if (c.contractNo && !qualityOfContract.has(c.contractNo)) {
      qualityOfContract.set(c.contractNo, constrByCode.get(String(c.greyCode)) ?? String(c.greyCode ?? ""));
    }
  }

  const lines: Omit<ConvLedgerLine, "balance">[] = [
    ...parchis.map((r) => {
      const mtr = r.meterNet ?? 0;
      const rate = r.convRate ?? 0;
      return {
        date: r.vDate ?? "",
        vno: `${r.vNo ?? r.id}-PP`,
        narration:
          qualityOfContract.get(r.convContNo ?? "") ??
          qualityOfContract.get(r.convContNoSale ?? "") ??
          constrByCode.get(String(r.quality ?? "")) ??
          "",
        convCont: (r.convContNo ?? "").trim(),
        saleCont: (r.convContNoSale ?? r.convContSale2 ?? "").trim(),
        than: r.than ?? 0,
        mtr,
        rate,
        dr: r.convAmount ?? Math.round(mtr * rate * 100) / 100,
        cr: 0,
        kind: "PP" as const,
        refId: r.id,
        href: `/external/grey/packi-parchi/${r.id}/conv-bill`,
      };
    }),
    // The creditor is owed conversion: net metres × the conv rate of the lot's Pur Conv Contract.
    // A lot with no contract (or a contract with no conv rate) shows without an amount.
    ...godownLots.map((r) => {
      const mtr = r.netMeter ?? r.meter ?? 0;
      const rate = convRateOfContract.get((r.contNo ?? "").trim()) ?? 0;
      return {
        date: r.vDate ?? "",
        vno: r.vNo ?? "",
        narration: constrByCode.get(String(r.dspQuality ?? "")) ?? r.contactQuality ?? r.dspQuality ?? "",
        convCont: (r.contNo ?? "").trim(),
        saleCont: "",
        than: r.than ?? 0,
        mtr,
        rate,
        dr: 0,
        cr: Math.round(mtr * rate * 100) / 100,
        kind: "GDN" as const,
        refId: r.id,
        href: `/external/grey/godown-stock?id=${r.id}`,
      };
    }),
    ...finance.map((r) => ({
      date: r.vdate ?? "",
      vno: `${r.vno}-${r.vtype}`,
      narration: (r.narration ?? "").trim(),
      convCont: "",
      saleCont: "",
      than: 0,
      mtr: 0,
      rate: 0,
      dr: r.debit ?? 0,
      cr: r.credit ?? 0,
      kind: "FIN" as const,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.vno.localeCompare(b.vno));

  let balance = 0;
  return lines.map((l) => {
    balance += l.dr - l.cr;
    return { ...l, balance };
  });
}
