"use client";

import { useRef, useState } from "react";

/**
 * Evidence-photo picker. Captures/selects an image, downscales it client-side to a
 * small JPEG data URL, and writes it into a hidden field (stored as text in the DB).
 * Keeps the stored value small (~max px + quality) so it fits a normal text column.
 */
export function ImageAttach({
  name,
  defaultValue,
  maxPx = 900,
  quality = 0.6,
}: {
  name: string;
  defaultValue?: string | null;
  maxPx?: number;
  quality?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string>(defaultValue || "");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setDataUrl(await downscale(file, maxPx, quality));
    } catch {
      /* ignore unreadable file */
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={dataUrl} readOnly />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outline btn-sm">
          {dataUrl ? "Change Photo" : "Add Photo"}
        </button>
        {dataUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dataUrl} alt="evidence" className="h-16 w-16 object-cover border border-[var(--border)]" />
            <button
              type="button"
              onClick={() => setDataUrl("")}
              className="text-[11px] text-[var(--danger)] uppercase tracking-[0.08em] font-semibold cursor-pointer"
            >
              Remove
            </button>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

function downscale(file: File, max: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
