import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native HTTP client used to read classified listings. Keep it out of the server bundle.
  serverExternalPackages: ["impit", "undici"],
  // Allow Cloudflare quick tunnels so shared preview URLs can hydrate in `next dev`
  allowedDevOrigins: ["*.trycloudflare.com"],
  outputFileTracingIncludes: {
    "/*": ["./src/generated/prisma/**/*"],
  },
};

export default nextConfig;
