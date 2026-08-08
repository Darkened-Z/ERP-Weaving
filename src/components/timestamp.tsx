"use client";

import { useEffect, useState } from "react";

export function Timestamp() {
  const [t, setT] = useState<string>("");
  useEffect(() => {
    const upd = () => setT(new Date().toLocaleString());
    upd();
    const id = setInterval(upd, 60000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="mono text-[11px] tracking-wider text-[var(--muted)]">
      {t ? `AS OF: ${t}` : ""}
    </span>
  );
}
