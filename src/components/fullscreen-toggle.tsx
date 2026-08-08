"use client";

import { useEffect, useState } from "react";

export function FullscreenToggle() {
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  if (isFs) return null;

  return (
    <button
      onClick={() => document.documentElement.requestFullscreen()}
      className="fixed top-4 right-4 z-50 bg-white text-black px-3 py-2 text-[11px] font-mono uppercase tracking-[0.15em] hover:bg-neutral-200 transition"
    >
      Fullscreen
    </button>
  );
}
