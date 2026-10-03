"use client";

import { useState } from "react";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

async function generatePdf(contentId: string) {
  const el = document.getElementById(contentId);
  if (!el) return null;
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const imgW = pw - 10;
  const imgH = imgW / (canvas.width / canvas.height);
  if (imgH <= ph - 10) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 5, 5, imgW, imgH);
  } else {
    const srcPageH = ((ph - 10) / imgW) * canvas.width;
    let srcY = 0;
    let page = 0;
    while (srcY < canvas.height) {
      if (page > 0) pdf.addPage();
      const sliceH = Math.min(srcPageH, canvas.height - srcY);
      const sc = document.createElement("canvas");
      sc.width = canvas.width;
      sc.height = sliceH;
      sc.getContext("2d")!.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      pdf.addImage(sc.toDataURL("image/jpeg", 0.92), "JPEG", 5, 5, imgW, (sliceH / canvas.width) * imgW);
      srcY += sliceH;
      page++;
    }
  }
  return pdf;
}

export function ExportPdfButton({ contentId, filename }: { contentId: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      const pdf = await generatePdf(contentId);
      if (!pdf) return;
      pdf.save(filename);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={handle} disabled={busy} className="btn btn-sm btn-outline" style={{ opacity: busy ? 0.6 : 1 }}>
      {busy ? "..." : "Export PDF"}
    </button>
  );
}

export function WaPdfButton({ contentId, filename }: { contentId: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      const pdf = await generatePdf(contentId);
      if (!pdf) return;
      const blob = pdf.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <button onClick={handle} disabled={busy} className="btn btn-sm" style={{ background: "#25D366", color: "#fff", border: "none", fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
      {busy ? "..." : "WA"}
    </button>
  );
}
