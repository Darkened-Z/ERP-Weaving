"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrImage({ value, size = 100 }: { value: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { margin: 0, width: size })
      .then((s) => { if (!cancelled) setSrc(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [value, size]);
  return src ? (
    <img src={src} width={size} height={size} alt="" />
  ) : (
    <div style={{ width: size, height: size }} className="bg-gray-100" />
  );
}
