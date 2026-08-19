import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      senderId: string;
      senderName: string;
      senderRole: string;
    };
  }
}

type AppJWT = {
  senderId: string;
  senderName: string;
  senderRole: string;
  sub?: string;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { sender: true },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          senderId: user.senderId,
          senderName: user.sender.name,
          senderRole: user.sender.role,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        const appUser = user as { senderId: string; senderName: string; senderRole: string };
        (token as AppJWT).senderId = appUser.senderId;
        (token as AppJWT).senderName = appUser.senderName;
        (token as AppJWT).senderRole = appUser.senderRole;
      }
      return token;
    },
    async session({ session, token }) {
      const appToken = token as AppJWT;
      session.user.id = token.sub!;
      session.user.senderId = appToken.senderId;
      session.user.senderName = appToken.senderName;
      session.user.senderRole = appToken.senderRole;
      return session;
    },
  },
});
