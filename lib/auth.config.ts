import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth"
import NextAuth from "next-auth";
import { CustomSession, CustomUser } from "./auth";

export const authConfig_M = {
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
        token.role = (user as CustomUser).role;
        token.username = (user as CustomUser).username;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.sub) (session.user as unknown as CustomUser).id = token.sub;
        if (token.email) (session.user as unknown as CustomUser).email = token.email;
        if (token.name) (session.user as unknown as CustomUser).name = token.name;
        if (token.picture) (session.user as unknown as CustomUser).image = token.picture;

        if (token.role) (session.user as unknown as CustomUser).role = token.role as "user" | "admin";
        if (token.username) (session.user as unknown as CustomUser).username = token.username as string;
      }
      return session as unknown as CustomSession;
    },
  },
  providers: [CredentialsProvider],
  secret: process.env.AUTH_SECRET,
} satisfies NextAuthConfig
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig_M);