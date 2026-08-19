import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Lightweight instance: Edge-safe, no Credentials provider / Prisma import,
// so it can run here without pulling in the pg driver.
export default NextAuth(authConfig).auth;

export const config = {
  // Protects everything except: the public signing room, the PDF endpoint
  // it embeds (also used internally, so it can't require auth), the login
  // page itself, NextAuth's own routes, and static assets.
  matcher: [
    "/((?!api/auth|api/documents|sign|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
