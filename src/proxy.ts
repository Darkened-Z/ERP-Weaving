import { NextResponse, type NextRequest } from "next/server";
import { activeSession } from "@/lib/active-session";
import { canAccess, firstAllowedHref } from "@/lib/nav";

/**
 * Every page, route handler and server action needs a signed-in user. Pages
 * used to rely on Shell → requireSession, which left the print pages, route
 * handlers and every server action (they POST straight to the page URL)
 * reachable without a login. Checking here covers all of them at once.
 */
function withSecurityHeaders(res: NextResponse) {
  // The public demo is framed by the portfolio (CSP frame-ancestors in next.config).
  if (process.env.DEMO_DB !== "1") res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return withSecurityHeaders(NextResponse.next());
  // The phone app signs in with a bearer token, not the cookie; every
  // /api/m route checks it itself (mobileSession).
  if (pathname.startsWith("/api/m/")) {
    // Dev only: lets the app's web preview (expo, port 8081) call a local server.
    if (process.env.NODE_ENV !== "production" && request.headers.get("origin") === "http://localhost:8081") {
      const cors = { "Access-Control-Allow-Origin": "http://localhost:8081", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, DELETE" };
      if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });
      const res = NextResponse.next();
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    }
    return withSecurityHeaders(NextResponse.next());
  }

  const session = await activeSession(request.cookies.get("session")?.value);
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
