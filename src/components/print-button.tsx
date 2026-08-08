"use client";

export function PrintButton({
  label = "Print",
  size = "sm",
}: {
  label?: string;
  size?: "sm" | "lg";
}) {
  const cls = size === "lg" ? "btn no-print" : "btn btn-sm no-print";
  return (
    <button type="button" onClick={() => window.print()} className={cls}>
      {label}
    </button>
  );
}
