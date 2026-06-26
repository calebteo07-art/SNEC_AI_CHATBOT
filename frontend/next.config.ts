import type { NextConfig } from "next";

/** FastAPI origin the Next server proxies to. In every current topology
 *  (dev, Render, Docker single container) both processes share a host. */
const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

const isProd = process.env.NODE_ENV === "production";

/* Dev builds need Next's HMR/eval runtime, so the CSP ships only in
 * production. Fonts are self-hosted via next/font — no external hosts. */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  /* v1 (Vite) never ran StrictMode; the v1 WebGL scenes (gazeScene dispose/
   * re-init) aren't double-effect safe. Phase 3 replaces them with R3F views,
   * which are — revisit then. */
  reactStrictMode: false,
  /* Next 16 blocks dev resources from origins other than the bind host —
   * local testing reaches the dev server as 127.0.0.1 as well as localhost. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  /* All imagery is local, pre-sized AI-generated assets — skip the optimizer
   * (and sharp's memory footprint on the 512MB Render runtime). */
  images: { unoptimized: true },

  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` },
      /* Render's keep-alive cron pings /health; load balancers probe
       * /health/ready. Both must reach FastAPI — the :path* form also covers
       * the exact /health match. */
      { source: "/health", destination: `${API_ORIGIN}/health` },
      { source: "/health/:path*", destination: `${API_ORIGIN}/health/:path*` },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(isProd ? [{ key: "Content-Security-Policy", value: CSP }] : []),
        ],
      },
      {
        /* Stale service workers make deploys invisible. */
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
