"use client";

import { useEffect, useRef, useState } from "react";
import { parseImages } from "@/lib/attachments";

/** Small contract photos on a report header, with a full-size viewer. */
export function ContractImageGallery({ value, contractNo }: { value: string | null | undefined; contractNo: string }) {
  const images = parseImages(value);
  const [active, setActive] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (active != null && !dialog.open) dialog.showModal();
    if (active == null && dialog.open) dialog.close();
  }, [active]);

  if (!images.length) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1 print:gap-0.5" aria-label={`Images for contract ${contractNo}`}>
      {images.map((src, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setActive(i)}
          className="cursor-pointer border border-white/70 focus-visible:outline-2 focus-visible:outline-white"
          title={`View contract image ${i + 1} of ${images.length}`}
          aria-label={`View contract image ${i + 1} of ${images.length}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`${contractNo} image ${i + 1}`} className="h-9 w-9 object-cover print:h-7 print:w-7" />
        </button>
      ))}
      <dialog
        ref={dialogRef}
        onClose={() => setActive(null)}
        onClick={(event) => { if (event.target === event.currentTarget) setActive(null); }}
        className="max-h-[95vh] max-w-[95vw] border-0 bg-slate-950 p-3 text-white backdrop:bg-black/80 no-print"
      >
        {active != null && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex w-full items-center justify-between gap-4 text-[12px] mono">
              <span>{contractNo} · Image {active + 1} of {images.length}</span>
              <button type="button" onClick={() => setActive(null)} className="cursor-pointer px-2 py-1 font-bold" aria-label="Close image">Close ✕</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[active]} alt={`${contractNo} image ${active + 1}`} className="max-h-[85vh] max-w-[90vw] object-contain" />
          </div>
        )}
      </dialog>
    </div>
  );
}
