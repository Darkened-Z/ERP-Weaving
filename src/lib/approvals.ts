import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getSession, type Session } from "@/lib/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { today, nowTime } from "@/lib/time";

export type ApprovalStatus = "STORE" | "AUDITED" | "POSTED";

// Role gating: STORE_INCHARGE / AUDITOR are Oracle-native. If a deployment
// only has ADMIN + generic roles, ADMIN can do anything (documented).
export function canForwardToAudit(role?: string): boolean {
  return role === "STORE_INCHARGE" || role === "ADMIN";
}
export function canForwardToFinance(role?: string): boolean {
  return role === "AUDITOR" || role === "ADMIN";
}
export function canRevert(role?: string): boolean {
  return role === "ADMIN";
}

export const APPROVAL_TABLES = {
  grn: { table: schema.storeGrn, path: "/store/grn", label: "GRN" },
  demand: { table: schema.storeDemands, path: "/store/demand", label: "Demand" },
  return: { table: schema.storeReturns, path: "/store/gatepass", label: "Store Return" },
  adjustment: { table: schema.storeAdjustments, path: "/store/adjustment", label: "Adjustment" },
} as const;

export type ApprovalKind = keyof typeof APPROVAL_TABLES;

function stamp(): string {
  return `${today()} ${nowTime()}`;
}

async function assertSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function forwardToAudit(kind: ApprovalKind, id: number): Promise<void> {
  const s = await assertSession();
  const cfg = APPROVAL_TABLES[kind];
  if (!canForwardToAudit(s.roleName)) redirect(`${cfg.path}?id=${id}&error=role_denied`);

  const [row] = await db
    .select({ approvalStatus: cfg.table.approvalStatus })
    .from(cfg.table)
    .where(eq(cfg.table.id, id))
    .limit(1);
  if (!row) return;
  if (row.approvalStatus !== "STORE") redirect(`${cfg.path}?id=${id}&error=bad_state`);

  await db
    .update(cfg.table)
    .set({ approvalStatus: "AUDITED", auditedBy: s.userId, auditedAt: stamp() })
    .where(eq(cfg.table.id, id));

  revalidatePath(cfg.path);
  revalidatePath("/my-queue");
}

export async function forwardToFinance(kind: ApprovalKind, id: number): Promise<void> {
  const s = await assertSession();
  const cfg = APPROVAL_TABLES[kind];
  if (!canForwardToFinance(s.roleName)) redirect(`${cfg.path}?id=${id}&error=role_denied`);

  const [row] = await db
    .select({ approvalStatus: cfg.table.approvalStatus })
    .from(cfg.table)
    .where(eq(cfg.table.id, id))
    .limit(1);
  if (!row) return;
  if (row.approvalStatus !== "AUDITED") redirect(`${cfg.path}?id=${id}&error=bad_state`);

  await db
    .update(cfg.table)
    .set({ approvalStatus: "POSTED", postedBy: s.userId, postedAt: stamp() })
    .where(eq(cfg.table.id, id));

  revalidatePath(cfg.path);
  revalidatePath("/my-queue");
}

export async function revertApproval(kind: ApprovalKind, id: number): Promise<void> {
  const s = await assertSession();
  const cfg = APPROVAL_TABLES[kind];
  if (!canRevert(s.roleName)) redirect(`${cfg.path}?id=${id}&error=role_denied`);

  const [row] = await db
    .select({ approvalStatus: cfg.table.approvalStatus })
    .from(cfg.table)
    .where(eq(cfg.table.id, id))
    .limit(1);
  if (!row) return;

  if (row.approvalStatus === "POSTED") {
    await db
      .update(cfg.table)
      .set({ approvalStatus: "AUDITED", postedBy: null, postedAt: null })
      .where(eq(cfg.table.id, id));
  } else if (row.approvalStatus === "AUDITED") {
    await db
      .update(cfg.table)
      .set({ approvalStatus: "STORE", auditedBy: null, auditedAt: null })
      .where(eq(cfg.table.id, id));
  } else {
    redirect(`${cfg.path}?id=${id}&error=bad_state`);
  }

  revalidatePath(cfg.path);
  revalidatePath("/my-queue");
}

export function statusBadgeClasses(status: string): { bg: string; fg: string } {
  switch (status) {
    case "AUDITED":
      return { bg: "#f5f5f5", fg: "#000" };
    case "POSTED":
      return { bg: "#000", fg: "#fff" };
    default:
      return { bg: "transparent", fg: "#000" };
  }
}
