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
  async headers() {
    return [
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
