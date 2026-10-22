import type { NextConfig } from "next";

const isDemo = process.env.DEMO_DB === "1";
// The demo is embedded on the portfolio; the mill's build stays unframeable.
const frameHeader = isDemo
  ? { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://zeeshan-k.vercel.app https://zeeshan-khan-dev.vercel.app https://devora-psi.vercel.app" }
  : { key: "X-Frame-Options", value: "DENY" };

const nextConfig: NextConfig = {
  // The demo deployment (DEMO_DB=1) reads its database from this bundled file;
  // production builds leave it out.
  env: { NEXT_PUBLIC_DEMO: isDemo ? "1" : "" },
  ...(isDemo ? { outputFileTracingIncludes: { "/**": ["./demo/demo.db"] } } : {}),
  experimental: {
    staleTimes: { dynamic: 0, static: 30 },
    // Voucher photos travel inside the save form as data URLs (~70 KB each), so
    // the 1 MB default failed any JV with ~13 photos. Vercel caps a request at
    // 4.5 MB; PasswordGuard stops the save with a message before this limit.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async redirects() {
    return [
      { source: "/external/reports/fabric-production-stock", destination: "/external/reports/grey-conv-sale-avg", permanent: true },
      { source: "/contracts", destination: "/external/reports/grey-conv-sale-avg", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|favicon).*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          frameHeader,
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
