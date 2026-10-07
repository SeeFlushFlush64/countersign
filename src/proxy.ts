import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Lightweight instance: Edge-safe, no Credentials provider / Prisma import,
// so it can run here without pulling in the pg driver.
export default NextAuth(authConfig).auth;

export const config = {
  // Protects everything except: the public landing page (exactly "/"), the
  // counterparty's signing room and its link-scoped PDF (/s/<token>...), the
  // login page, NextAuth's own routes, and static assets and app icons.
  // Internal pages and the company PDF route also verify the session
  // themselves, so loosening this matcher cannot expose them.
  matcher: [
    "/((?!api/auth|s/|login|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).+)",
  ],
};
