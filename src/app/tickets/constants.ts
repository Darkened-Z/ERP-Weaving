export type TicketType =
  | "LOOM_BREAKDOWN"
  | "QUALITY_DEFECT"
  | "WEAVER_ISSUE"
  | "PARTY_COMPLAINT"
  | "MAINTENANCE"
  | "OTHER";

export type TicketPriority = "P1_URGENT" | "P2_HIGH" | "P3_NORMAL" | "P4_LOW";

export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "RESOLVED"
  | "CLOSED";

export type EnumOption<T extends string> = {
  value: T;
  label: string;
  shortLabel: string;
};

export const TICKET_TYPES: EnumOption<TicketType>[] = [
  { value: "LOOM_BREAKDOWN", label: "Loom Breakdown", shortLabel: "Loom" },
  { value: "QUALITY_DEFECT", label: "Quality Defect", shortLabel: "Quality" },
  { value: "WEAVER_ISSUE", label: "Weaver Issue", shortLabel: "Weaver" },
  { value: "PARTY_COMPLAINT", label: "Party Complaint", shortLabel: "Party" },
  { value: "MAINTENANCE", label: "Maintenance", shortLabel: "Maint" },
  { value: "OTHER", label: "Other", shortLabel: "Other" },
];

export const TICKET_PRIORITIES: EnumOption<TicketPriority>[] = [
  { value: "P1_URGENT", label: "P1 Urgent", shortLabel: "P1" },
  { value: "P2_HIGH", label: "P2 High", shortLabel: "P2" },
  { value: "P3_NORMAL", label: "P3 Normal", shortLabel: "P3" },
  { value: "P4_LOW", label: "P4 Low", shortLabel: "P4" },
];

export const TICKET_STATUSES: EnumOption<TicketStatus>[] = [
  { value: "OPEN", label: "Open", shortLabel: "Open" },
  { value: "IN_PROGRESS", label: "In Progress", shortLabel: "In Progress" },
  { value: "BLOCKED", label: "Blocked", shortLabel: "Blocked" },
  { value: "RESOLVED", label: "Resolved", shortLabel: "Resolved" },
  { value: "CLOSED", label: "Closed", shortLabel: "Closed" },
];

export const STATUS_ORDER: TicketStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "RESOLVED",
  "CLOSED",
];

export function getTypeLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return TICKET_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function getPriorityLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return TICKET_PRIORITIES.find((p) => p.value === value)?.label ?? value;
}

export function getStatusLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return TICKET_STATUSES.find((s) => s.value === value)?.label ?? value;
}

export function getPriorityShort(value: string | null | undefined): string {
  if (!value) return "-";
  return TICKET_PRIORITIES.find((p) => p.value === value)?.shortLabel ?? value;
}

export function getTypeShort(value: string | null | undefined): string {
  if (!value) return "-";
  return TICKET_TYPES.find((t) => t.value === value)?.shortLabel ?? value;
}

export function getPriorityChipClass(value: string | null | undefined): string {
  switch (value) {
    case "P1_URGENT":
      return "bg-black text-white";
    case "P2_HIGH":
      return "border border-black bg-white";
    case "P3_NORMAL":
      return "bg-gray-100";
    case "P4_LOW":
      return "bg-gray-50 text-gray-500";
    default:
      return "bg-gray-100";
  }
}
