/** A posted purchase must price every line that carries actual weight. */
export function unpricedPurchaseLine(
  posting: string,
  lines: { lbs: number | null; rate: number | null }[],
): number | null {
  if (posting !== "Y") return null;
  const index = lines.findIndex((line) =>
    (line.lbs ?? 0) > 0 && (line.rate == null || !Number.isFinite(line.rate) || line.rate <= 0),
  );
  return index < 0 ? null : index + 1;
}
