import type { NextConfig } from "next";

// SITE_VARIANT=customer builds the customer site (coloured illustrations, no admin).
const isCustomerSite = process.env.SITE_VARIANT === "customer";

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    // Earlier catalogue PDFs (office and brochure editions, still in the bucket) now open the current one.
    const oldPdfs = ["office-catalogue", "office-catalogue-photo", "e-catalogue", "e-catalogue-photo"].map((name) => ({
      source: `/media/catalogue/${name}.pdf`,
      destination: "/catalogue/nat-furniture-e-catalogue-2026.pdf",
      permanent: false,
    }));
    // The back office only exists on the main catalogue site.
    return isCustomerSite
      ? [
          ...oldPdfs,
          { source: "/admin", destination: "/", permanent: false },
          { source: "/admin/:path*", destination: "/", permanent: false },
        ]
      : oldPdfs;
  },
};

export default nextConfig;
