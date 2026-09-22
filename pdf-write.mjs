import fs from "node:fs";

/**
 * A very small text-only PDF writer.
 *
 * Only what a plain report needs: Helvetica, a few sizes, bold for headings,
 * page breaks and a footer. Content streams are left uncompressed, which is
 * also what the mill's own Oracle exports do, so the result opens anywhere and
 * can be read back as text.
 */

const ESC = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // PDF's standard encoding has no place for anything exotic; the reports
    // this writes are plain ASCII anyway.
    .replace(/[^\x20-\x7E]/g, "-");

const PAGE = { w: 595.28, h: 841.89, left: 40, right: 40, top: 56, bottom: 46 };

export class Pdf {
  constructor({ title = "Report" } = {}) {
    this.title = title;
    this.pages = [];
    this.cur = null;
    this.y = 0;
    this.newPage();
  }

  newPage() {
    this.cur = [];
    this.pages.push(this.cur);
    this.y = PAGE.h - PAGE.top;
  }

  /** Reserve vertical space, starting a page when it will not fit. */
  space(h) {
    if (this.y - h < PAGE.bottom) this.newPage();
  }

  text(s, { x = PAGE.left, size = 9, bold = false, gray = 0 } = {}) {
    this.cur.push(
      `BT /${bold ? "F1" : "F0"} ${size} Tf ${gray} g ${x.toFixed(2)} ${this.y.toFixed(2)} Td (${ESC(s)}) Tj ET`,
    );
  }

  line(s, opts = {}) {
    const lead = opts.lead ?? (opts.size ?? 9) + 3.5;
    this.space(lead);
    this.text(s, opts);
    this.y -= lead;
  }

  /** One row of columns: [{text, x, size, bold, align:'right'}] */
  row(cells, { lead = 12 } = {}) {
    this.space(lead);
    for (const c of cells) {
      const size = c.size ?? 9;
      const x = c.align === "right" ? c.x - String(c.text ?? "").length * size * 0.5 : c.x;
      this.text(c.text, { ...c, x, size });
    }
    this.y -= lead;
  }

  rule({ gray = 0.7 } = {}) {
    this.space(6);
    this.cur.push(
      `${gray} G 0.6 w ${PAGE.left} ${this.y.toFixed(2)} m ${(PAGE.w - PAGE.right).toFixed(2)} ${this.y.toFixed(2)} l S`,
    );
    this.y -= 6;
  }

  gap(h = 8) {
    this.space(h);
    this.y -= h;
  }

  save(file) {
    const objs = [];
    const add = (body) => {
      objs.push(body);
      return objs.length; // 1-based object number
    };

    const fontRegular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const fontBold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    const pageIds = [];
    const contentIds = [];
    this.pages.forEach((ops, i) => {
      const footer = `BT /F0 7.5 Tf 0.45 g ${PAGE.left} ${PAGE.bottom - 14} Td (Page ${i + 1} of ${this.pages.length}   ${ESC(this.title)}) Tj ET`;
      const stream = [...ops, footer].join("\n");
      contentIds.push(add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
    });

    // Pages object is created before the page objects that reference it, so its
    // number is reserved here and its body filled in afterwards.
    const pagesId = add("");
    this.pages.forEach((_, i) => {
      pageIds.push(
        add(
          `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] ` +
            `/Resources << /Font << /F0 ${fontRegular} 0 R /F1 ${fontBold} 0 R >> >> ` +
            `/Contents ${contentIds[i]} 0 R >>`,
        ),
      );
    });
    objs[pagesId - 1] =
      `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((n) => `${n} 0 R`).join(" ")}] >>`;

    const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const infoId = add(`<< /Title (${ESC(this.title)}) /Producer (SK Textile ERP) >>`);

    let out = "%PDF-1.4\n";
    const offsets = [0];
    objs.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objs.length; i += 1) {
      out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    fs.writeFileSync(file, Buffer.from(out, "latin1"));
    return { file, pages: this.pages.length, bytes: out.length };
  }
}
