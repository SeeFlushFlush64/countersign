import type { MetadataRoute } from "next";

// The demo is not for search engines: nothing is to be crawled (pages also
// send noindex, in their metadata and an X-Robots-Tag header).
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
