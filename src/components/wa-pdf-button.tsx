"use client";

import { useState, useEffect, useRef } from "react";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

// A4 at 96 dpi. The printed vouchers are laid out for this width (210mm).
const A4_PX = 794;

export async function captureCanvas(contentId: string) {
  const el = document.getElementById(contentId);
  if (!el) return null;
  // On a phone the voucher is squeezed to the screen width: the header wraps
  // and the grid grows tall, so the PDF ran to two pages. Lay it out at A4
  // width for the capture (what a PC shows), then put it back.
  const narrow = el.offsetWidth < A4_PX;
  const saved = el.style.cssText;
  if (narrow) {
    el.style.width = `${A4_PX}px`;
    el.style.minWidth = `${A4_PX}px`;
    el.style.maxWidth = "none";
  }
  try {
    return await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  } finally {
    if (narrow) el.style.cssText = saved;
  }
}

function canvasToPdf(canvas: HTMLCanvasElement, onePage: boolean) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ratio = canvas.width / canvas.height;
  let imgW = pw - 10;
  let imgH = imgW / ratio;
  if (onePage && imgH > ph - 10) {
    // Shrink to the page height instead of spilling onto a second page.
    imgH = ph - 10;
    imgW = imgH * ratio;
  }
  if (imgH <= ph - 10) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (pw - imgW) / 2, 5, imgW, imgH);
    return pdf;
  }
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
  return pdf;
}

export async function shareBlob(blob: Blob, filename: string, type: string) {
  const file = new File([blob], filename, { type });
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      shared = true;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
      // NotAllowedError: a slow capture outlived the tap that allows sharing.
      // Hand over the file as a download rather than doing nothing.
    }
  }
  if (!shared) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function ExportPdfButton({ contentId, filename, onePage = false }: { contentId: string; filename: string; onePage?: boolean }) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      const canvas = await captureCanvas(contentId);
      if (!canvas) return;
      canvasToPdf(canvas, onePage).save(filename);
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

/**
 * Shares the document to WhatsApp (or downloads it where sharing isn't
 * available). `as="jpg"` sends one image of the whole document instead of a
 * PDF — it opens straight in the chat; `onePage` fits a PDF onto one page.
 */
export function WaPdfButton({
  contentId,
  filename,
  autoTrigger,
  as = "pdf",
  onePage = false,
}: {
  contentId: string;
  filename: string;
  autoTrigger?: boolean;
  as?: "pdf" | "jpg";
  onePage?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const triggered = useRef(false);

  const handle = async () => {
    setBusy(true);
    try {
      const canvas = await captureCanvas(contentId);
      if (!canvas) return;
      if (as === "jpg") {
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
        if (blob) await shareBlob(blob, filename.replace(/\.(pdf|jpe?g)$/i, "") + ".jpg", "image/jpeg");
      } else {
        await shareBlob(canvasToPdf(canvas, onePage).output("blob"), filename, "application/pdf");
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoTrigger && !triggered.current) {
      triggered.current = true;
      const t = setTimeout(() => handle(), 500);
      return () => clearTimeout(t);
    }
  }, [autoTrigger]);

  return (
    <button onClick={handle} disabled={busy} className="btn btn-sm" style={{ background: "#25D366", color: "#fff", border: "none", fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
      {busy ? "..." : "WA"}
    </button>
  );
}
