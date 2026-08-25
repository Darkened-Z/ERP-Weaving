import { db, schema } from "@/db";

// Shared print header + signature block for chalans, invoices, and bills.
// Consumes companyProfile so every printout inherits the same company details.

async function getProfile() {
  const [p] = await db.select().from(schema.companyProfile);
  return p ?? null;
}

export async function PrintHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const p = await getProfile();
  return (
    <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-4">
      <div>
        {p?.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.logoDataUrl} alt="logo" style={{ maxHeight: 60, marginBottom: 4 }} />
        ) : null}
        <div className="text-[22px] font-extrabold tracking-tight leading-tight">
          {p?.name ?? "SK Weaving Mills"}
        </div>
        {p?.address ? <div className="text-[11px]">{p.address}</div> : null}
        <div className="text-[11px] flex gap-3 mt-0.5">
          {p?.phone ? <span>Ph: {p.phone}</span> : null}
          {p?.email ? <span>Email: {p.email}</span> : null}
        </div>
        <div className="text-[11px] flex gap-3">
          {p?.ntn ? <span>NTN: {p.ntn}</span> : null}
          {p?.gstNo ? <span>GST/STN: {p.gstNo}</span> : null}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[16px] font-bold uppercase tracking-wide">{title}</div>
        {subtitle ? <div className="text-[11px] text-[var(--muted)]">{subtitle}</div> : null}
        {right ? <div className="mt-1">{right}</div> : null}
      </div>
    </div>
  );
}

/** Standard 3-signatory footer for chalans/invoices/bills. */
export function SignatureRow({
  labels = ["Prepared By", "Checked By", "Authorized Signatory"],
}: {
  labels?: string[];
}) {
  return (
    <div className="grid grid-cols-3 gap-8 mt-16 text-[11px]">
      {labels.map((l) => (
        <div key={l} className="border-t border-black pt-1 text-center uppercase tracking-wide">
          {l}
        </div>
      ))}
    </div>
  );
}

/** Minimal print CSS for A4 chalans; drop into any print page. */
export function PrintStyles() {
  return (
    <style>{`
      @page { size: A4; margin: 12mm; }
      @media print {
        .no-print { display: none !important; }
        body { font-size: 11px; }
        table { break-inside: avoid; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        thead { display: table-header-group; }
      }
    `}</style>
  );
}
