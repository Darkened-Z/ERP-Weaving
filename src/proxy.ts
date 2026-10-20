import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/session-token";
import { canAccess, firstAllowedHref } from "@/lib/nav";

/**
 * Every page, route handler and server action needs a signed-in user. Pages
 * used to rely on Shell → requireSession, which left the print pages, route
 * handlers and every server action (they POST straight to the page URL)
 * reachable without a login. Checking here covers all of them at once.
 */
function withSecurityHeaders(res: NextResponse) {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return withSecurityHeaders(NextResponse.next());

  const session = verifyToken(request.cookies.get("session")?.value);
  if (session) {
    if (canAccess(session, pathname)) return withSecurityHeaders(NextResponse.next());
    // A restricted user outside their modules: pages bounce to their first
    // module; saves and API calls are refused outright.
    if (pathname.startsWith("/api/")) {
      return withSecurityHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
    const home = firstAllowedHref(session.allowedModules ?? null);
    if ((request.method !== "GET" && request.method !== "HEAD") || home === pathname || !canAccess(session, home)) {
      return withSecurityHeaders(new NextResponse("You do not have access to this page.", { status: 403 }));
    }
    return withSecurityHeaders(NextResponse.redirect(new URL(home, request.url)));
  }

  if (pathname.startsWith("/api/")) {
    return withSecurityHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return withSecurityHeaders(new NextResponse("Unauthorized", { status: 401 }));
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Static build output, image optimisation and files served from public/
  // (anything with an extension at the root, e.g. /sk-logo.png) stay open.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|[^/]+\\.[a-zA-Z0-9]+$).*)"],
};
