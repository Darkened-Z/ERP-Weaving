import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/session-token";

/**
 * Every page, route handler and server action needs a signed-in user. Pages
 * used to rely on Shell → requireSession, which left the print pages, route
 * handlers and every server action (they POST straight to the page URL)
 * reachable without a login. Checking here covers all of them at once.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  if (verifyToken(request.cookies.get("session")?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // A server action posted without a session gets a plain 401 rather than a
  // redirect the action client can't follow.
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Static build output, image optimisation and files served from public/
  // (anything with an extension at the root, e.g. /sk-logo.png) stay open.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|[^/]+\\.[a-zA-Z0-9]+$).*)"],
};
