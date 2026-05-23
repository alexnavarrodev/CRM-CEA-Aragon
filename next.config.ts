import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth is handled at the Server Component level (dashboard layout)
  // No proxy/middleware needed — avoids Turbopack edge bundling issues with Netlify
};

export default nextConfig;
