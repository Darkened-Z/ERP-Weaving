/**
 * Attachment fields hold either a single bare data URL (everything saved before
 * these fields became multi-image) or a JSON array of them. One parser so the
 * editor and every gallery that reads the column agree on both shapes.
 */
export function parseImages(v: string | null | undefined): string[] {
  const raw = (v ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string" && !!x);
    } catch {
      /* not JSON after all — fall through and treat it as one value */
    }
  }
  return [raw];
}

/** Several image fields as one value: null, the lone image, or a JSON array. */
export function mergeImages(values: (string | null | undefined)[]): string | null {
  const all = values.flatMap(parseImages);
  if (!all.length) return null;
  return all.length === 1 ? all[0] : JSON.stringify(all);
}

/** First image, for thumbnails and list rows that only have room for one. */
export function firstImage(v: string | null | undefined): string {
  return parseImages(v)[0] ?? "";
}
