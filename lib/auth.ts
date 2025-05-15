import type { NextAuthConfig, Session, User as NextAuthUser } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { users as usersTable, accounts as accountsTable } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { verifyPassword } from "@/utils/password";
import { signInSchema } from "./zod.auth";
import NextAuth from "next-auth";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getClientIP } from "@/utils/client-ip";
import { typedDb } from "@/lib/utils.server";

const redis = Redis.fromEnv();
const loginRatelimiter = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, "1m"),
  prefix: "@upstash/ratelimit_login_authorize",
});

export interface CustomUser extends NextAuthUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "user" | "admin";
  username: string;
}

// This is the type available on the client via useSession() and server via auth()
export interface CustomSession extends Session {
  user: CustomUser;
}


export const authConfig = {
  adapter: DrizzleAdapter(typedDb, {
    usersTable: usersTable,
    accountsTable: accountsTable,
  }),
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Username or Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        console.log("Authorize: Credentials received", credentials);
        const parsedCredentials = await signInSchema.safeParseAsync(credentials);
        if (!parsedCredentials.success) {
          console.warn("[Auth.ts] Authorize: Invalid credentials format", parsedCredentials.error.flatten());
          return null;
        }
        const { identifier, password } = parsedCredentials.data;
        const ip = getClientIP(req);
        const rateLimitKey = `login_attempt_${identifier.toLowerCase()}_${ip}`;
        const { success, limit, remaining, reset } = await loginRatelimiter.limit(rateLimitKey);

        if (!success) {
          console.warn(`[Auth.ts] Authorize: Rate limit exceeded for identifier "${identifier}" from IP "${ip}". Remaining: ${remaining}, Reset: ${new Date(reset).toISOString()}`);
          throw new Error("TooManyRequests");
        }

        const user = await typedDb.query.users.findFirst({
          where: or(
            eq(usersTable.email, (identifier).toLowerCase()),
            eq(usersTable.username, (identifier))
          ),
          // Select all columns needed for password verification and to build the Auth.js User object
          columns: {
            id: true,
            name: true, // Needed for standard Auth.js User object
            email: true, // Needed for standard Auth.js User object
            username: true, // Custom field needed for JWT/session
            hashedPassword: true, // Needed for verification
            role: true, // Custom field needed for JWT/session
            image: true, // Needed for standard Auth.js User object
          }
        });
        if (!user || !user.hashedPassword) {
          console.log("Authorize: User not found or no hashed password.");
          return null;
        }

        const isValidPassword = await verifyPassword(
          password as string,
          user.hashedPassword
        );
        if (!isValidPassword) {
          console.log("Authorize: Invalid password.");
          return null;
        }

        // If authentication is successful, return a User object.
        // This object is passed to the `jwt` callback.
        // It should contain at least 'id', and ideally 'name', 'email', 'image'.
        // Include your custom fields ('role', 'username') here as they will be
        // added to the token in the `jwt` callback.
        const authorizedUser: CustomUser = {
          id: user.id,
          name: user.name || user.username,
          email: user.email,
          image: user.image,
          role: user.role,
          username: user.username,
        };

        console.log(`Authorize: User ${user.id} (${user.username}) authenticated successfully.`);
        return authorizedUser; // Auth.js serializes this into the JWT payload
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account, profile, trigger, session }) {
      if (user) {
        token.sub = user.id; // JWT standard: subject (user ID) - Auth.js usually sets this automatically from user.id
        if (user.email) token.email = user.email;
        if (user.name) token.name = user.name;
        if (user.image) token.picture = user.image;
        // Cast 'user' to CustomUser to safely access custom properties like 'role' and 'username'
        token.role = (user as CustomUser).role;
        token.username = (user as CustomUser).username;
      }

      return token;
    },

    async session({ session, token }) {
      // This callback runs whenever a session is checked (e.g., via useSession() on client, or auth() on server)
      // It takes the JWT payload ('token') and populates the client-side (or server-side) session object.
      // Ensure your custom fields from the token are added to session.user.

      if (session.user && token.sub) {
        // Map standard JWT claims back to session.user
        (session.user as unknown as CustomUser).id = token.sub as string;
        if (token.email) (session.user as unknown as CustomUser).email = token.email as string;
        if (token.name) (session.user as unknown as CustomUser).name = token.name as string;
        if (token.picture) (session.user as unknown as CustomUser).image = token.picture as string;

        // Map your custom claims from the token to session.user
        if (token.role) (session.user as unknown as CustomUser).role = token.role as "user" | "admin";
        if (token.username) (session.user as unknown as CustomUser).username = token.username as string;

        // If you added accessToken to token in jwt callback, add it to session:
        // if (token.accessToken) (session as CustomSession).accessToken = token.accessToken as string;
      } else {
        console.warn("Session callback: session.user or token.sub missing.", { sessionUser: session.user, tokenSub: token.sub });
      }

      // Return the session object with your custom user type
      return session as unknown as CustomSession;
    },

    async authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith('/admin') && (auth?.user as CustomUser)?.role !== 'admin') {
        return false;
      }
      return true;
    }
  },

  pages: {
    signIn: "/u",
    error: `/u/auth?error=${encodeURIComponent("CredentialsSignin")}`,
    // newUser: '/u/auth?mode=signup', 
  },

  debug: process.env.NODE_ENV === "development",
  secret: process.env.AUTH_SECRET,

  // cookies: { ... }

  events: {
    async signIn(message) { console.log("User signed in:", message.user.id); },
    async signOut(message) {
      if ('session' in message) {
        console.log("User signed out:", message?.session?.userId);
      } else {
        console.log("User signed out, but no session available");
      }
    },
    async createUser(message) { console.log("User created:", message.user.id); },
  }

} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);