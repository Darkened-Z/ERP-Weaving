import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { ensureTaskTables } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** Tickets became tasks (2026-11-17); an old ticket link opens the task it was carried into. */
export default async function TicketMoved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureTaskTables();
  const n = /^\d+$/.test(id) ? parseInt(id, 10) : 0;
  const [t] = n ? await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.legacyTicketId, n)) : [];
  redirect(t ? `/tasks/${t.id}` : "/tasks");
}
