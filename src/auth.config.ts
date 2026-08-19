import type { NextAuthConfig } from "next-auth";

// Split from auth.ts so middleware (Edge runtime) never bundles Prisma /
// pg (a Node-only driver) — middleware only needs to read the
// already-signed JWT, not touch the database.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
  },
} satisfies NextAuthConfig;
