import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standard Next start on Railway (Nixpacks). Avoid standalone unless using a custom Dockerfile.
  // botbuilder is CommonJS with dynamic requires; keep it out of the bundler.
  serverExternalPackages: ["botbuilder", "botframework-connector", "botbuilder-core"],
};

export default nextConfig;
