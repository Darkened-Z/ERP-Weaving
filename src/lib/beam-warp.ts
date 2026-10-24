import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export type BeamWarp = { counts: string[]; brand: string; ends: number | null };

/**
 * What yarn each beam carries as warp. A beam has no count of its own: it comes
 * from the bill the beam was received on (beams.br_vno) → that bill's sizing
 * contract → the contract's count rows. Brand and ends come off the bill's line
 * for the beam. A bill with no sizing contract leaves the count empty — unknown,
 * never guessed.
 */
export async function beamWarps(): Promise<Map<string, BeamWarp>> {
  const [beams, bills, lines, sizing] = await Promise.all([
    db.select({ beamNo: schema.beams.beamNo, brVno: schema.beams.brVno, ends: schema.beams.ends }).from(schema.beams),
    db
      .select({ id: schema.intWarpedBeamReceiving.id, vNo: schema.intWarpedBeamReceiving.vNo, sizingContNo: schema.intWarpedBeamReceiving.sizingContNo })
      .from(schema.intWarpedBeamReceiving),
    db
      .select({ receivingId: schema.intWarpedBeamReceivingLine.receivingId, beamNo: schema.intWarpedBeamReceivingLine.beamNo, yarnBrand: schema.intWarpedBeamReceivingLine.yarnBrand })
      .from(schema.intWarpedBeamReceivingLine),
    db
      .select({ contNo: schema.intBeamContractExtWs.contNo, countCode: schema.intBeamContractExtWsDetail.countCode })
      .from(schema.intBeamContractExtWsDetail)
      .innerJoin(schema.intBeamContractExtWs, eq(schema.intBeamContractExtWs.id, schema.intBeamContractExtWsDetail.contractId)),
  ]);
  const billByVno = new Map(bills.map((b) => [b.vNo, b]));
  const countsBySizing = new Map<string, string[]>();
  for (const s of sizing) {
    const code = (s.countCode ?? "").trim();
    if (!code) continue;
    const list = countsBySizing.get(s.contNo) ?? [];
    if (!list.includes(code)) list.push(code);
    countsBySizing.set(s.contNo, list);
  }
  const brandByBillBeam = new Map(lines.map((l) => [`${l.receivingId}|${(l.beamNo ?? "").trim()}`, (l.yarnBrand ?? "").trim()]));

  const out = new Map<string, BeamWarp>();
  for (const b of beams) {
    const bill = b.brVno ? billByVno.get(b.brVno) : undefined;
    out.set(b.beamNo, {
      counts: bill?.sizingContNo ? countsBySizing.get(bill.sizingContNo) ?? [] : [],
      brand: bill ? brandByBillBeam.get(`${bill.id}|${b.beamNo}`) ?? "" : "",
      ends: b.ends ?? null,
    });
  }
  return out;
}

/** Warp count codes of every grey conversion contract, internal and external. */
export async function contractWarpCounts(): Promise<Map<string, string[]>> {
  const [intRows, extRows] = await Promise.all([
    db
      .select({ contNo: schema.intGreyConversionContract.contNo, count: schema.intGreyConversionWarp.count })
      .from(schema.intGreyConversionWarp)
      .innerJoin(schema.intGreyConversionContract, eq(schema.intGreyConversionContract.id, schema.intGreyConversionWarp.contractId)),
    db
      .select({ contNo: schema.extGreyConvContract.contNo, count: schema.extGreyConvWarp.count })
      .from(schema.extGreyConvWarp)
      .innerJoin(schema.extGreyConvContract, eq(schema.extGreyConvContract.id, schema.extGreyConvWarp.contractId)),
  ]);
  const out = new Map<string, string[]>();
  for (const r of [...intRows, ...extRows]) {
    const code = (r.count ?? "").trim();
    if (!code) continue;
    const list = out.get(r.contNo) ?? [];
    if (!list.includes(code)) list.push(code);
    out.set(r.contNo, list);
  }
  return out;
}

/** The beam's warp counts that the contract's warp does not have (empty = same, or unknown). */
export function warpMismatch(beam: BeamWarp | undefined, contractCounts: string[] | undefined): string[] {
  if (!beam?.counts.length || !contractCounts?.length) return [];
  return beam.counts.filter((c) => !contractCounts.includes(c));
}
