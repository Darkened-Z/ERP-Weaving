"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Opens the picked batch in Yarn Batch Profit — its purchase, every sale out of
 * it and what is left (owner 2026-10-22: "the stock shown here, where does its
 * detail come from"). Reads the batch picker in its own grid cell.
 */
export function BatchDetailLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  const [batch, setBatch] = useState("");

  useEffect(() => {
    const input = ref.current?.closest("td")?.querySelector<HTMLInputElement>('input[name="line_stock_key"]');
    if (!input) return;
    const read = () => setBatch(input.value.trim());
    const first = setTimeout(read, 0);
    input.addEventListener("change", read);
    return () => {
      clearTimeout(first);
      input.removeEventListener("change", read);
    };
  }, []);

  return (
    <a
      ref={ref}
      href={batch ? `/external/reports/yarn-batch-profit?q=${encodeURIComponent(batch)}` : undefined}
      target="_blank"
      rel="noopener"
      className={`text-[10px] mono underline ${batch ? "" : "invisible"}`}
      title="Purchase, sales and balance of this batch"
    >
      Batch detail
    </a>
  );
}
