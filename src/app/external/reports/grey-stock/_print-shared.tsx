import { sql } from "drizzle-orm";
import { schema } from "@/db";

export const fmt = (n: number) =>
  new Intl.NumberFormat("en-PK").format(Math.round(n));

export const fmt2 = (n: number) =>
  new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

export function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

export function sixMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export type Filters = {
  from: string;
  to: string;
  dspQuality: string;
  party: string;
  contNo: string;
  salContNo: string;
};

export function buildTextFilters(f: Filters) {
  const extras: ReturnType<typeof sql>[] = [];
  if (f.dspQuality) {
    const pat = `%${escLike(f.dspQuality)}%`;
    extras.push(sql`${schema.extGodownStock.dspQuality} LIKE ${pat} ESCAPE '\\'`);
  }
  if (f.party) {
    const pat = `%${escLike(f.party)}%`;
    extras.push(sql`${schema.extGodownStock.purchaseParty} LIKE ${pat} ESCAPE '\\'`);
  }
  if (f.contNo) {
    const pat = `%${escLike(f.contNo)}%`;
    extras.push(sql`${schema.extGodownStock.contNo} LIKE ${pat} ESCAPE '\\'`);
  }
  if (f.salContNo) {
    const pat = `%${escLike(f.salContNo)}%`;
    extras.push(sql`${schema.extGodownStock.salContNo} LIKE ${pat} ESCAPE '\\'`);
  }
  return extras;
}

export function filterSummary(f: Filters): string {
  const bits: string[] = [];
  if (f.dspQuality) bits.push(`Dsp.Quality: ${f.dspQuality}`);
  if (f.party) bits.push(`Party: ${f.party}`);
  if (f.contNo) bits.push(`Cont #: ${f.contNo}`);
  if (f.salContNo) bits.push(`Sal Cont #: ${f.salContNo}`);
  return bits.length ? bits.join(" | ") : "All";
}

export async function readFilters(
  searchParams: Promise<Partial<Filters>>
): Promise<Filters> {
  const p = await searchParams;
  return {
    from: p.from?.trim() || sixMonthsAgo(),
    to: p.to?.trim() || todayIso(),
    dspQuality: p.dspQuality?.trim() ?? "",
    party: p.party?.trim() ?? "",
    contNo: p.contNo?.trim() ?? "",
    salContNo: p.salContNo?.trim() ?? "",
  };
}

export const PRINT_CSS = `
@page { size: A4; margin: 18mm; }
@media print {
  html, body { background: #fff !important; }
  .no-print { display: none !important; }
  .rpt-wrap { padding: 0 !important; background: #fff !important; }
  .rpt-page {
    box-shadow: none !important;
    border: none !important;
    margin: 0 !important;
    padding: 0 !important;
    max-width: none !important;
  }
}
.rpt-wrap {
  background: #f5f5f5;
  min-height: 100vh;
  padding: 24px 16px;
}
.rpt-toolbar {
  max-width: 297mm;
  margin: 0 auto 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.rpt-title-strip {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #000;
  color: #fff;
  padding: 8px 12px 8px 18px;
}
.rpt-title-strip-title {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 14pt;
  font-weight: 700;
  letter-spacing: 0.14em;
}
.rpt-title-strip .btn {
  background: #fff;
  color: #000;
  font-size: 13px;
  padding: 8px 18px;
  border: 2px solid #fff;
  font-weight: 700;
}
.rpt-title-strip .btn:hover {
  background: #000;
  color: #fff;
  border-color: #fff;
}
.rpt-page {
  background: #fff;
  color: #000;
  max-width: 297mm;
  margin: 0 auto;
  padding: 18mm 14mm;
  border: 1px solid #000;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 10.5pt;
  line-height: 1.4;
}
.rpt-page .rpt-header {
  text-align: center;
  padding-bottom: 8px;
  border-bottom: 2px solid #000;
  margin-bottom: 8px;
}
.rpt-page .company-name {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 22pt;
  font-weight: 700;
  letter-spacing: 0.02em;
  margin: 0;
}
.rpt-page .company-addr,
.rpt-page .company-contact {
  font-size: 9.5pt;
  margin-top: 2px;
}
.rpt-page .report-title {
  text-align: center;
  font-size: 15pt;
  font-weight: 700;
  letter-spacing: 0.22em;
  margin: 10px 0 6px;
  padding: 6px 0;
  border-top: 1px solid #000;
  border-bottom: 1px solid #000;
  font-family: 'Georgia', 'Times New Roman', serif;
}
.rpt-page .filter-summary {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  font-size: 9.5pt;
  margin-bottom: 12px;
  padding: 4px 6px;
  border-bottom: 1px solid #000;
  font-family: 'Helvetica', Arial, sans-serif;
}
.rpt-page .filter-summary .fs-label {
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-right: 4px;
}
.rpt-page table.rpt-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
}
.rpt-page table.rpt-table th,
.rpt-page table.rpt-table td {
  border: 1px solid #000;
  padding: 5px 6px;
  font-size: 9.5pt;
  font-family: 'Georgia', 'Times New Roman', serif;
  text-align: left;
  vertical-align: top;
}
.rpt-page table.rpt-table th {
  background: #f0f0f0;
  font-family: 'Helvetica', Arial, sans-serif;
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rpt-page table.rpt-table th.num,
.rpt-page table.rpt-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-family: 'Courier New', monospace;
}
.rpt-page table.rpt-table td.mono {
  font-family: 'Courier New', monospace;
  font-size: 9pt;
}
.rpt-page table.rpt-table tr.group-header td {
  background: #e6e6e6;
  font-weight: 700;
  font-family: 'Helvetica', Arial, sans-serif;
  font-size: 9.5pt;
  letter-spacing: 0.04em;
}
.rpt-page table.rpt-table tr.subtotal td {
  background: #f7f7f7;
  font-weight: 700;
  border-top: 1px solid #000;
  border-bottom: 1px solid #000;
}
.rpt-page table.rpt-table tr.grand-total td {
  background: #d9d9d9;
  font-weight: 700;
  border-top: 2px solid #000;
  border-bottom: 2px solid #000;
  font-size: 10.5pt;
}
.rpt-page table.rpt-table tr.empty td {
  text-align: center;
  padding: 20px;
  font-style: italic;
  color: #444;
}
.rpt-page .signatures {
  margin-top: 40px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px;
}
.rpt-page .sig {
  text-align: center;
}
.rpt-page .sig-line {
  border-top: 1px solid #000;
  margin-bottom: 6px;
  height: 32px;
}
.rpt-page .sig-label {
  font-family: 'Helvetica', Arial, sans-serif;
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.rpt-page .footer {
  margin-top: 20px;
  font-size: 8.5pt;
  text-align: center;
  color: #333;
  letter-spacing: 0.04em;
}
`;
