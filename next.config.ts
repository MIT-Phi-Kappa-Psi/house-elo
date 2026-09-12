import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-postgres must not be bundled; it loads native/optional deps at runtime.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
