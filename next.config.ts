import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next writes agent instruction files at the repo root unless this is off.
  // The public repository carries no Markdown but its README.
  agentRules: false,
  // Lets a second build (local devnet tests) live next to the production one.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
