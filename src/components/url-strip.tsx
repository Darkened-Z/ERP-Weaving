"use client";

import { useEffect } from "react";

/**
 * Strips a URL query parameter after the initial render, so a one-shot flag
 * like ?error=dup shows the banner once and then disappears from the address
 * bar — reload / bookmark won't re-trigger it.
 */
export function UrlStrip({ param }: { param: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(param)) return;
    url.searchParams.delete(param);
    window.history.replaceState({}, "", url.toString());
  }, [param]);
  return null;
}
