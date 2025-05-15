import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth"
import NextAuth from "next-auth";

export const authConfig_M = { providers: [CredentialsProvider] } satisfies NextAuthConfig
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig_M);