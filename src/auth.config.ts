import type { NextAuthConfig } from "next-auth";

// Split from auth.ts so middleware (Edge runtime) never bundles Prisma /
// better-sqlite3 (a native Node addon) — middleware only needs to read the
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
