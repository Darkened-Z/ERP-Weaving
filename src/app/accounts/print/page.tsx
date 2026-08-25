import { requireSession } from "@/lib/auth";
import { db, schema } from "@/db";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

type Account = typeof schema.chartOfAccounts.$inferSelect;

const PRINT_CSS = `
@page { size: A4; margin: 14mm; }
html, body { background: #fff; color: #000; }
body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11px; }
.coa-toolbar { max-width: 1100px; margin: 12px auto; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 0 16px; }
.coa-page { max-width: 1100px; margin: 0 auto 24px; padding: 12mm 8mm; background: #fff; border: 1px solid #000; }
.coa-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
.coa-company { font-size: 20pt; font-weight: 700; letter-spacing: 0.02em; margin: 0; }
.coa-meta { display: flex; justify-content: space-between; font-size: 9.5pt; margin-top: 4px; font-family: 'Helvetica', Arial, sans-serif; }
.coa-title { text-align: center; font-size: 14pt; font-weight: 700; letter-spacing: 0.22em; margin: 8px 0; padding: 4px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }
table.coa { width: 100%; border-collapse: collapse; }
table.coa th, table.coa td { border: 1px solid #000; padding: 3px 6px; font-size: 10px; vertical-align: top; text-align: left; }
table.coa th { background: #e8e8e8; font-family: 'Helvetica', Arial, sans-serif; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
table.coa td.code { font-family: 'Courier New', monospace; font-size: 10px; white-space: nowrap; }
table.coa td.short { font-family: 'Courier New', monospace; font-size: 9.5px; color: #444; }
table.coa td.status { text-align: center; width: 40px; font-family: 'Helvetica', Arial, sans-serif; font-weight: 700; }
.badge { display: inline-block; padding: 1px 6px; border: 1px solid #000; font-size: 8.5pt; letter-spacing: 0.05em; }
.badge.a { background: #000; color: #fff; }
.badge.c { background: #f0f0f0; color: #555; }
tr.lvl-1 td { background: #d9d9d9; font-weight: 700; }
tr.lvl-2 td { background: #f2f2f2; font-weight: 600; }
@media print {
  .no-print { display: none !important; }
  body { font-size: 10px; }
  .coa-page { border: none; margin: 0; padding: 0; max-width: none; }
  .coa-toolbar { display: none; }
  table.coa { break-inside: auto; }
  table.coa tr { break-inside: avoid; page-break-inside: avoid; }
  table.coa thead { display: table-header-group; }
}
`;

type FilterType = "all" | "receivable" | "payable";

const TYPE_LABEL: Record<FilterType, string> = {
  all: "All Accounts",
  receivable: "Receivables (3.05)",
  payable: "Payables (3.04)",
};

export default async function ChartOfAccountsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireSession();

  const params = await searchParams;
  const raw = params.type?.toLowerCase().trim() ?? "all";
  const type: FilterType =
    raw === "receivable" || raw === "payable" ? raw : "all";

  const allAccounts: Account[] = await db
    .select()
    .from(schema.chartOfAccounts)
    .orderBy(schema.chartOfAccounts.code);

  const accounts = allAccounts.filter((a) => {
    if (type === "all") return true;
    const head = a.codeHead ?? "";
    if (type === "receivable") return head.startsWith("3.05");
    if (type === "payable") return head.startsWith("3.04");
    return true;
  });

  const [profile] = await db.select().from(schema.companyProfile).limit(1);
  const companyName = profile?.name ?? "SK Mills";
  const companyAddr = [profile?.address, profile?.city].filter(Boolean).join(", ");

  const printDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const statusBadge = (s: string | null | undefined) => {
    const v = (s ?? "R").toUpperCase();
    const cls = v === "A" ? "badge a" : v === "C" ? "badge c" : "badge";
    return <span className={cls}>{v}</span>;
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="coa-toolbar no-print">
        <a href="/accounts" className="btn btn-outline btn-sm">Back</a>
        <div style={{ display: "flex", gap: 6 }}>
          <a
            href="/accounts/print"
            className="btn btn-outline btn-sm"
            style={type === "all" ? { background: "#000", color: "#fff" } : undefined}
          >
            All
          </a>
          <a
            href="/accounts/print?type=receivable"
            className="btn btn-outline btn-sm"
            style={type === "receivable" ? { background: "#000", color: "#fff" } : undefined}
          >
            Receivables
          </a>
          <a
            href="/accounts/print?type=payable"
            className="btn btn-outline btn-sm"
            style={type === "payable" ? { background: "#000", color: "#fff" } : undefined}
          >
            Payables
          </a>
        </div>
        <PrintButton label="Print" />
      </div>
      <div className="coa-page">
        <div className="coa-header">
          <h1 className="coa-company">{companyName}</h1>
          {companyAddr && <div style={{ fontSize: "9.5pt", marginTop: 2 }}>{companyAddr}</div>}
          <div className="coa-meta">
            <div>
              Printed: {printDate}
              <span style={{ marginLeft: 8 }} className="badge a">{TYPE_LABEL[type]}</span>
            </div>
            <div>{accounts.length} accounts</div>
          </div>
        </div>
        <div className="coa-title">CHART OF ACCOUNTS</div>
        <table className="coa">
          <thead>
            <tr>
              <th style={{ width: "16%" }}>Code</th>
              <th>Description</th>
              <th style={{ width: "22%" }}>Short</th>
              <th style={{ width: "50px" }}>Sts</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const level = a.level ?? a.code.split(".").length;
              const indent = (level - 1) * 20;
              return (
                <tr key={a.code} className={`lvl-${Math.min(level, 3)}`}>
                  <td className="code">{a.code}</td>
                  <td style={{ paddingLeft: 6 + indent }}>{a.description}</td>
                  <td className="short">{a.descShort ?? ""}</td>
                  <td className="status">{statusBadge(a.status)}</td>
                </tr>
              );
            })}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", fontStyle: "italic", padding: 20 }}>
                  No accounts defined.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
