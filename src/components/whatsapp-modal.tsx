"use client";

import { useState } from "react";

type Props = {
  party: string;
  despatchNo: string | number;
  date: string;
  vehicleNo?: string | null;
  biltyNo?: string | null;
  meters?: number | null;
  rolls?: number | null;
};

export function WhatsAppModal({ party, despatchNo, date, vehicleNo, biltyNo, meters, rolls }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const fmt = (n: number | null | undefined) =>
    n == null ? "-" : new Intl.NumberFormat("en-PK").format(Math.round(n));

  const message = [
    `Dear ${party},`,
    ``,
    `Your grey cloth despatch has been prepared:`,
    `- Chalan No: ${despatchNo}`,
    `- Date: ${date}`,
    `- Vehicle: ${vehicleNo ?? "-"}`,
    `- Bilty: ${biltyNo ?? "-"}`,
    `- Meters: ${fmt(meters)}`,
    `- Rolls: ${fmt(rolls)}`,
    ``,
    `Thank you for your business.`,
    `- SK Mills`,
  ].join("\n");

  const waHref = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const copy = async () => {
    setCopied(false);
    setCopyFailed(false);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(message);
        setCopied(true);
      } else {
        const ta = document.createElement("textarea");
        ta.value = message;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) setCopied(true);
        else setCopyFailed(true);
      }
    } catch {
      setCopyFailed(true);
    }
    setTimeout(() => { setCopied(false); setCopyFailed(false); }, 2500);
  };

  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
        Send WhatsApp
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "16px",
          }}
        >
          <div className="bg-white border border-black" style={{ maxWidth: 560, width: "100%" }}>
            <div className="border-b border-black px-4 py-2 flex items-center justify-between">
              <span className="label">WhatsApp Despatch</span>
              <button
                type="button"
                aria-label="Close"
                className="btn btn-outline btn-sm"
                onClick={() => setOpen(false)}
              >
                X
              </button>
            </div>

            <div className="p-4">
              <div className="label mb-2">Message Preview</div>
              <pre
                className="mono"
                style={{
                  border: "1px solid #000",
                  padding: "12px 14px",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: "#fff",
                  maxHeight: 260,
                  overflow: "auto",
                }}
              >
                {message}
              </pre>

              <div className="text-[11px] text-[var(--muted)] mono mt-4 mb-3">
                Actual auto-send via Twilio API - coming soon. For now, copy or open WhatsApp Web/App.
              </div>

              {copyFailed ? (
                <div className="text-[12px] mb-2" style={{ color: "#c00" }}>
                  Copy failed - select text manually
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 justify-end">
                <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
                  {copied ? "Copied" : "Copy to Clipboard"}
                </button>
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm"
                >
                  Open WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
