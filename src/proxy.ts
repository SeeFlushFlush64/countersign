import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Lightweight instance: Edge-safe, no Credentials provider / Prisma import,
// so it can run here without pulling in the pg driver.
export default NextAuth(authConfig).auth;

export const config = {
  // Protects everything except: the public marketing homepage (root path
  // only — /documents is the protected dashboard), the public signing
  // room, the PDF endpoint it embeds (also used internally, so it can't
  // require auth), the login page itself, NextAuth's own routes, favicon/
  // icon/manifest metadata files, and static assets.
  matcher: [
    "/((?!api/auth|api/documents|sign|login|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|assets|$).*)",
  ],
};
