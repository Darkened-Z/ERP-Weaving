"use client";

/**
 * "Make a contract from here" — opens the contract entry form (in a new tab) for the
 * type currently chosen in the Conv/Grey Type toggle, so the operator can create a
 * grey-conversion (Conv) or grey-sale (Grey/Sal) contract without losing the godown entry.
 */
export function ContractOpenButton({ typeField = "conv_grey_type" }: { typeField?: string }) {
  const open = () => {
    const t = (document.querySelector<HTMLSelectElement>(`[name="${typeField}"]`)?.value ?? "").toUpperCase();
    const href =
      t === "CONV"
        ? "/external/contracts/grey-conversion?adding=1"
        : "/external/contracts/grey-sales?adding=1";
    window.open(href, "_blank", "noopener");
  };
  return (
    <button
      type="button"
      onClick={open}
      className="btn btn-outline btn-xs whitespace-nowrap"
      style={{ padding: "2px 8px" }}
      title="Create a contract of the selected type (opens in a new tab)"
    >
      ＋ New Contract
    </button>
  );
}
