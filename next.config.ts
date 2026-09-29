import type { NextConfig } from "next";

// SITE_VARIANT=customer builds the customer site (coloured illustrations, no admin).
const isCustomerSite = process.env.SITE_VARIANT === "customer";

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    // The back office only exists on the main catalogue site.
    return isCustomerSite
      ? [
          { source: "/admin", destination: "/", permanent: false },
          { source: "/admin/:path*", destination: "/", permanent: false },
        ]
      : [];
  },
};

export default nextConfig;
