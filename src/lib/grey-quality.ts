/**
 * Single source of truth for grey-construction / quality display + normalization,
 * so every screen (packi, godown, reports) renders a construction and resolves a
 * quality the SAME way. Pure functions — callers pass the data they already fetch.
 */

export type GreyConstr = {
  code: string | null;
  description?: string | null;
  reed?: number | null;
  pick?: number | null;
  warpCount?: string | null;
  warp2?: string | null;
  weftCount?: string | null;
  weft2?: string | null;
};

/** Build the yarn-count code → label ("<description> <type>") map. */
export function countLabelMap(
  counts: { countCode: string | number; description: string | null; type?: string | null }[],
): Map<string, string> {
  return new Map(
    counts.map((c) => [String(c.countCode), `${c.description ?? ""}${c.type ? ` ${c.type}` : ""}`.trim()]),
  );
}

const lbl = (code: string | number | null | undefined, labels: Map<string, string>) =>
  code == null || code === "" ? "" : labels.get(String(code)) || String(code);

/**
 * Warp/weft count description (collapsed to one when warp === weft), no reed×pick.
 * Used for short dropdown labels.
 */
export function wfPart(c: GreyConstr, labels: Map<string, string>): string {
  const warp = [c.warpCount, c.warp2].map((x) => lbl(x, labels)).filter(Boolean).join(" / ");
  const weft = [c.weftCount, c.weft2].map((x) => lbl(x, labels)).filter(Boolean).join(" / ");
  return warp && weft ? (warp === weft ? warp : `${warp} × ${weft}`) : warp || weft;
}

/** Full construction line: "<reed> X <pick>  <warp/weft desc>". */
export function richConstruction(c: GreyConstr, labels: Map<string, string>): string {
  const rp = c.reed != null && c.pick != null ? `${c.reed} X ${c.pick}` : "";
  const wf = wfPart(c, labels);
  return `${rp}${rp && wf ? "  " : ""}${wf}`.trim();
}

/**
 * Normalize a stored quality (a bare construction code "GC-001" OR a rich string
 * like "GC-001 71×56×61 [W:2 F:2]") to the construction CODE, so the same quality
 * aggregates as one everywhere. `codes` is the set of valid construction codes.
 */
export function normQuality(q: string | null | undefined, codes: Set<string>): string {
  if (!q) return "";
  const t = q.trim();
  if (codes.has(t)) return t;
  const first = t.split(/\s+/)[0];
  if (codes.has(first)) return first;
  for (const c of codes) if (t.startsWith(c)) return c;
  return t;
}
