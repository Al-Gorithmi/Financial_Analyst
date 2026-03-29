import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["pdf-parse", "better-sqlite3"],
  allowedDevOrigins: ["100.107.214.21", "10.0.0.*"],
};

export default nextConfig;
