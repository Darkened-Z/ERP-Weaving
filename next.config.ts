import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/external/reports/fabric-production-stock", destination: "/external/reports/grey-conv-sale-avg", permanent: true },
      { source: "/contracts", destination: "/external/reports/grey-conv-sale-avg", permanent: true },
    ];
  },
};

export default nextConfig;
