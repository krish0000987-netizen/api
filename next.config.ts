import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Freebuff preview reaches the dev server via http://127.0.0.1:3001.
  // Next.js 15 dev-mode blocks cross-origin dev resources (HMR, fonts,
  // some chunks) unless the origin is allowed — without this, client
  // hydration silently fails in the preview browser.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
