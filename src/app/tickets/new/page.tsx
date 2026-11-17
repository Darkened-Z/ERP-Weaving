import { redirect } from "next/navigation";

export default async function NewTicketMoved({ searchParams }: { searchParams: Promise<{ loom?: string }> }) {
  const { loom } = await searchParams;
  redirect(loom ? `/tasks/new?loom=${encodeURIComponent(loom)}` : "/tasks/new");
}
