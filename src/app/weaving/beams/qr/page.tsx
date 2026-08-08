import { Shell } from "@/components/shell";
import { db, schema } from "@/db";
import { inArray } from "drizzle-orm";
import { PrintButton } from "@/components/print-button";
import { QrImage } from "./qr-image";

export const dynamic = "force-dynamic";

export default async function BeamsQrPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) {
    return (
      <Shell active="beams">
        <div className="animate-in">
          <h1 className="page-title mb-6">Beam QR Stickers</h1>
          <div className="border border-black p-6">
            <p className="text-[13px]"><strong>NEXT_PUBLIC_APP_URL is not set.</strong> QR codes would encode localhost URLs. Set this env var (e.g. https://sk-mills.example.com) before printing.</p>
          </div>
        </div>
      </Shell>
    );
  }

  const params = await searchParams;
  const idList = params.ids
    ? params.ids
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n))
    : [];

  if (params.ids !== undefined && idList.length === 0) {
    return (
      <Shell active="beams">
        <div className="animate-in">
          <h1 className="page-title mb-6">Beam QR Stickers</h1>
          <p className="text-[13px]">No valid beam ids in query string.</p>
        </div>
      </Shell>
    );
  }

  const rows = idList.length
    ? await db
        .select()
        .from(schema.beams)
        .where(inArray(schema.beams.id, idList))
    : await db.select().from(schema.beams).orderBy(schema.beams.beamNo);

  return (
    <Shell active="beams">
      <style>{`
        @page { size: A4; margin: 10mm; }
        .qr-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        @media print {
          .no-print { display: none !important; }
          .qr-grid {
            grid-template-columns: repeat(2, 90mm);
            gap: 4mm;
          }
          .qr-sticker {
            page-break-inside: avoid;
            width: 90mm;
            height: 45mm;
          }
        }
        .qr-sticker {
          border: 1px solid #000;
          padding: 6px 8px;
          display: flex;
          gap: 10px;
          align-items: center;
          background: #fff;
        }
        .qr-sticker .qr-fields {
          flex: 1;
          min-width: 0;
        }
        .qr-sticker .qr-beam {
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.01em;
          line-height: 1;
          margin-bottom: 4px;
        }
        .qr-sticker .qr-row {
          font-size: 10px;
          line-height: 1.35;
          display: flex;
          gap: 6px;
        }
        .qr-sticker .qr-lbl {
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #666;
          min-width: 42px;
        }
      `}</style>

      <div className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 gap-4 no-print">
          <div>
            <h1 className="page-title">Beam QR Stickers</h1>
            <p className="text-[13px] text-[var(--muted)] mt-2">
              {rows.length} stickers
              {idList.length ? ` (filtered by ${idList.length} id${idList.length === 1 ? "" : "s"})` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/weaving/beams" className="btn btn-outline btn-sm">Back</a>
            <PrintButton label="Print Stickers" />
          </div>
        </div>

        <div className="qr-grid">
          {rows.map((b) => {
            const url = `${origin}/weaving/beams?id=${b.id}`;
            return (
              <div key={b.id} className="qr-sticker">
                <QrImage value={url} size={110} />
                <div className="qr-fields">
                  <div className="qr-beam mono">{b.beamNo}</div>
                  <div className="qr-row">
                    <span className="qr-lbl">Prod</span>
                    <span className="mono">{b.product ?? "-"}</span>
                  </div>
                  <div className="qr-row">
                    <span className="qr-lbl">Count</span>
                    <span className="mono">{b.yarnCount ?? "-"}</span>
                  </div>
                  <div className="qr-row">
                    <span className="qr-lbl">Ends</span>
                    <span className="mono">{b.ends ?? "-"}</span>
                  </div>
                  <div className="qr-row">
                    <span className="qr-lbl">Length</span>
                    <span className="mono">{b.length ?? "-"}</span>
                  </div>
                  <div className="qr-row">
                    <span className="qr-lbl">Weight</span>
                    <span className="mono">{b.weight ?? "-"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <div className="border border-black p-6 text-center text-[13px] text-[var(--muted)]">
            No beams to render.
          </div>
        ) : null}
      </div>
    </Shell>
  );
}
