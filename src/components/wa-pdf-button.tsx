"use client";

import { useRef, useState } from "react";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

export function WaPdfButton({
  contentId,
  filename,
}: {
  contentId: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    const el = document.getElementById(contentId);
    if (!el) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      const imgW = pw - 10;
      const imgH = imgW / ratio;
      let y = 5;
      if (imgH <= ph - 10) {
        pdf.addImage(imgData, "JPEG", 5, y, imgW, imgH);
      } else {
        const pageH = ph - 10;
        let srcY = 0;
        const srcPageH = (pageH / imgW) * canvas.width;
        let page = 0;
        while (srcY < canvas.height) {
          if (page > 0) pdf.addPage();
          const sliceH = Math.min(srcPageH, canvas.height - srcY);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          sliceCanvas.getContext("2d")!.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const sliceImg = sliceCanvas.toDataURL("image/jpeg", 0.92);
          const drawH = (sliceH / canvas.width) * imgW;
          pdf.addImage(sliceImg, "JPEG", 5, 5, imgW, drawH);
          srcY += sliceH;
          page++;
        }
      }
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
    <button
      onClick={generate}
      disabled={busy}
      className="btn btn-sm"
      style={{ background: "#25D366", color: "#fff", border: "none", fontWeight: 700, opacity: busy ? 0.6 : 1 }}
    >
      {busy ? "..." : "WA"}
    </button>
  );
}
