import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { parseImages } from "@/lib/attachments";

// One receipt (wasooli) photo of a Dami slip, served as the image itself so the
// list can link to it without shipping every slip's photos in the page.
// ?n= picks the photo when a slip carries several.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const n = parseInt(new URL(req.url).searchParams.get("n") ?? "0", 10) || 0;
  if (!Number.isFinite(id)) return new Response("Not found", { status: 404 });

  const [row] = await db
    .select({ img: schema.intGreyDespatchDami.img })
    .from(schema.intGreyDespatchDami)
    .where(eq(schema.intGreyDespatchDami.id, id))
    .limit(1);
  const src = parseImages(row?.img)[n];
  if (!src) return new Response("No image", { status: 404 });

  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(src);
  if (!m) return Response.redirect(src, 302);
  const body = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
  return new Response(body, { headers: { "Content-Type": m[1], "Cache-Control": "private, no-store" } });
}
