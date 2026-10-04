"use client";

import { useRef, useState, useCallback, useEffect } from "react";

/** Max photos per field — keeps the stored text column a sane size. */
const MAX_IMAGES = 6;

/**
 * Read whatever is in the column. Older records hold a single bare data URL;
 * newer ones hold a JSON array. Both must load, so nothing saved before this
 * became multi-image is lost.
 */
function parseStored(v: string | null | undefined): string[] {
  const raw = (v ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string" && x);
    } catch {
      /* fall through to treating it as a single value */
    }
  }
  return [raw];
}

/**
 * Write back in the narrowest form that fits: a lone photo stays a bare data
 * URL exactly as before, so single-image records are byte-identical to what
 * this field always stored and nothing downstream has to change. Only a second
 * photo promotes the value to a JSON array.
 */
function serialize(list: string[]): string {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return JSON.stringify(list);
}

/**
 * Evidence-photo picker. Captures/selects images, downscales each client-side to
 * a small JPEG data URL, and writes them into a hidden field (stored as text in
 * the DB). Several photos can be attached to one field — the gallery picker
 * accepts a multi-selection and the camera can be used repeatedly.
 */
export function ImageAttach({
  name,
  defaultValue,
  maxPx = 900,
  quality = 0.6,
  max = MAX_IMAGES,
  compact = false,
}: {
  name: string;
  defaultValue?: string | null;
  maxPx?: number;
  quality?: number;
  max?: number;
  /** One small button instead of two — for a cell in a voucher grid. */
  compact?: boolean;
}) {
  const [images, setImages] = useState<string[]>(parseStored(defaultValue));
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const lbRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (lightbox) lbRef.current?.showModal();
    else lbRef.current?.close();
  }, [lightbox]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file
    if (!files.length) return;
    setBusy(true);
    const added: string[] = [];
    for (const f of files) {
      if (images.length + added.length >= max) break;
      try {
        added.push(await downscale(f, maxPx, quality));
      } catch {
        /* skip an unreadable file rather than failing the whole pick */
      }
    }
    if (added.length) setImages((cur) => [...cur, ...added].slice(0, max));
    setBusy(false);
  }

  const removeAt = (i: number) => setImages((cur) => cur.filter((_, k) => k !== i));
  const full = images.length >= max;

  return (
    <div>
      <input type="hidden" name={name} value={serialize(images)} readOnly />
      {/* In a grid there is no room for two buttons and a counter. One small
          control that says how many are attached does the same job. */}
      {compact ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => images.length ? setLightbox(true) : galleryRef.current?.click()}
            className={`btn btn-xs ${images.length ? "btn-primary" : "btn-outline"}`}
            disabled={busy}
            title={images.length ? `View ${images.length} photo(s)` : "Attach a photo"}
            style={images.length ? { border: "2px solid var(--primary)", fontWeight: 700 } : undefined}
          >
            {busy ? "…" : images.length ? `IMG ${images.length}` : "IMG"}
          </button>
          {images.length > 0 && (
            <button
              type="button"
              onClick={() => setImages([])}
              className="text-[11px] cursor-pointer"
              style={{ color: "var(--danger)" }}
              title="Remove the photos on this line"
            >
              ✕
            </button>
          )}
          {lightbox && (
            <dialog
              ref={lbRef}
              onClose={() => setLightbox(false)}
              onClick={(e) => { if (e.target === e.currentTarget) setLightbox(false); }}
              style={{ padding: 0, border: "none", background: "rgba(0,0,0,0.85)", maxWidth: "90vw", maxHeight: "90vh", width: "auto" }}
            >
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {images.map((src, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`photo ${i + 1}`} style={{ maxHeight: "70vh", maxWidth: "80vw", objectFit: "contain", border: "2px solid #fff" }} />
                      <button
                        type="button"
                        onClick={() => { removeAt(i); if (images.length <= 1) setLightbox(false); }}
                        style={{ position: "absolute", top: 4, right: 4, background: "var(--danger)", color: "#fff", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {!full && (
                    <button type="button" onClick={() => { setLightbox(false); galleryRef.current?.click(); }} className="btn btn-sm" style={{ background: "#fff", color: "#000" }}>
                      Add more
                    </button>
                  )}
                  <button type="button" onClick={() => setLightbox(false)} className="btn btn-sm" style={{ background: "transparent", color: "#fff", border: "1px solid #fff" }}>
                    Close
                  </button>
                </div>
              </div>
            </dialog>
          )}
        </div>
      ) : (
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          className="btn btn-outline btn-sm"
          disabled={full || busy}
          title={full ? `Up to ${max} photos` : "Pick one or more photos"}
        >
          {images.length ? "Add more" : "Gallery"}
        </button>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="btn btn-outline btn-sm"
          disabled={full || busy}
        >
          Camera
        </button>
        {busy && <span className="text-[11px] text-[var(--muted)]">Adding…</span>}
        {images.length > 0 && (
          <span className="text-[11px] text-[var(--muted)] mono">
            {images.length} / {max}
          </span>
        )}
        {images.length > 1 && (
          <button
            type="button"
            onClick={() => setImages([])}
            className="text-[11px] text-[var(--danger)] uppercase tracking-[0.08em] font-semibold cursor-pointer"
          >
            Remove all
          </button>
        )}
      </div>
      )}

      {!compact && images.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {images.map((src, i) => (
            <span key={i} className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`attachment ${i + 1}`}
                className="h-16 w-16 object-cover border border-[var(--border)]"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                title="Remove this photo"
                className="absolute -top-1.5 -right-1.5 h-4 w-4 leading-none rounded-full bg-[var(--danger)] text-white text-[10px] cursor-pointer flex items-center justify-center"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Gallery / file picker — no capture, so mobile shows the photo library.
          `multiple` lets several be chosen in one go. */}
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onPick} />
      {/* Camera — capture hint opens the camera directly on mobile. One shot per
          press, so it appends rather than replacing. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPick} />
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
