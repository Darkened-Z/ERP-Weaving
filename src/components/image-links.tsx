"use client";

import { parseImages } from "@/lib/attachments";

/**
 * Links to a voucher's attached images. The column holds a bare data URL or a
 * JSON array of them; browsers refuse to navigate a new tab to a data: URL, so
 * each image is opened through a blob URL instead of used as an href.
 */
export function ImageLinks({ value, label = "Img" }: { value: string | null | undefined; label?: string }) {
  const imgs = parseImages(value);
  if (!imgs.length) return <span className="text-[11px] text-[var(--muted)]">—</span>;

  const open = async (src: string) => {
    if (!src.startsWith("data:")) {
      window.open(src, "_blank", "noopener");
      return;
    }
    const blob = await (await fetch(src)).blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <span className="inline-flex gap-1">
      {imgs.map((src, i) => (
        <button
          key={i}
          type="button"
          onClick={() => void open(src)}
          className="text-[11px] underline cursor-pointer"
          title="Open this voucher's image"
        >
          {imgs.length > 1 ? `${label} ${i + 1}` : label}
        </button>
      ))}
    </span>
  );
}
