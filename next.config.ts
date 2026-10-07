import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "puppeteer",
    "puppeteer-core",
    "@sparticuz/chromium",
  ],
  // The default bottom-left position sits directly on top of the sidebar's
  // bottom controls (identity block, log out) and physically blocks clicks
  // in dev mode — move it out of the sidebar's way.
  devIndicators: {
    position: "bottom-right",
  },
  // The agreement pages moved under /agreements (Phase E). Old links —
  // including those in messages already in the outbox — keep working.
  async redirects() {
    return [
      { source: "/documents/:id", destination: "/agreements/:id", permanent: true },
      { source: "/documents/:id/countersign", destination: "/agreements/:id/countersign", permanent: true },
      { source: "/create", destination: "/agreements/new", permanent: true },
      { source: "/activity", destination: "/audit", permanent: true },
    ];
  },
  async headers() {
    return [
      // The whole demo stays out of search engines (page metadata and
      // robots.txt say the same).
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/s/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
