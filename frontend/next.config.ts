import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone output mode.
   * Creates .next/standalone/ with a self-contained server.js + trimmed node_modules.
   * Required by frontend/Dockerfile Stage 3 — reduces image size from ~1 GB → ~100 MB.
   */
  output: "standalone",

  /** Strip source maps from the production client bundle. */
  productionBrowserSourceMaps: false,
};

export default nextConfig;
