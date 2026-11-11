import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The authenticated weekly cohort route uses an explicit force-dynamic
  // segment config and must not be statically cached.
  cacheComponents: false,
  partialPrefetching: false,
};

export default nextConfig;
