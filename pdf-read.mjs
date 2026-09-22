import fs from "node:fs";
import zlib from "node:zlib";

const TJ = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
const TJ_ARRAY = /\[(.*?)\]\s*TJ/g;
const IN_ARRAY = /\(((?:\\.|[^\\()])*)\)/g;
const ESCAPED = /\\([()\\])/g;

export function pdfText(file) {
  const buf = fs.readFileSync(file);
  const raw = buf.toString("latin1");

  // Oracle's PDF driver leaves content streams uncompressed.
  const direct = [...raw.matchAll(TJ)].map((m) => m[1]);
  if (direct.length) return direct.join("\n").replace(ESCAPED, "$1");

  // Chrome's print-to-PDF deflates them.
  const parts = [];
  let i = 0;
  for (;;) {
    const s = raw.indexOf("stream", i);
    if (s < 0) break;
    const st = raw.indexOf("\n", s) + 1;
    const en = raw.indexOf("endstream", st);
    if (en < 0) break;
    try {
      parts.push(zlib.inflateSync(buf.subarray(st, en)).toString("latin1"));
    } catch {
      /* not a deflate stream (image, font) — skip */
    }
    i = en + 9;
  }
  const joined = parts.join("\n");
  const tj = [...joined.matchAll(TJ)].map((m) => m[1]);
  const tja = [...joined.matchAll(TJ_ARRAY)].flatMap((m) =>
    [...m[1].matchAll(IN_ARRAY)].map((x) => x[1]),
  );
  return [...tj, ...tja].join("\n").replace(ESCAPED, "$1");
}
