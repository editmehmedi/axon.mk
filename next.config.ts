import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Cloudflare quick tunnels so shared preview URLs can hydrate in `next dev`
  allowedDevOrigins: ["*.trycloudflare.com"],
  outputFileTracingIncludes: {
    "/*": ["./src/generated/prisma/**/*"],
  },
};

export default nextConfig;
