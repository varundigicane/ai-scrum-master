import type { NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      companyId: string;
    };
  }

  interface User {
    role: Role;
    companyId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    companyId: string;
  }
}

export type AppJWT = JWT;

export const authConfig = {
  providers: [],
  // Required behind Railway / reverse proxies
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (
        pathname.startsWith("/status") ||
        pathname.startsWith("/api/status") ||
        pathname.startsWith("/api/cron") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/health") ||
        pathname === "/login"
      ) {
        return true;
      }
      if (pathname.startsWith("/dashboard") || pathname === "/") {
        return !!auth?.user;
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.companyId = user.companyId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.email = token.email ?? "";
        session.user.name = token.name ?? "";
        session.user.role = token.role;
        session.user.companyId = token.companyId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
