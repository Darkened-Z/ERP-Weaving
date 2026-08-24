"use client";

import { useState } from "react";

/**
 * Term picker for vouchers: CASH or DUE. When DUE is chosen, a due-date field
 * appears alongside it (submitted as `due_date`).
 */
export function TermSelect({
  defaultTerm = "CASH",
  defaultDate = "",
}: {
  defaultTerm?: string;
  defaultDate?: string;
}) {
  const [term, setTerm] = useState(defaultTerm === "DUE" ? "DUE" : "CASH");
  return (
    <>
      <div className="lg:col-span-2">
        <label className="label block mb-1">Term</label>
        <select
          name="term"
          className="input-box mono"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        >
          <option value="CASH">CASH</option>
          <option value="DUE">DUE</option>
        </select>
      </div>
      {term === "DUE" && (
        <div className="lg:col-span-2">
          <label className="label block mb-1">Due Date</label>
          <input
            name="due_date"
            type="date"
            className="input-box mono"
            defaultValue={defaultDate}
          />
        </div>
      )}
    </>
  );
}
