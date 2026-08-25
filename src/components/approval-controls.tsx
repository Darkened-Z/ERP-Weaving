import {
  canForwardToAudit,
  canForwardToFinance,
  canRevert,
  statusBadgeClasses,
  type ApprovalKind,
  type ApprovalStatus,
} from "@/lib/approvals";
import { ConfirmButton } from "./confirm-button";

const LABEL: Record<ApprovalStatus, string> = {
  STORE: "STORE",
  AUDITED: "AUDITED",
  POSTED: "POSTED",
};

export function ApprovalBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "STORE") as ApprovalStatus;
  const c = statusBadgeClasses(s);
  return (
    <span
      className="inline-block border px-2 py-0.5 text-[11px] font-bold uppercase mono"
      style={{ background: c.bg, color: c.fg, borderColor: "#000" }}
    >
      {LABEL[s] ?? s}
    </span>
  );
}

type ActionProps = {
  kind: ApprovalKind;
  id: number;
  status: string | null | undefined;
  role?: string;
  forwardAudit: (formData: FormData) => Promise<void>;
  forwardFinance: (formData: FormData) => Promise<void>;
  revert: (formData: FormData) => Promise<void>;
};

export function ApprovalActions({
  id,
  status,
  role,
  forwardAudit,
  forwardFinance,
  revert,
}: ActionProps) {
  const s = (status ?? "STORE") as ApprovalStatus;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <ApprovalBadge status={s} />
      {s === "STORE" && canForwardToAudit(role) && (
        <form action={forwardAudit} className="inline">
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="btn btn-outline btn-sm">
            Forward to Audit
          </button>
        </form>
      )}
      {s === "AUDITED" && canForwardToFinance(role) && (
        <form action={forwardFinance} className="inline">
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="btn btn-outline btn-sm">
            Forward to Finance
          </button>
        </form>
      )}
      {(s === "AUDITED" || s === "POSTED") && canRevert(role) && (
        <form action={revert} className="inline">
          <input type="hidden" name="id" value={id} />
          <ConfirmButton
            className="btn btn-outline btn-sm"
            message={
              s === "POSTED"
                ? "Revert to AUDITED? Finance posting will be undone."
                : "Revert to STORE? Audit approval will be undone."
            }
          >
            Revert
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
